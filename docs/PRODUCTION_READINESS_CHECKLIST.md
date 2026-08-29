# Production Readiness & Deployment Checklist

Use this checklist to ensure all production configuration, security measures, and verification routines are completed before launching the Smart Electricity application.

---

## 1. Environment Variables & Keys

- [ ] **Supabase Service Key**: Verify `SUPABASE_SERVICE_ROLE_KEY` is loaded securely on the backend server environment and NEVER included in the Expo React Native app bundle.
- [ ] **Paystack Webhook Secret**: Ensure `PAYSTACK_WEBHOOK_SECRET` is configured on the backend server environment. It must match the secret key shown in the Paystack developer dashboard webhooks settings.
- [ ] **Paystack Private Key**: Verify `PAYSTACK_SECRET_KEY` is set to the live production secret key.
- [ ] **VTpass Credentials**:
  - [ ] Set `VTPASS_SECRET_KEY` to the production VTpass API secret key.
  - [ ] Set `VTPASS_PUBLIC_KEY` to the production VTpass API public key.
  - [ ] Set `VTPASS_API_KEY` to the production VTpass API key.
- [ ] **Production Domain URLs**:
  - [ ] Verify Supabase redirect URL rules pointing to production deep links (e.g. `smartelec://auth-redirect`).
  - [ ] Webhook URL registered in Paystack points to `https://api.smart-electricity.app/webhooks/paystack`.

---

## 2. Supabase / Database Hardening

- [ ] **Row-Level Security (RLS)**:
  - [ ] Verify `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` is run on all tables.
  - [ ] Run cross-user IDOR query verification to confirm users cannot access other users' data.
- [ ] **Connection Pooling**:
  - [ ] Configure client connection endpoints to use the Supabase Pooler (port `6543`) with transaction mode for high-concurrency client workloads.
- [ ] **Stored Procedures**:
  - [ ] Confirm migrations `20260828000002_phase6_production_hardening.sql` are successfully applied in production.
  - [ ] Ensure DB triggers are enabled and auto-credit profiles on signup.

---

## 3. Webhook and API Security

- [ ] **HMAC Signature Check**: Webhook routes enforce Web Crypto API HMAC-SHA512 validation. All requests with missing/forged headers are blocked immediately.
- [ ] **IP Whitelisting**: Configure cloud firewall rules to only allow incoming requests from Paystack's official IP ranges for webhook routes.
- [ ] **Rate Limiting**: Apply API rate limiting on login, OTP verification, and meter verification endpoints (max 10 requests/minute per IP/user).

---

## 4. Disaster Recovery & Monitoring

- [ ] **Background Reconciliation Job**: Ensure the Cron schedule for the reconciliation job is active and runs every 5 minutes on the server.
- [ ] **Database Backups**: Set up automated daily database backups in Supabase and verify restore procedures on a staging environment.
- [ ] **Audit Alerts**: Configure alerts for any transactions stuck in `processing` for longer than 30 minutes, or if balance audit discrepancies are detected.
- [ ] **Error Reporting**: Verify Sentry/Log Rocket integration is live on both the client (React Native) and backend node services.
