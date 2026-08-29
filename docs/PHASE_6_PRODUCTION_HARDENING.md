# Phase 6: Production Hardening, Security, Concurrency & Chaos Testing

This document details the security and reliability hardening measures implemented to elevate the Smart Electricity app to a production-ready financial technology platform.

---

## 1. Webhook Signature Hardening (HMAC-SHA512)

### The Threat
Without cryptographic verification of webhook payloads, attackers could forge webhook events (e.g., Paystack `charge.success` events) to credit arbitrary amounts to their wallets without making real payments.

### Hardening Implementation
* In [`PaystackPaymentProvider.ts`](file:///c:/Users/Musa%20A.%20Abubakar/Desktop/smart-electricity-app/src/services/payment-providers/PaystackPaymentProvider.ts), the webhook validation logic uses the **Web Crypto API** (`globalThis.crypto.subtle` or Node's `webcrypto` fallback) to verify signature authenticity.
* The raw request payload body is computed against the configured `PAYSTACK_WEBHOOK_SECRET` using **HMAC-SHA512**.
* The computed hex digest is verified using constant-time comparison against the `x-paystack-signature` header.
* Webhooks with missing, invalid, or forged signatures are rejected before any profile or wallet mutation occurs.

---

## 2. Stored Procedure & Atomic Transaction Layer

### The Threat
Processing electricity purchases involves several logical stages (Idempotency check, wallet debit, transaction logging, vendor API call, settlement updating). If handled purely on the client side, network splits, server crashes, or concurrent requests could result in:
1. **Double Debits**: Wallet balance is debited twice for a single token.
2. **Missing Purchases**: Wallet balance is debited but no transaction is recorded.
3. **Double Spending**: User initiates concurrent requests to spend the same wallet balance before the first request updates the balance.

### Hardening Implementation
We moved critical balance and state mutations into the PostgreSQL database layer using **Stored Procedures**:
1. **`execute_electricity_purchase_init`**:
   - Performs atomic idempotency checks.
   - Checks user wallet lock status.
   - Verifies sufficient balance.
   - Records the transaction in a `processing` state.
   - Debits the wallet and logs a ledger entry—all inside a single database transaction.
2. **`finalize_electricity_purchase_success`**:
   - Atomically transitions a transaction to `successful`.
   - Records the vend details (STS token, units, tariff).
   - inserts consumption logs and system notifications.
3. **`finalize_electricity_purchase_failure`**:
   - Transitions the transaction to `failed`.
   - Reverses the debit, refunding the user's wallet.
   - Appends a reversal entry to the ledger.

---

## 3. Row-Level Concurrency & Double-Spending Prevention

### Row Locking (`FOR UPDATE`)
Every wallet balance read inside the stored procedures is performed using PostgreSQL `SELECT ... FOR UPDATE`.
- This acquires an exclusive row lock on the user's `wallet_accounts` record.
- Any concurrent transaction attempting to read or write the same wallet record must wait until the current transaction commits or rolls back.
- This guarantees that balance checks are always performed against the absolute latest committed state, eliminating double-spending race conditions.

---

## 4. DB RLS Policies & Security Hardening

To ensure strict compliance with Row-Level Security:
* RLS is explicitly enabled on all core database tables (`profiles`, `wallet_accounts`, `wallet_transactions`, `electricity_transactions`, `consumption_records`, etc.).
* Modified migrations to verify `auth.uid()` checks correctly against `user_id` columns, preventing any Horizontal Privilege Escalation (IDOR) attacks.
* Anonymous public access to wallet tables is forbidden. All operations require authenticated JWT sessions.

---

## 5. Client-Side Graceful RPC Capability Fallback

To support local testing against persistent development databases that may not yet contain the new Phase 6 stored procedures, both services implement a robust **capability fallback pattern**:
- Services try the new RPC calls first.
- If PostgREST returns error code `PGRST202` (function not found), the client logs a warning and gracefully falls back to the original client-side logic.
- This ensures high developer velocity and test runner compatibility without sacrificing production safety.
