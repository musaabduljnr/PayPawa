# PayPawa — Security Incident Response Runbooks
**Phase 12D: Security & Environment Hardening**  
**Classification:** Internal Confidential / Operational Security Standard

---

## 1. Runbook 1: Exposed API Key / Secret Rotation

### Detection
- Automated secret scanner alert (e.g., GitHub Secret Scanning, TruffleHog, GitGuardian).
- External notification from vendor (Paystack, SquadCo, Supabase, Google Cloud).
- Anomalous traffic patterns using merchant credentials from unrecognized IP addresses.

### Immediate Containment
1. **Quarantine Key**: In vendor dashboard (Paystack / SquadCo / Supabase / Google AI), generate an immediate replacement secret key.
2. **Revoke Exposed Key**: Transition the compromised key to inactive/revoked status immediately.
3. **Purge Cache & Bundles**: Invalidate Edge Function secret caches via `supabase secrets set ...`.

### Credential Rotation
- **Supabase Service Role Key**: Rotate in Supabase dashboard > Project Settings > API. Update all production environment secrets.
- **Paystack Secret Key**: Rotate in Paystack Dashboard > Settings > API Keys & Webhooks.
- **SquadCo Secret Key**: Rotate in SquadCo Merchant Portal > Developer Tools.
- **Gemini API Key**: Rotate in Google Cloud Console > Credentials.

### Affected-Resource Identification & Transaction Review
- Query `audit_logs`, `payment_attempts`, and `electricity_transactions` created between estimated exposure time and revocation.
- Flag any transactions initiated from untrusted IPs or outside standard application routes.

### User Communication & Evidence Preservation
- Export full audit logs covering the incident window and hash them with SHA-256 for chain of custody.
- If customer funds or data were unaffected, record in internal incident repository; if customer impact occurred, notify affected users within statutory timelines (e.g. NDPR / 72 hours).

### Recovery & Post-Incident Review
- Deploy verified application build without references to rotated secrets.
- Conduct root-cause analysis (RCA) and enhance pre-commit secret scanning hooks.

---

## 2. Runbook 2: Compromised Admin Account

### Detection
- Failed MFA or abnormal login geo-location alerts in `audit_logs`.
- Unauthorized role assignments or permission elevation events in `pending_governance_approvals`.
- Simultaneous active sessions on an administrative account from geographically distant IPs.

### Immediate Containment
1. Execute emergency staff suspension:
   ```sql
   UPDATE public.staff_members
   SET status = 'SUSPENDED',
       updated_at = NOW()
   WHERE user_id = '<COMPROMISED_USER_ID>';
   ```
2. Revoke active auth tokens via Supabase Auth Admin API:
   ```ts
   await supabase.auth.admin.signOut('<COMPROMISED_USER_ID>', 'all');
   ```

### Affected-Resource Identification & Transaction Review
- Review all actions performed by `COMPROMISED_USER_ID` in `audit_logs`:
  ```sql
  SELECT * FROM public.audit_logs 
  WHERE user_id = '<COMPROMISED_USER_ID>' 
  ORDER BY created_at DESC;
  ```
- Inspect modifications to user wallets, meters, settings, or approvals.

### Evidence Preservation & Recovery
- Capture snapshot of `audit_logs` and `pending_governance_approvals`.
- Revert unauthorized changes via verified transaction rollbacks.
- Reset credentials and re-enroll physical hardware MFA before restoring access.

---

## 3. Runbook 3: Unauthorized Wallet Activity / Double-Spending

### Detection
- Automated ledger integrity check failure (`verify_wallet_ledger_integrity(...)` returns discrepancies).
- Rapid high-velocity wallet funding attempts triggering rate limits (`check_rate_limit`).
- Multiple debit attempts referencing the same transaction reference or idempotency key.

### Immediate Containment
1. Freeze affected wallet account:
   ```sql
   UPDATE public.wallet_accounts
   SET is_locked = TRUE, updated_at = NOW()
   WHERE id = '<WALLET_ID>' OR user_id = '<USER_ID>';
   ```
2. Invalidate open client sessions for the user.

### Transaction Review & Reconciliation
- Execute ledger verification:
  ```sql
  SELECT * FROM public.verify_wallet_ledger_integrity('<USER_ID>');
  ```
- Compare total credits (`funding`, `refund_credit`) against total debits (`purchase_debit`).
- If balance drift is confirmed, reconcile using `reconcile_wallet_balance_from_ledger`:
  ```sql
  SELECT * FROM public.reconcile_wallet_balance_from_ledger('<USER_ID>', 'Security containment reconciliation');
  ```

### Evidence Preservation & Communication
- Preserve all rows from `wallet_accounts`, `wallet_transactions`, and `payment_attempts`.
- Inform customer support to communicate account hold status to user pending review.

---

## 4. Runbook 4: Suspicious Electricity Purchases / Forged Tokens

### Detection
- Duplicate token generation alerts on identical meters within short intervals.
- `finalize_electricity_purchase_success` invocation without corresponding SquadCo vendor reference.
- Token string format anomalies (not matching STS 20-digit standards).

### Immediate Containment
1. Flag transaction status as `disputed` or `flagged_fraud`:
   ```sql
   UPDATE public.electricity_transactions
   SET status = 'failed', error_message = 'Security hold: Suspicious token generation'
   WHERE id = '<TRANSACTION_ID>';
   ```
