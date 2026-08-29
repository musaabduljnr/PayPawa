# Smart Electricity — Phase 5: Production Wallet, Funding & Financial Ledger

## 1. Overview & Architecture

Phase 5 establishes a **server-authoritative, double-entry financial ledger and wallet funding engine** for Smart Electricity. All financial mutations pass through PostgreSQL ACID stored procedures with atomic row-locking (`FOR UPDATE`), strict idempotency checks, cryptographic webhook verification, and double-spend protection.

---

## 2. Core Financial Invariants

1. **Server Authority**: The mobile client NEVER mutates wallet balances directly and never computes local arithmetic. Balances are queried authoritatively from `wallet_accounts.balance_kobo`.
2. **Integer Arithmetic (Kobo)**: All monetary storage and computations use exact integer `BIGINT` kobo (1 Naira = 100 Kobo), eliminating floating-point precision loss.
3. **Double-Entry Immutable Ledger**: Every monetary movement creates an append-only row in `wallet_transactions` recording `balance_before_kobo`, `balance_after_kobo`, unique `idempotency_key`, and transaction metadata.
4. **Idempotency & Replay Protection**: Webhooks, client retries, and network replays are fully idempotent. Replaying an identical webhook 20 times results in exactly 1 credit and 0 balance drift.
5. **Amount & Currency Validation**: Inbound payment amounts and currencies (`NGN`) are verified against the original payment attempt before crediting. Discrepancies are flagged for audit.

---

## 3. Financial Database Schema

### `wallet_accounts` Table
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY | Unique wallet identifier |
| `user_id` | `UUID` | UNIQUE, REFERENCES profiles(id) | Associated user |
| `balance_kobo` | `BIGINT` | NOT NULL, CHECK (balance_kobo >= 0) | Authoritative balance in kobo |
| `currency` | `VARCHAR(3)` | NOT NULL, DEFAULT 'NGN' | ISO currency code |
| `is_locked` | `BOOLEAN` | NOT NULL, DEFAULT FALSE | Account suspension flag |

### `payment_attempts` Table (Inbound Funding)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY | Payment attempt record |
| `user_id` | `UUID` | REFERENCES profiles(id) | Originating user |
| `wallet_id` | `UUID` | REFERENCES wallet_accounts(id) | Target wallet |
| `reference` | `VARCHAR(64)` | UNIQUE | Internal reference (`WF-YYYYMMDD-XXXXXXXX`) |
| `amount_kobo` | `BIGINT` | NOT NULL, CHECK (amount_kobo > 0) | Requested amount in kobo |
| `method` | `payment_method_enum` | NOT NULL | `card`, `bank_transfer`, `ussd`, `wallet` |
| `status` | `payment_status_enum` | NOT NULL, DEFAULT 'initiated' | `initiated`, `pending`, `successful`, `failed`, `abandoned` |
| `provider` | `TEXT` | NOT NULL | `paystack`, `flutterwave`, `mock` |
| `provider_reference` | `TEXT` | - | Gateway reference |
| `idempotency_key` | `VARCHAR(128)` | UNIQUE | Replay protection key |
| `metadata` | `JSONB` | - | Checkout URL, virtual accounts, USSD codes |

### `wallet_transactions` Table (Immutable Ledger)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY | Ledger entry identifier |
| `user_id` | `UUID` | REFERENCES profiles(id) | Account owner |
| `wallet_id` | `UUID` | REFERENCES wallet_accounts(id) | Wallet account |
| `type` | `wallet_tx_type_enum` | NOT NULL | `funding`, `purchase_debit`, `refund_credit`, `reversal_debit`, `adjustment` |
| `amount_kobo` | `BIGINT` | NOT NULL | Signed amount (positive for credits, negative for debits) |
| `balance_before_kobo`| `BIGINT` | NOT NULL | Prior balance |
| `balance_after_kobo` | `BIGINT` | NOT NULL, CHECK (balance_after_kobo >= 0) | Post-mutation balance |
| `reference` | `VARCHAR(64)` | UNIQUE | Unique ledger reference |
| `idempotency_key` | `VARCHAR(128)` | UNIQUE | Enforces 1:1 ledger mapping |

---

## 4. Payment Gateway Integration Architecture

```
                 ┌────────────────────────────────────────────────────────┐
                 │                PaymentProvider (Interface)             │
                 └───────────▲────────────────────────────────▲───────────┘
                             │                                │
             ┌───────────────┴──────────────┐ ┌───────────────┴──────────────┐
             │    PaystackPaymentProvider   │ │      MockPaymentProvider     │
             │  (Real Gateway Integration)  │ │   (Deterministic Sandbox)    │
             └──────────────────────────────┘ └──────────────────────────────┘
```

