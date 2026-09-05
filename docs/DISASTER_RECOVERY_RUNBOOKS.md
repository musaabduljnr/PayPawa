# PayPawa — Disaster Recovery & Operational Runbooks

This document details official operational procedures for containing, recovering from, and auditing production incidents across the PayPawa infrastructure.

---

## Runbook Index
1. [DR-01: Accidental User Deletion](#dr-01-accidental-user-deletion)
2. [DR-02: Accidental Meter Deletion](#dr-02-accidental-meter-deletion)
3. [DR-03: Wallet Balance Inconsistency](#dr-03-wallet-balance-inconsistency)
4. [DR-04: Corrupted Transaction Records](#dr-04-corrupted-transaction-records)
5. [DR-05: Failed Database Migration](#dr-05-failed-database-migration)
6. [DR-06: Supabase Outage](#dr-06-supabase-outage)
7. [DR-07: Lost Environment Variables](#dr-07-lost-environment-variables)
8. [DR-08: Compromised Credentials](#dr-08-compromised-credentials)
9. [DR-09: SquadCo Timeout During Database Outage](#dr-09-squadco-timeout-during-database-outage)
10. [DR-10: Duplicate Payment Webhook](#dr-10-duplicate-payment-webhook)
11. [DR-11: Broken Production Deployment](#dr-11-broken-production-deployment)
12. [DR-12: Ledger Mismatch](#dr-12-ledger-mismatch)
13. [DR-13: Lost Consumption Data](#dr-13-lost-consumption-data)
14. [DR-14: Lost Notification Data](#dr-14-lost-notification-data)
15. [DR-15: Unauthorized Admin Action](#dr-15-unauthorized-admin-action)

---

### DR-01: Accidental User Deletion
- **Detection**: Customer reports sudden login failure; query to `auth.users` returns 0 rows while transaction references exist.
- **Immediate Containment**: Revoke active session tokens, freeze any orphaned wallet account via `is_locked = TRUE`.
- **Responsible Role**: Lead DevOps & Database Reliability Engineer.
- **Recovery Steps**:
  1. Retrieve deleted user UUID from immutable `audit_logs` or `wallet_transactions`.
  2. Inspect latest backup file (`backups/paypawa_backup_*.json`).
  3. Extract user profile and associated meters.
  4. Restore auth user record via Supabase Auth Admin API (`supabase.auth.admin.createUser({ id: <UUID>, ... })`).
  5. Restore `public.profiles` row preserving exact UUID to re-link foreign keys.
  6. Unlock wallet account.
- **Validation**: Authenticate user via staging/test token; confirm wallet balance and meter linkage are restored.
- **User Communication**: "Your account access has been successfully restored. Your balance and meters are completely intact."
- **Audit**: Log event in `public.audit_logs` under action `'USER_RESTORE_RECOVERY'`.
- **PIR**: Review cascade delete constraints on `public.profiles`.

---

### DR-02: Accidental Meter Deletion
- **Detection**: User reports saved meter disappeared; active transactions point to orphaned `meter_id`.
- **Immediate Containment**: Prevent new purchases targeting the deleted meter reference.
- **Responsible Role**: Support Operations Lead & Database Administrator.
- **Recovery Steps**:
  1. Locate meter record from `backups/paypawa_backup_*.json` or historical `electricity_transactions`.
  2. Re-insert meter into `public.meters` preserving `user_id`, `meter_number`, `disco_code`, and `meter_type`.
  3. Update `is_active = TRUE` if the user has no other active meter.
- **Validation**: Query `public.meters` for `user_id`; verify home dashboard renders meter status and past consumption.
- **User Communication**: "Your meter has been restored to your PayPawa account."
- **Audit**: Record administrative insert in `public.audit_logs`.

---

### DR-03: Wallet Balance Inconsistency
- **Detection**: `DisasterRecoveryService.checkLedgerIntegrity()` or alert `ledger.inconsistency_detected` fires.
- **Immediate Containment**: Lock target wallet via `UPDATE public.wallet_accounts SET is_locked = TRUE WHERE id = ...`.
- **Responsible Role**: Finance Manager & Database Reliability Engineer.
- **Recovery Steps**:
  1. Execute `SELECT * FROM public.verify_wallet_ledger_integrity(p_wallet_id := '<WALLET_UUID>');`.
  2. Review drift: `stored_balance_kobo` vs `ledger_sum_kobo`.
  3. Replay transactions from `public.wallet_transactions` to trace uncommitted mutations.
  4. Execute audited correction: `SELECT public.reconcile_wallet_balance_from_ledger('<WALLET_UUID>', 'System drift correction', 'INC-DR-03');`.
  5. Unlock wallet: `UPDATE public.wallet_accounts SET is_locked = FALSE WHERE id = ...`.
- **Validation**: Re-run `verify_wallet_ledger_integrity`; confirm `is_consistent = TRUE` and `drift_kobo = 0`.
- **User Communication**: "We have synchronized your wallet balance with your authoritative transaction ledger."
- **Audit**: Automatic entry recorded in `public.audit_logs` via `reconcile_wallet_balance_from_ledger`.

---

### DR-04: Corrupted Transaction Records
- **Detection**: Transaction in `processing` state with missing tokens or invalid metadata JSON.
- **Immediate Containment**: Mark transaction `status = 'unknown'`, block automatic retry.
- **Responsible Role**: Backend Engineer & Support Operations.
- **Recovery Steps**:
  1. Extract internal reference (`reference`) and `provider_transaction_id`.
  2. Query SquadCo status: `GET /vending/transactions?reference={queryRef}`.
  3. If SquadCo vended token successfully: execute `public.finalize_electricity_purchase_success(...)`.
  4. If SquadCo indicates failure: execute `public.finalize_electricity_purchase_failure(...)` which refunds wallet.
- **Validation**: Confirm transaction has terminal status (`successful` or `reversed`) with verified token or refund ledger record.
- **User Communication**: Deliver receipt with token or refund confirmation notification.
- **Audit**: Log reconciliation event in `public.audit_logs`.

---

### DR-05: Failed Database Migration
- **Detection**: Migration tool or CI/CD pipeline aborts with SQL error.
- **Immediate Containment**: Stop deployment pipeline; do NOT run partial SQL fixes directly in production without a script.
- **Responsible Role**: DevOps Lead.
- **Recovery Steps**:
  1. Inspect failed migration file and error output.
  2. If running within transaction block: verify automatic rollback completed.
  3. If partial DDL executed: write forward-fix migration (`YYYYMMDD00000X_fix_...sql`).
  4. Test forward-fix in local sandbox environment first.
  5. Apply forward-fix to production database.
- **Validation**: Run `node scripts/test_phase12c_disaster_recovery_runner.mjs`.
- **User Communication**: None required if zero downtime maintenance window.
- **Audit**: Record migration execution timestamp and hash.

---

### DR-06: Supabase Outage
- **Detection**: Health check `checkReadiness()` reports `database: 'unhealthy'`; HTTP 500/503 errors on mobile client.
- **Immediate Containment**: Mobile app displays offline / retry screen via `AppErrorBoundary` and status banners; client purchase mutex blocks double-submits.
- **Responsible Role**: Senior DevOps & Lead Architect.
- **Recovery Steps**:
  1. Monitor Supabase Status page (`status.supabase.com`) for regional AWS EU-West-2 disruptions.
  2. If outage exceeds 30 minutes: initiate standby recovery instance using latest verified snapshot (`backups/paypawa_backup_*.json`).
  3. Update `EXPO_PUBLIC_SUPABASE_URL` in DNS or environment configurations.
- **Validation**: Execute readiness probe `HealthCheckService.checkReadiness()`.
- **User Communication**: Broadcast in-app banner: "PayPawa is experiencing network maintenance. All funds and transactions are secure."

---

### DR-07: Lost Environment Variables
- **Detection**: Services throw `Missing Supabase URL or Key in environment`.
- **Immediate Containment**: Halt deployment; avoid committing placeholder keys.
- **Responsible Role**: Security Officer & DevOps Engineer.
- **Recovery Steps**:
  1. Consult encrypted offsite secrets vault (1Password / AWS Secrets Manager).
  2. Restore `.env` template from `docs/SECRETS_STORAGE_RECOVERY.md`.
  3. Re-inject `SUPABASE_SERVICE_ROLE_KEY`, `SQUAD_SECRET_KEY`, and `PAYSTACK_SECRET_KEY`.
- **Validation**: Run `node scripts/backup_database.mjs` to confirm authenticated database and provider connectivity.
- **Audit**: Record configuration recovery incident.

---

### DR-08: Compromised Credentials
- **Detection**: Unrecognized API calls or security alert from SquadCo / Paystack / Supabase.
- **Immediate Containment**:
  1. Immediately revoke compromised secret keys in provider portals (SquadCo Dashboard / Paystack Dashboard).
  2. Temporarily set `provider_health_telemetry.status = 'MAINTENANCE'`.
- **Responsible Role**: Chief Information Security Officer (CISO) & DevOps Lead.
- **Recovery Steps**:
  1. Generate new API keys in SquadCo and Paystack developer settings.
  2. Rotate Supabase `service_role` JWT key via Supabase Project Settings.
  3. Update environment secrets in production hosting.
  4. Audit all transactions occurring during the exposure window.
- **Validation**: Execute test lookup with new credentials; confirm old keys return HTTP 401.
- **Audit**: Full security incident report filed in `public.audit_logs`.

---

### DR-09: SquadCo Timeout During Database Outage
- **Detection**: SquadCo vend was initiated, but Supabase dropped offline before `finalize_electricity_purchase_success` executed.
- **Immediate Containment**: When database recovers, transaction will remain in `processing` or `unknown`.
- **Responsible Role**: Database Reliability Engineer & Finance Lead.
- **Recovery Steps**:
  1. Run `SELECT * FROM public.get_unreconciled_squad_transactions(p_older_than_minutes := 0);`.
  2. For each transaction, execute `ReconciliationService.reconcileTransaction(tx.id)`.
  3. Requery retrieves token and executes atomic finalization.
- **Validation**: Confirm `status = 'successful'` and token is delivered to customer notifications.
- **Audit**: Log reconciliation action in `public.audit_logs`.

---

### DR-10: Duplicate Payment Webhook
- **Detection**: Paystack emits identical `charge.success` webhook event multiple times.
- **Immediate Containment**: Built-in idempotency key check in `payment_attempts` and `credit_wallet_from_payment` detects `status = 'successful'`.
- **Responsible Role**: Backend Engineer.
- **Recovery Steps**:
  1. System checks `public.payment_attempts` WHERE `reference = p_reference`.
  2. If status is already `successful`, stored procedure immediately returns `status: 'already_credited'` without crediting wallet.
  3. Log structured warning: `webhook.duplicate_detected`.
- **Validation**: Confirm wallet received exactly one credit for the transaction.
- **Audit**: Recorded in `public.audit_logs`.

---

### DR-11: Broken Production Deployment
- **Detection**: High volume of rendering crashes captured by `AppErrorBoundary`.
- **Immediate Containment**: Users see "Something went wrong" with "Reload PayPawa" button; white screen prevented.
- **Responsible Role**: Mobile Release Engineer.
- **Recovery Steps**:
  1. Check EAS / Expo deployment dashboard.
  2. Roll back OTA update via `eas update --rollback`.
  3. If native binary issue: publish hotfix build immediately.
- **Validation**: Verify error rates drop to 0% in `LoggerService.getRecentLogs()`.
- **User Communication**: In-app prompt to restart the application.

---

### DR-12: Ledger Mismatch
- **Detection**: Sum of `wallet_transactions` does not equal platform wallet liability in `admin_get_finance_summary()`.
- **Immediate Containment**: Freeze wallet adjustment capabilities for non-superusers.
- **Responsible Role**: Finance Manager & Lead Database Engineer.
- **Recovery Steps**:
  1. Execute `SELECT * FROM public.verify_wallet_ledger_integrity();`.
  2. Identify specific wallets with non-zero drift.
  3. Reconstruct account timeline by ordering `wallet_transactions` by `created_at ASC`.
  4. Apply compensating adjustments via `reconcile_wallet_balance_from_ledger()`.
- **Validation**: Verify zero drift across all accounts.
- **Audit**: Document adjustment reference in finance audit book.

---

### DR-13: Lost Consumption Data
- **Detection**: Consumption charts in insights screen show empty intervals despite active meter.
- **Immediate Containment**: No financial risk; non-blocking.
- **Responsible Role**: Data Engineer.
- **Recovery Steps**:
  1. Query `public.electricity_transactions` WHERE `meter_id = ...` AND `status = 'successful'`.
  2. Rebuild `consumption_records` from successful purchase rows (`units_kwh` and `completed_at`).
  3. Trigger `ConsumptionAnalyticsService.refreshAnalytics(userId, meterId)`.
- **Validation**: Insights screen displays refreshed daily usage and burn rate.
- **Audit**: Log `'CONSUMPTION_ANALYTICS_REBUILT'`.

---

### DR-14: Lost Notification Data
- **Detection**: Notifications table corrupted or empty.
- **Immediate Containment**: Non-financial; customer wallet and meters unaffected.
- **Responsible Role**: Backend Support Engineer.
- **Recovery Steps**:
  1. Restore `public.notifications` from latest backup snapshot.
  2. For missing recent purchases: query `electricity_transactions` in last 24h and re-emit purchase notifications with deduplication keys.
- **Validation**: User opens notifications screen and views transaction history.
- **Audit**: Log recovery event.

---

### DR-15: Unauthorized Admin Action
- **Detection**: Audit log shows high-value wallet adjustment or role escalation without approval.
- **Immediate Containment**:
  1. Immediately deactivate offending staff account: `UPDATE public.staff_members SET is_active = FALSE WHERE id = ...`.
  2. Revoke administrative session.
  3. Lock affected customer wallets.
- **Responsible Role**: Security Officer & Executive Management.
- **Recovery Steps**:
  1. Query `public.audit_logs` for all actions performed by staff member UUID.
  2. Revert unauthorized adjustments via compensating ledger transactions.
  3. Review access logs and notify affected customers.
- **Validation**: Confirm staff account is disabled and balances restored to pre-incident state.
- **Audit**: Preserve audit log records for legal and compliance review.
