# Smart Electricity — Phase 6: Production Hardening & Security Audit

This document presents a comprehensive audit of the Smart Electricity platform prior to production release. We identify and classify vulnerabilities across authentication, authorization, data integrity, payment gateways, and utility provider integrations.

---

## 1. Executive Summary

| Component | Status | Key Risk | Classification |
|---|---|---|---|
| **API Secret Management** | 🔴 Critical | VTpass secret credentials bundled in mobile application | **CRITICAL** |
| **Database RPC Authorization** | 🔴 Critical | Stored procedures lack caller verification (`auth.uid()`), allowing IDOR attacks | **CRITICAL** |
| **Webhook Processing** | 🔴 Critical | Webhook signature (`x-paystack-signature`) parsing exists but is not validated | **CRITICAL** |
| **State Finalization** | 🟡 Needs Hardening | Direct client-side updates to transaction tables fail due to missing RLS update policies | **NEEDS HARDENING** |
| **Authentication & Session** | 🟢 Safe | Supabase GoTrue handles authentication natively | **SAFE** |
| **Concurrency & Double-Spend** | 🟢 Safe | Row-locking (`FOR UPDATE`) and idempotency keys are strictly implemented in DB | **SAFE** |

---

## 2. Detailed Component Audit

### 2.1 API Secret Management & Environment Security
* **Vulnerability**: In `.env` and `VTpassProvider.ts`, the secret key `EXPO_PUBLIC_VTPASS_SECRET_KEY` is prefixed with `EXPO_PUBLIC_`.
* **Impact**: Expo bundles all environment variables prefixed with `EXPO_PUBLIC_` directly into the client-side JavaScript. Any attacker downloading the mobile app can decompile the bundle and extract the VTpass API and Secret Keys, allowing them to steal funds by making direct API calls.
* **Classification**: **CRITICAL**
* **Mitigation**: Remove the `EXPO_PUBLIC_` prefix from all secret keys. Route all provider communication (meter verification, vending, payment verification) through server-side secure endpoints or RPCs where credentials are kept hidden.

### 2.2 Database Stored Procedures (Authorization & IDOR)
* **Vulnerability**: RPC functions like `debit_wallet_for_electricity`, `credit_wallet_from_payment`, `refund_electricity_purchase`, and `execute_electricity_purchase_init` are defined with `SECURITY DEFINER` (running with elevated database privileges). However, they do not check if the calling user (`auth.uid()`) matches the `p_user_id` argument.
* **Impact**: An authenticated attacker can call these RPCs directly via the Supabase client and debit another user's wallet, refund transactions they do not own, or credit their own wallet by passing arbitrary payment references.
* **Classification**: **CRITICAL**
* **Mitigation**: Add caller checks to all `SECURITY DEFINER` procedures:
  ```sql
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Unauthorized: Caller does not match the requested user profile.';
  END IF;
  ```

### 2.3 Webhook Verification Security
* **Vulnerability**: `PaystackPaymentProvider.ts` contains `parseAndVerifyWebhook` which parses Paystack webhooks, but it does NOT verify the cryptographic HMAC signature header (`x-paystack-signature`).
* **Impact**: An attacker can send spoofed webhook payloads to the webhook receiver claiming a payment was successful, thereby crediting their wallet with unlimited free funds.
* **Classification**: **CRITICAL**
* **Mitigation**: Implement HMAC-SHA512 verification using Web Crypto API (`crypto.subtle`) against `PAYSTACK_WEBHOOK_SECRET`.

### 2.4 Stale / Direct Client-Side State Mutations
* **Vulnerability**: `PurchaseService.executePurchase` (React Native client) executes direct updates to `electricity_transactions` (setting status to `successful` or `failed`) using `client.from('electricity_transactions').update(...)`.
* **Impact**: RLS policies for `electricity_transactions` only allow `SELECT` and `INSERT` for users. No `UPDATE` policy exists. Therefore, client-side updates will fail in production, leaving transactions stuck in `processing`.
* **Classification**: **HIGH RISK**
* **Mitigation**: Replace direct client-side updates in `PurchaseService` and `ReconciliationService` with calls to the secure RPCs `finalize_electricity_purchase_success` and `finalize_electricity_purchase_failure`, and secure those RPCs to verify transaction ownership.

---

## 3. Threat Model Matrix

| Threat ID | Attack Surface | Threat Description | Business Impact | Mitigation |
|---|---|---|---|---|
| **TM-01** | Stored Procedures | User A executes `credit_wallet_from_payment` passing User B's payment attempt | Financial theft (credits wallet without pay) | Enforce `auth.uid() = p_user_id` inside RPC |
| **TM-02** | Webhook Endpoint | Attacker POSTs fake payment payload | Wallet balance inflation | Verify HMAC-SHA512 using `PAYSTACK_WEBHOOK_SECRET` |
| **TM-03** | Mobile App Bundle | Attacker extracts VTpass/Paystack secret keys | Provider account drainage / fraud | Remove `EXPO_PUBLIC_` from secret keys |
| **TM-04** | Stored Procedures | User A calls `finalize_electricity_purchase_success` on User B's pending purchase | Token/Units generated without authorization | Check transaction ownership inside finalizer RPC |
| **TM-05** | Auth Credentials | User signs up with default password fallback | Account takeover | Remove hardcoded passwords in client auth logic |

---

## 4. Mitigation Action Plan

1. **Hardening Database Stored Procedures**: Update all SQL procedures to strictly enforce `auth.uid() = p_user_id` or verify transaction ownership.
2. **Re-routing finalization to Stored Procedures**: Refactor client-side `PurchaseService` and `ReconciliationService` to finalize purchases using `finalize_electricity_purchase_success` and `finalize_electricity_purchase_failure` instead of direct table updates.
3. **Webhook HMAC Signature Check**: Add standard Web Crypto HMAC signature validation to `PaystackPaymentProvider`.
4. **Sanitize Default Passwords**: Ensure `AppContext.tsx` rejects empty passwords and enforces strong credentials at the client level.
5. **Secure Environment Configuration**: Review `.env` and remove `EXPO_PUBLIC_` from any secret provider credentials.