- **`PaymentProviderFactory`**: Resolves active gateway at runtime (`paystack` or test `mock`).
- **`PaystackPaymentProvider`**: Implements standard initialize, verify, and HMAC-SHA512 webhook signature verification.
- **`MockPaymentProvider`**: Simulates `SUCCESS`, `FAILED`, `PENDING`, `TIMEOUT`, `AMOUNT_MISMATCH`, `CURRENCY_MISMATCH`, and `DUPLICATE_WEBHOOK` states.

---

## 5. End-to-End Financial Flow

```
1. Client Top-Up Request (₦10,000 via Card/Transfer/USSD)
      │
      ├─► WalletFundingService.initializeFunding
      │     - Enforce limits: ₦500.00 min to ₦1,000,000.00 max
      │     - Generate collision-resistant internal reference: WF-YYYYMMDD-XXXXXXXX
      │     - Generate idempotency key: FUND-{userId}-{clientRequestId}
      │     - Create payment_attempts row ('initiated')
      │     - Call PaymentProvider.initializePayment
      │     - Store provider checkout URL / virtual account
      │
      ├─► User Completes Payment at Gateway (Paystack / Bank Transfer)
      │
      ├─► Payment Confirmation (Webhook or Verify API)
      │     - Verify HMAC signature
      │     - Validate amount (₦10,000 == 1,000,000 kobo)
      │     - Validate currency == 'NGN'
      │     - Call atomic database RPC credit_wallet_from_payment
      │           * Locks payment_attempts row (FOR UPDATE)
      │           * Checks idempotency: if already processed -> returns cached result
      │           * Locks wallet_accounts row (FOR UPDATE)
      │           * Increments balance_kobo: 0 -> 1,000,000 kobo
      │           * Inserts immutable ledger entry (type: 'funding')
      │           * Updates payment_attempts status to 'successful'
      │           * Emits user notification
      │
      └─► Activity Ledger & UI Synchronization
            - Balance updates in AppContext & Home Screen
            - Activity screen displays verified receipt and ledger entry
```

---

## 6. Automated Test Suite Results

The automated test runner (`scripts/test_phase5_runner.mjs`) ran against live Supabase PostgreSQL:

```
================================================================
💳 RUNNING PHASE 5: PRODUCTION WALLET, FUNDING & LEDGER TESTS
================================================================
▶ [TEST 1] Testing Funding Validation & Reference Engine...
✅ [PASS] Funding reference matches collision-resistant format WF-YYYYMMDD-XXXXXXXX
✅ [PASS] Server rejects funding amounts below ₦500
✅ [PASS] Server rejects funding amounts exceeding ₦1,000,000 limit

▶ [TEST 2] Testing End-to-End Wallet Funding & Atomic Ledger Crediting...
✅ [PASS] Funding initialized with payment gateway & database payment_attempt created
✅ [PASS] Payment verified with gateway and wallet atomically credited in Supabase
✅ [PASS] Database wallet_accounts row reflects exact ₦10,000.00 (1,000,000 kobo)
✅ [PASS] Immutable double-entry ledger record persisted in wallet_transactions table

▶ [TEST 3] Testing Idempotency & Repeated Verification Protection...
✅ [PASS] Repeated verification requests return existing transaction without double crediting
✅ [PASS] Wallet balance strictly unchanged after repeated verification calls

▶ [TEST 4] Simulating 20 Simultaneous Duplicate Webhooks...
✅ [PASS] 20 Duplicate webhooks resulted in EXACTLY 1 credit of ₦5,000 and zero duplicate ledger entries

▶ [TEST 5] Testing Amount & Currency Mismatch Fraud Protection...
✅ [PASS] Server detects amount mismatch (₦500,000 received vs ₦5,000 expected) and blocks credit
✅ [PASS] Server rejects foreign currency (USD) payment attempts

▶ [TEST 6] Testing Payment Gateway Timeout & Asynchronous Reconciliation...
✅ [PASS] Timed-out payment gracefully stays in PENDING state without premature credit or crash
✅ [PASS] PaymentReconciliationService successfully scanned and resolved pending payment to credited

▶ [TEST 7] Testing Full Financial Lifecycle: Fund -> Purchase -> Refund -> Audit...
✅ [PASS] User B ledger matches wallet balance exactly to 0 kobo discrepancy across full lifecycle

▶ [TEST 8] Testing Security, Cross-User Isolation & Double-Spending Race Protection...
✅ [PASS] Cross-user payment attempt crediting cannot contaminate User A balance
✅ [PASS] Database row-locking prevented double-spending: exactly 1 purchase succeeded and 1 was rejected

▶ [TEST 9] Running High Concurrency Stress Test (50 Simultaneous Funding Requests)...
✅ [PASS] All 50 concurrent funding initializations completed successfully with 100% collision-free references

================================================================
📊 PHASE 5 TEST RESULTS SUMMARY
================================================================
Total Tests Run: 18
Passed:          18
Failed:          0
🎉 ALL PHASE 5 AUTOMATED TESTS PASSED SUCCESSFULLY!
```