2. Temporarily pause automated purchase finalization for the target meter.

### SquadCo Verification
- Requery transaction with SquadCo using `provider_transaction_id`:
  ```ts
  const status = await squadProvider.queryTransaction({ providerReference, internalReference });
  ```
- If SquadCo has no record of the vend, confirm counterfeit token exploit attempt and log security incident.

---

## 5. Runbook 5: Database Breach / Data Exposure

### Detection
- Abnormal data egress volume detected on database pooler.
- Unscheduled bulk queries against `profiles`, `meters`, or `wallet_accounts`.
- External alert or public disclosure of database dump.

### Immediate Containment
1. Reset database connection pooling credentials and terminate existing connections:
   - Change database password in Supabase Dashboard.
   - Kill active non-super connections via `pg_terminate_backend`.
2. Restrict database network access to authorized IPs and VPC peering.

### Affected-Resource Identification
- Identify tables touched during the incident window.
- Determine scope of affected PII (names, emails, meter numbers, transaction history). Note: Passwords are salt-hashed via Supabase Auth and payment cards are never stored.

### Statutory Communication & Recovery
- Assemble executive incident team.
- Notify Nigeria Data Protection Commission (NDPC) within statutory timeframe (72 hours).
- Issue notification to affected users with guidance on credential security.

---

## 6. Runbook 6: Leaked User Information (PII)

### Detection
- Customer report of unauthorized data disclosure.
- Log inspection reveals unredacted user information in external monitoring dashboards.

### Immediate Containment
1. Scrub monitoring logs (Sentry, Papertrail, Logflare) of raw records containing PII.
2. Invalidate any leaked session tokens or temporary verification links.

### Redaction Hardening
- Audit `LoggerService` redaction filters to ensure `phone`, `email`, `meter_number`, and `address` fields are strictly sanitized before dispatch.

---

## 7. Runbook 7: Malicious File Upload Attempt

### Detection
- `FileSecurityService` rejection alert (`INVALID_SIGNATURE`, `FILE_TOO_LARGE`, or `MALICIOUS_PATH`).
- File upload attempted with mismatched MIME type / executable payload (polyglot files).

### Immediate Containment
1. If file was staged in temporary storage, purge immediately:
   ```ts
   await supabase.storage.from('temp_uploads').remove([filePath]);
   ```
2. Blacklist client IP address in rate limiter for 24 hours:
   ```sql
   INSERT INTO public.rate_limits (identifier, action, window_start, count)
   VALUES ('<ATTACKER_IP>', 'file_upload', NOW(), 999);
   ```

### Investigation
- Inspect uploaded binary header to identify payload classification (executable, script, shell).
- Verify that storage bucket policies prevent direct public execution of uploaded assets.

---

## 8. Runbook 8: SquadCo Credential Compromise

### Detection
- Unauthorized utility vending requests originating from unknown IP addresses against PayPawa's SquadCo merchant account.
- Discrepancies between SquadCo balance and PayPawa recorded purchases.

### Immediate Containment
1. Access SquadCo Merchant Dashboard immediately.
2. Regenerate `SQUAD_SECRET_KEY` and update webhook signing secret.
3. Update server secrets:
   ```bash
   supabase secrets set SQUAD_SECRET_KEY="new_squad_secret_key"
   ```

### Reconciliation
- Pull full transaction report from SquadCo portal.
- Match all transactions against `electricity_transactions` by `reference` and `provider_transaction_id`.
- Report fraudulent charges to SquadCo fraud desk for reversal.

---

## 9. Runbook 9: Abnormal API Traffic / Distributed Denial of Service (DDoS)

### Detection
- Elevated latency (> 2000ms) on API endpoints.
- Spike in 429 Too Many Requests responses.
- Database connection pool exhaustion (`53300: too many connections`).

### Immediate Containment
1. Activate Cloudflare / CDN Under Attack Mode and edge WAF rules.
2. Lower rate limiting thresholds in `RateLimiterService` and `check_rate_limit`.
3. Enable edge IP throttling on endpoints `/auth/v1/*` and `/rest/v1/*`.

### Recovery
- Monitor throughput until request volume normalizes.
- Scale connection pool size or spin up read replicas if required.

---

## 10. Runbook 10: Row Level Security (RLS) Policy Failure

### Detection
- Security test suite failure on cross-user data isolation tests.
- Supabase linter warning: `table_rls_disabled` or `policy_overly_permissive`.
- User reports seeing another customer's meter, wallet, or notification.

### Immediate Containment
1. Re-enable RLS on affected table immediately:
   ```sql
   ALTER TABLE public.<AFFECTED_TABLE> ENABLE ROW LEVEL SECURITY;
   ```
2. Apply emergency lockdown policy:
   ```sql
   DROP POLICY IF EXISTS "Emergency Lockdown" ON public.<AFFECTED_TABLE>;
   CREATE POLICY "Emergency Lockdown" ON public.<AFFECTED_TABLE>
   FOR ALL USING (current_setting('role', true) = 'service_role');
   ```

### Remediation & Verification
- Reapply standard user-isolated policy (`auth.uid() = user_id`).
- Execute Phase 12D automated security test suite to verify 100% boundary isolation.
- Audit data access logs during the window to ascertain whether unauthorized data read occurred.
