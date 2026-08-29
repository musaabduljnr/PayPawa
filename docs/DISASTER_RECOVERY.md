# Disaster Recovery & System Reconciliation Manual

This manual provides procedures and operational guidelines for production incident response, manual ledger reconciliation, database recovery, and handling upstream utility switch outages.

---

## 1. Upstream Utility Provider Outages

Nigerian Discos frequently experience backend gateway timeouts, API response errors, or maintenance windows. Our transaction system is designed to **fail safely** and **reconcile asynchronously**.

### In-Flight Pending Transactions
When VTpass or another disco gateway returns a timeout (`unknown` or `pending` status):
1. The transaction is kept in the `processing` / `unknown` state.
2. The user's wallet balance is **not** refunded immediately.
3. The background **Reconciliation Cron Job** runs every 5 minutes to poll the gateway for the definitive status of all unresolved transactions.

### Manual Reconciliation Procedure
If a user contacts support claiming they were debited but did not receive a token, and the transaction is still stuck in `processing`:

1. **Verify with Gateway**:
   Query the provider's API manually using the transaction reference (e.g. `SE-YYYYMMDD-XXXXXXXX`):
   ```bash
   curl -X GET "https://api.vtpass.com/api/requery?request_id=SE-YYYYMMDD-XXXXXXXX" \
     -H "Authorization: Bearer <SECRET_KEY>"
   ```

2. **If the transaction was SUCCESSFUL at the gateway**:
   Resolve the transaction manually in the database by calling the success finalizer RPC:
   ```sql
   SELECT public.finalize_electricity_purchase_success(
     p_transaction_id := '<TRANSACTION_UUID>',
     p_provider_tx_id := '<PROVIDER_REF>',
     p_token := '<STS_TOKEN_VALUE>',
     p_units_kwh := <UNITS_VALUE>,
     p_tariff_per_kwh_kobo := <TARIFF_VALUE_KOBO>
   );
   ```

3. **If the transaction FAILED at the gateway**:
   Mark it failed and trigger the automatic wallet refund:
   ```sql
   SELECT public.finalize_electricity_purchase_failure(
     p_transaction_id := '<TRANSACTION_UUID>',
     p_failure_code := 'PROVIDER_ERROR',
     p_failure_message := 'Vending failed with provider'
   );
   ```

---

## 2. Double-Entry Ledger Audit & Discrepancy Reconciliation

Our financial architecture relies on an authoritative double-entry bookkeeping ledger in `wallet_transactions`.

### Run a Balance Audit
Execute the following query to detect any mismatch between the actual `wallet_accounts.balance_kobo` and the sum of the historical ledger entries:

```sql
SELECT 
  w.user_id,
  w.balance_kobo AS current_wallet_balance,
  COALESCE(SUM(
    CASE 
      WHEN t.type = 'credit' THEN t.amount_kobo
      WHEN t.type = 'debit' THEN -t.amount_kobo
      ELSE 0
    END
  ), 0) AS historical_ledger_sum,
  w.balance_kobo - COALESCE(SUM(
    CASE 
      WHEN t.type = 'credit' THEN t.amount_kobo
      WHEN t.type = 'debit' THEN -t.amount_kobo
      ELSE 0
    END
  ), 0) AS discrepancy_kobo
FROM public.wallet_accounts w
LEFT JOIN public.wallet_transactions t ON t.wallet_id = w.id
GROUP BY w.id, w.user_id, w.balance_kobo
HAVING w.balance_kobo <> COALESCE(SUM(
  CASE 
    WHEN t.type = 'credit' THEN t.amount_kobo
    WHEN t.type = 'debit' THEN -t.amount_kobo
    ELSE 0
  END
), 0);
```

* **If this query returns zero rows**: The system is in perfect financial alignment.
* **If it returns rows**: A discrepancy exists for that user ID.

### Fixing Balance Discrepancies
1. Freeze the affected user's wallet:
   ```sql
   UPDATE public.wallet_accounts 
   SET is_locked = true 
   WHERE user_id = '<USER_ID>';
   ```
2. Manually trace the transaction history in `wallet_transactions` and reconcile it against the Paystack and VTpass gateways.
3. Correct the balance by inserting a compensatory adjustment ledger row:
   ```sql
   INSERT INTO public.wallet_transactions (
     wallet_id, user_id, amount_kobo, type, reference, description, metadata
   ) VALUES (
     '<WALLET_ID>', '<USER_ID>', <ADJUSTMENT_AMOUNT_KOBO>, 'credit', 'ADJ-REF-001', 'Manual auditing balance correction', '{"reason": "reconciliation correction"}'
   );
   ```
4. Unlock the wallet:
   ```sql
   UPDATE public.wallet_accounts 
   SET balance_kobo = <CORRECTED_SUM>, is_locked = false 
   WHERE user_id = '<USER_ID>';
   ```

---

## 3. Database Recovery & Restore Playbook

In the event of a catastrophic failure:
1. **Identify the latest backup**: Backups are automatically run daily and stored in private GCS buckets.
2. **Restore Scheme**:
   - Restore using Supabase dashboard pg_restore or:
     ```bash
     pg_restore -h aws-0-eu-west-2.pooler.supabase.com -p 6543 -U postgres -d postgres backup.sql
     ```
3. **Verify Table Integrity**: Run tests to ensure RLS rules and triggers are fully active on all restored tables.
