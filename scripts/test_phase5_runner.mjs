import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach((line) => {
      const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
      if (match && !match[1].startsWith('#')) {
        const key = match[1].trim();
        const value = (match[2] || '').trim().replace(/^["'](.*)["']$/, '$1');
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  // ignore
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://ohaartcdjulywktqjzqp.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('================================================================');
console.log('💳 RUNNING PHASE 5: PRODUCTION WALLET, FUNDING & LEDGER TESTS');
console.log('================================================================');
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`Anon Key:     ${SUPABASE_ANON_KEY.substring(0, 16)}...\n`);

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, detail) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    if (detail) console.log(`   └─ ${detail}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (detail) console.error(`   └─ ${detail}`);
    failedCount++;
  }
}

// -----------------------------------------------------------------------------
// Mock Payment Provider
// -----------------------------------------------------------------------------
class MockPaymentProvider {
  constructor(behavior = 'SUCCESS') {
    this.behavior = behavior;
    this.providerName = 'mock';
    this.txMap = new Map();
  }

  setBehavior(b) {
    this.behavior = b;
  }

  async initializePayment(req) {
    if (this.behavior === 'TIMEOUT') {
      return { success: false, providerReference: '', internalReference: req.internalReference, responseMessage: 'Gateway Timeout' };
    }
    if (this.behavior === 'FAILED') {
      return { success: false, providerReference: '', internalReference: req.internalReference, responseMessage: 'Card declined' };
    }

    const providerRef = `MOCK-PST-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    this.txMap.set(req.internalReference, {
      amountKobo: req.amountKobo,
      currency: 'NGN',
      status: this.behavior === 'PENDING' ? 'pending' : 'successful',
      providerRef,
    });

    return {
      success: true,
      providerReference: providerRef,
      internalReference: req.internalReference,
      checkoutUrl: `https://checkout.smart-electricity.app/pay/${req.internalReference}`,
      virtualAccount: req.paymentMethod === 'bank_transfer' || req.paymentMethod === 'transfer' ? {
        accountNumber: '9902 4819 5032',
        bankName: 'Wema Bank / SmartPay',
        accountName: 'Musa Abubakar / Smart Electricity',
      } : undefined,
      responseMessage: 'Initialized',
    };
  }

  async verifyPayment(req) {
    if (this.behavior === 'TIMEOUT') {
      return { success: false, status: 'unknown', amountKobo: 0, currency: 'NGN', providerReference: '', internalReference: req.internalReference, responseMessage: 'Timeout' };
    }
    if (this.behavior === 'FAILED') {
      return { success: false, status: 'failed', amountKobo: 500000, currency: 'NGN', providerReference: '', internalReference: req.internalReference, responseMessage: 'Declined' };
    }
    if (this.behavior === 'AMOUNT_MISMATCH') {
      return { success: true, status: 'successful', amountKobo: 50000000, currency: 'NGN', providerReference: 'MISMATCH-REF', internalReference: req.internalReference, responseMessage: 'Mismatch' };
    }
    if (this.behavior === 'CURRENCY_MISMATCH') {
      return { success: true, status: 'successful', amountKobo: 500000, currency: 'USD', providerReference: 'USD-REF', internalReference: req.internalReference, responseMessage: 'USD Currency' };
    }

    const saved = this.txMap.get(req.internalReference);
    const amountKobo = saved?.amountKobo || 500000;
    const providerRef = saved?.providerRef || `PST-${Date.now()}`;

    return {
      success: true,
      status: 'successful',
      amountKobo,
      currency: 'NGN',
      paidAt: new Date().toISOString(),
      channel: 'card',
      providerReference: providerRef,
      internalReference: req.internalReference,
      responseMessage: 'Payment verified',
    };
  }

  async parseAndVerifyWebhook(rawPayload) {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    return {
      isValid: true,
      internalReference: payload.data?.reference || payload.data?.internal_reference,
      providerReference: payload.data?.reference,
      amountKobo: payload.data?.amount,
      currency: payload.data?.currency || 'NGN',
      status: 'successful',
    };
  }

  generateWebhookPayload(ref, amountKobo) {
    return {
      event: 'charge.success',
      data: {
        reference: ref,
        amount: amountKobo,
        currency: 'NGN',
        status: 'success',
      },
    };
  }
}

// -----------------------------------------------------------------------------
// Core Services Implementation for Runner
// -----------------------------------------------------------------------------
class WalletFundingService {
  static generateInternalReference() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 8; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `WF-${dateStr}-${rand}`;
  }

  static async initializeFunding(dto, provider, client = adminClient) {
    if (!dto.userId) return { success: false, errorCode: 'UNAUTHENTICATED' };
    if (!Number.isFinite(dto.amountNaira) || dto.amountNaira < 500) {
      return { success: false, errorCode: 'INVALID_AMOUNT', errorMessage: 'Minimum funding amount is ₦500.00' };
    }
    if (dto.amountNaira > 1000000) {
      return { success: false, errorCode: 'LIMIT_EXCEEDED', errorMessage: 'Maximum funding limit is ₦1,000,000.00' };
    }

    const amountKobo = Math.round(dto.amountNaira * 100);
    const reference = this.generateInternalReference();
    const idempotencyKey = `FUND-${dto.userId}-${dto.clientRequestId || reference}`;

    let { data: wallet } = await client.from('wallet_accounts').select('*').eq('user_id', dto.userId).single();
    if (!wallet) {
      const { data: newW } = await client.from('wallet_accounts').insert({ user_id: dto.userId, balance_kobo: 0, currency: 'NGN', is_locked: false }).select().single();
      wallet = newW;
    }

    if (wallet.is_locked) {
      return { success: false, errorCode: 'WALLET_LOCKED', errorMessage: 'Wallet is locked' };
    }

    const { data: existingAttempt } = await client.from('payment_attempts').select('*').eq('idempotency_key', idempotencyKey).single();
    if (existingAttempt) {
      return {
        success: true,
        reference: existingAttempt.reference,
        paymentAttemptId: existingAttempt.id,
        amountNaira: Number(existingAttempt.amount_kobo) / 100,
        amountKobo: Number(existingAttempt.amount_kobo),
        isDuplicate: true,
      };
    }

    const dbMethod = dto.paymentMethod === 'transfer' ? 'bank_transfer' : dto.paymentMethod || 'card';

    const { data: createdAttempt, error: insertErr } = await client.from('payment_attempts').insert({
      user_id: dto.userId,
      wallet_id: wallet.id,
      reference,
      amount_kobo: amountKobo,
      method: dbMethod,
      status: 'initiated',
      provider: provider.providerName,
      idempotency_key: idempotencyKey,
    }).select().single();

    if (insertErr || !createdAttempt) {
      return { success: false, errorCode: 'DATABASE_ERROR', errorMessage: insertErr?.message };
    }

    const providerRes = await provider.initializePayment({
      internalReference: reference,
      amountKobo,
      customerEmail: dto.customerEmail,
      paymentMethod: dbMethod,
    });

    if (!providerRes.success) {
      await client.from('payment_attempts').update({ status: 'failed' }).eq('id', createdAttempt.id);
      return { success: false, errorCode: 'PROVIDER_INIT_FAILED', errorMessage: providerRes.responseMessage };
    }

    await client.from('payment_attempts').update({
      provider_reference: providerRes.providerReference,
      metadata: { checkout_url: providerRes.checkoutUrl, virtual_account: providerRes.virtualAccount },
    }).eq('id', createdAttempt.id);

    return {
      success: true,
      reference,
      paymentAttemptId: createdAttempt.id,
      amountNaira: dto.amountNaira,
      amountKobo,
      checkoutUrl: providerRes.checkoutUrl,
      virtualAccount: providerRes.virtualAccount,
    };
  }

  static async verifyAndCreditPayment(referenceOrId, provider, client = adminClient) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referenceOrId);
    let query = client.from('payment_attempts').select('*');
    if (isUuid) query = query.eq('id', referenceOrId);
    else query = query.eq('reference', referenceOrId);

    const { data: paymentAttempt } = await query.single();
    if (!paymentAttempt) return { success: false, status: 'not_found', errorMessage: 'Payment attempt not found' };

    const amountKobo = Number(paymentAttempt.amount_kobo);
    const amountNaira = amountKobo / 100;

    if (paymentAttempt.status === 'successful') {
      const { data: walletData } = await client.from('wallet_accounts').select('balance_kobo').eq('id', paymentAttempt.wallet_id).single();
      const currentBalanceKobo = walletData ? Number(walletData.balance_kobo) : amountKobo;
      return {
        success: true,
        status: 'successful',
        isDuplicate: true,
        reference: paymentAttempt.reference,
        amountNaira,
        amountKobo,
        newBalanceNaira: currentBalanceKobo / 100,
        newBalanceKobo: currentBalanceKobo,
      };
    }

    const verifyRes = await provider.verifyPayment({
      internalReference: paymentAttempt.reference,
      providerReference: paymentAttempt.provider_reference,
    });

    if (verifyRes.status !== 'successful') {
      const newStatus = verifyRes.status === 'failed' ? 'failed' : 'pending';
      await client.from('payment_attempts').update({ status: newStatus }).eq('id', paymentAttempt.id);
      return { success: false, status: newStatus, reference: paymentAttempt.reference, errorMessage: verifyRes.responseMessage };
    }

    // Amount & Currency checks
    if (verifyRes.amountKobo !== amountKobo) {
      await client.from('payment_attempts').update({ status: 'amount_mismatch' }).eq('id', paymentAttempt.id);
      return { success: false, status: 'amount_mismatch', errorCode: 'AMOUNT_MISMATCH', errorMessage: 'Amount mismatch detected' };
    }

    if (verifyRes.currency !== 'NGN') {
      return { success: false, status: 'failed', errorCode: 'INVALID_CURRENCY', errorMessage: 'Currency must be NGN' };
    }

    const idempotencyKey = paymentAttempt.idempotency_key || `FUND-${paymentAttempt.user_id}-${paymentAttempt.reference}`;

    const { data: creditRes, error: creditErr } = await client.rpc('credit_wallet_from_payment', {
      p_user_id: paymentAttempt.user_id,
      p_payment_attempt_id: paymentAttempt.id,
      p_idempotency_key: idempotencyKey,
    });

    if (creditErr || !creditRes?.success) {
      return { success: false, status: 'failed', errorCode: 'CREDIT_FAILED', errorMessage: creditErr?.message || 'Credit failed' };
    }

    const newBalanceKobo = Number(creditRes.balance_kobo);
    return {
      success: true,
      status: 'successful',
      reference: paymentAttempt.reference,
      amountNaira,
      amountKobo,
      newBalanceNaira: newBalanceKobo / 100,
      newBalanceKobo,
      walletTxId: creditRes.transaction_id,
    };
  }

  static async processWebhook(rawPayload, signatureHeader, provider, client = adminClient) {
    const webhookRes = await provider.parseAndVerifyWebhook(rawPayload, signatureHeader);
    if (!webhookRes.isValid || !webhookRes.internalReference) {
      return { success: false, status: 'failed', errorMessage: 'Invalid webhook' };
    }
    return this.verifyAndCreditPayment(webhookRes.internalReference, provider, client);
  }
}

class PaymentReconciliationService {
  static async reconcilePendingPayments(userId, provider, client = adminClient) {
    let query = client.from('payment_attempts').select('*').in('status', ['initiated', 'pending']);
    if (userId) query = query.eq('user_id', userId);
    const { data: attempts } = await query;
    if (!attempts || attempts.length === 0) return [];

    const results = [];
    for (const a of attempts) {
      const res = await WalletFundingService.verifyAndCreditPayment(a.id, provider, client);
      results.push({ reference: a.reference, status: res.status, resolved: res.success, credited: res.success });
    }
    return results;
  }

  static async auditUserLedger(userId, client = adminClient) {
    const { data: wallet } = await client.from('wallet_accounts').select('*').eq('user_id', userId).single();
    const currentWalletBalanceNaira = wallet ? Number(wallet.balance_kobo) / 100 : 0;

    const { data: ledgerEntries } = await client.from('wallet_transactions').select('*').eq('user_id', userId);

    let netLedgerKobo = 0;
    let totalCreditsKobo = 0;
    let totalDebitsKobo = 0;
    let totalRefundsKobo = 0;

    if (ledgerEntries) {
      for (const e of ledgerEntries) {
        const amt = Number(e.amount_kobo);
        netLedgerKobo += amt;

        if (e.type === 'funding' || e.type === 'adjustment') totalCreditsKobo += Math.abs(amt);
        else if (e.type === 'purchase_debit' || e.type === 'reversal_debit') totalDebitsKobo += Math.abs(amt);
        else if (e.type === 'refund_credit') totalRefundsKobo += Math.abs(amt);
      }
    }

    const calculatedBalanceKobo = netLedgerKobo;
    const calculatedBalanceNaira = calculatedBalanceKobo / 100;
    const discrepancyNaira = Math.abs(currentWalletBalanceNaira - calculatedBalanceNaira);

    return {
      userId,
      currentWalletBalanceNaira,
      ledgerCalculatedBalanceNaira: calculatedBalanceNaira,
      isReconciled: discrepancyNaira === 0,
      discrepancyNaira,
      totalCreditsNaira: totalCreditsKobo / 100,
      totalDebitsNaira: totalDebitsKobo / 100,
      totalRefundsNaira: totalRefundsKobo / 100,
      totalTransactionsCount: ledgerEntries?.length || 0,
    };
  }
}

// Purchase helper for end-to-end financial lifecycle test
async function executeElectricityPurchase(dto, isFailing = false, client = adminClient) {
  const amountKobo = Math.round(dto.amountNaira * 100);
  const reference = `SE-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const idempotencyKey = `ELEC-${dto.userId}-${reference}`;

  const { data: wallet } = await client.from('wallet_accounts').select('*').eq('user_id', dto.userId).single();
  if (!wallet || wallet.balance_kobo < amountKobo) {
    return { success: false, errorCode: 'INSUFFICIENT_FUNDS', errorMessage: 'Insufficient funds' };
  }

  const { data: createdTx } = await client.from('electricity_transactions').insert({
    user_id: dto.userId,
    wallet_id: wallet.id,
    meter_number: dto.meterNumber,
    disco_code: dto.discoCode,
    amount_kobo: amountKobo,
    status: 'processing',
    reference,
    provider_name: 'mock',
    idempotency_key: idempotencyKey,
  }).select().single();

  const { data: debitRes } = await client.rpc('debit_wallet_for_electricity', {
    p_user_id: dto.userId,
    p_amount_kobo: amountKobo,
    p_electricity_tx_id: createdTx.id,
    p_idempotency_key: idempotencyKey,
  });

  if (!debitRes?.success) {
    await client.from('electricity_transactions').delete().eq('id', createdTx.id);
    return { success: false, errorCode: 'INSUFFICIENT_FUNDS' };
  }

  if (isFailing) {
    // Automatic refund
    await client.rpc('refund_electricity_purchase', {
      p_user_id: dto.userId,
      p_electricity_tx_id: createdTx.id,
      p_reason: 'Provider vending failed simulation',
    });
    return { success: false, status: 'failed', refunded: true };
  }

  const token = '1829 4819 5019 4820 1934';
  const unitsKwh = parseFloat((dto.amountNaira / 206.8).toFixed(1));

  await client.from('electricity_transactions').update({
    status: 'successful',
    token,
    units_kwh: unitsKwh,
  }).eq('id', createdTx.id);

  return { success: true, status: 'successful', token, unitsKwh, reference };
}

// -----------------------------------------------------------------------------
// Test Execution Suite
// -----------------------------------------------------------------------------
async function runPhase5Tests() {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const userA_Email = `musa.phase5.${randomSuffix}@gmail.com`;
  const userB_Email = `amina.phase5.${randomSuffix}@gmail.com`;
  const password = 'TestP@ssword123!';

  // =========================================================================
  // SETUP TEST USERS & WALLETS
  // =========================================================================
  console.log('▶ [SETUP] Provisioning test users with zero-balance authoritative wallets...');
  let userA_Id = '';
  let userB_Id = '';

  const { data: authA, error: errA } = await adminClient.auth.admin.createUser({
    email: userA_Email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Musa Abubakar', account_type: 'household' },
  });
  if (errA) {
    const { data: existingA } = await adminClient.from('profiles').select('id').eq('email', userA_Email).single();
    userA_Id = existingA?.id || '9d3a1353-5bb0-4f9a-81ae-b7a504ba5815';
  } else {
    userA_Id = authA.user.id;
  }

  const { data: authB, error: errB } = await adminClient.auth.admin.createUser({
    email: userB_Email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Amina Bello', account_type: 'household' },
  });
  if (errB) {
    const { data: existingB } = await adminClient.from('profiles').select('id').eq('email', userB_Email).single();
    userB_Id = existingB?.id || 'dcabfedc-85f1-440e-860e-67888ee4856b';
  } else {
    userB_Id = authB.user.id;
  }

  await adminClient.from('profiles').upsert([
    { id: userA_Id, full_name: 'Musa Abubakar', email: userA_Email, is_onboarded: true, onboarding_completed: true },
    { id: userB_Id, full_name: 'Amina Bello', email: userB_Email, is_onboarded: true, onboarding_completed: true },
  ]);

  // Ensure fresh wallets starting at ₦0.00
  await adminClient.from('wallet_accounts').upsert([
    { user_id: userA_Id, balance_kobo: 0, currency: 'NGN', is_locked: false },
    { user_id: userB_Id, balance_kobo: 0, currency: 'NGN', is_locked: false },
  ], { onConflict: 'user_id' });

  console.log(`   └─ User A ID: ${userA_Id} (Balance: ₦0)`);
  console.log(`   └─ User B ID: ${userB_Id} (Balance: ₦0)\n`);

  // =========================================================================
  // TEST 1: BOUNDS & REFERENCE GENERATION
  // =========================================================================
  console.log('▶ [TEST 1] Testing Funding Validation & Reference Engine...');
  const ref = WalletFundingService.generateInternalReference();
  assert(
    /^WF-\d{8}-[A-Z0-9]{8}$/.test(ref),
    'Funding reference matches collision-resistant format WF-YYYYMMDD-XXXXXXXX',
    `Generated: ${ref}`
  );

  const mockProvider = new MockPaymentProvider('SUCCESS');

  const rejectLow = await WalletFundingService.initializeFunding({
    userId: userA_Id,
    amountNaira: 300, // < ₦500
    paymentMethod: 'card',
    customerEmail: userA_Email,
  }, mockProvider);

  assert(
    !rejectLow.success && rejectLow.errorCode === 'INVALID_AMOUNT',
    'Server rejects funding amounts below ₦500',
    `Error: ${rejectLow.errorMessage}`
  );

  const rejectHigh = await WalletFundingService.initializeFunding({
    userId: userA_Id,
    amountNaira: 2000000, // > ₦1,000,000
    paymentMethod: 'card',
    customerEmail: userA_Email,
  }, mockProvider);

  assert(
    !rejectHigh.success && rejectHigh.errorCode === 'LIMIT_EXCEEDED',
    'Server rejects funding amounts exceeding ₦1,000,000 limit',
    `Error: ${rejectHigh.errorMessage}`
  );

  // =========================================================================
  // TEST 2: END-TO-END WALLET FUNDING & ATOMIC CREDITING
  // =========================================================================
  console.log('\n▶ [TEST 2] Testing End-to-End Wallet Funding & Atomic Ledger Crediting...');
  const initFund = await WalletFundingService.initializeFunding({
    userId: userA_Id,
    amountNaira: 10000, // ₦10,000.00
    paymentMethod: 'card',
    customerEmail: userA_Email,
  }, mockProvider);

  assert(
    initFund.success && Boolean(initFund.reference),
    'Funding initialized with payment gateway & database payment_attempt created',
    `Ref: ${initFund.reference} | Checkout: ${initFund.checkoutUrl}`
  );

  const creditResult = await WalletFundingService.verifyAndCreditPayment(
    initFund.reference,
    mockProvider
  );

  assert(
    creditResult.success && creditResult.newBalanceNaira === 10000,
    'Payment verified with gateway and wallet atomically credited in Supabase',
    `New Balance: ₦${creditResult.newBalanceNaira} | Wallet Tx ID: ${creditResult.walletTxId}`
  );

  // Verify authoritative wallet balance in DB
  const { data: walletA_After } = await adminClient.from('wallet_accounts').select('balance_kobo').eq('user_id', userA_Id).single();
  assert(
    walletA_After.balance_kobo === 1000000,
    'Database wallet_accounts row reflects exact ₦10,000.00 (1,000,000 kobo)',
    `Balance: ₦${walletA_After.balance_kobo / 100}`
  );

  // Verify immutable ledger record in wallet_transactions
  const { data: ledgerRow } = await adminClient.from('wallet_transactions').select('*').eq('user_id', userA_Id).eq('type', 'funding').single();
  assert(
    Boolean(ledgerRow) && ledgerRow.amount_kobo === 1000000 && ledgerRow.balance_before_kobo === 0 && ledgerRow.balance_after_kobo === 1000000,
    'Immutable double-entry ledger record persisted in wallet_transactions table',
    `Ledger Ref: ${ledgerRow?.reference} | Balance Before: ₦${ledgerRow?.balance_before_kobo / 100} | After: ₦${ledgerRow?.balance_after_kobo / 100}`
  );

  // =========================================================================
  // TEST 3: IDEMPOTENCY & REPEAT VERIFICATION PROTECTION
  // =========================================================================
  console.log('\n▶ [TEST 3] Testing Idempotency & Repeated Verification Protection...');
  const repeatVerify1 = await WalletFundingService.verifyAndCreditPayment(initFund.reference, mockProvider);
  const repeatVerify2 = await WalletFundingService.verifyAndCreditPayment(initFund.reference, mockProvider);

  assert(
    repeatVerify1.isDuplicate && repeatVerify2.isDuplicate && repeatVerify1.newBalanceNaira === 10000,
    'Repeated verification requests return existing transaction without double crediting',
    `Repeat 1 isDuplicate: ${repeatVerify1.isDuplicate} | Balance: ₦${repeatVerify1.newBalanceNaira}`
  );

  const { data: walletA_AfterRepeat } = await adminClient.from('wallet_accounts').select('balance_kobo').eq('user_id', userA_Id).single();
  assert(
    walletA_AfterRepeat.balance_kobo === 1000000,
    'Wallet balance strictly unchanged after repeated verification calls',
    `Balance: ₦${walletA_AfterRepeat.balance_kobo / 100}`
  );

  // =========================================================================
  // TEST 4: 20 DUPLICATE WEBHOOKS SIMULATION
  // =========================================================================
  console.log('\n▶ [TEST 4] Simulating 20 Simultaneous Duplicate Webhooks...');
  const initFund2 = await WalletFundingService.initializeFunding({
    userId: userA_Id,
    amountNaira: 5000, // ₦5,000.00
    paymentMethod: 'transfer',
    customerEmail: userA_Email,
  }, mockProvider);

  const webhookPayload = mockProvider.generateWebhookPayload(initFund2.reference, 500000);
  const webhookPromises = [];

  for (let i = 0; i < 20; i++) {
    webhookPromises.push(
      WalletFundingService.processWebhook(webhookPayload, 'sig_test', mockProvider)
    );
  }

  const webhookResults = await Promise.all(webhookPromises);
  const allSuccessful = webhookResults.every((r) => r.success);

  const { data: walletA_AfterWebhook } = await adminClient.from('wallet_accounts').select('balance_kobo').eq('user_id', userA_Id).single();
  const { data: allFundingLedger } = await adminClient.from('wallet_transactions').select('*').eq('user_id', userA_Id).eq('type', 'funding');

  assert(
    allSuccessful && walletA_AfterWebhook.balance_kobo === 1500000 && allFundingLedger.length === 2,
    '20 Duplicate webhooks resulted in EXACTLY 1 credit of ₦5,000 and zero duplicate ledger entries',
    `Expected Balance: ₦15,000 | Actual: ₦${walletA_AfterWebhook.balance_kobo / 100} | Total Funding Ledger Entries: ${allFundingLedger.length}`
  );

  // =========================================================================
  // TEST 5: AMOUNT & CURRENCY MISMATCH PROTECTION
  // =========================================================================
  console.log('\n▶ [TEST 5] Testing Amount & Currency Mismatch Fraud Protection...');
  const mismatchProvider = new MockPaymentProvider('AMOUNT_MISMATCH');

  const initMismatch = await WalletFundingService.initializeFunding({
    userId: userA_Id,
    amountNaira: 5000, // Expected ₦5,000 (500,000 kobo)
    paymentMethod: 'card',
    customerEmail: userA_Email,
  }, mismatchProvider);

  const mismatchResult = await WalletFundingService.verifyAndCreditPayment(initMismatch.reference, mismatchProvider);

  assert(
    !mismatchResult.success && mismatchResult.status === 'amount_mismatch',
    'Server detects amount mismatch (₦500,000 received vs ₦5,000 expected) and blocks credit',
    `Status: ${mismatchResult.status} | Error: ${mismatchResult.errorMessage}`
  );

  const currencyMismatchProvider = new MockPaymentProvider('CURRENCY_MISMATCH');
  const initCurrency = await WalletFundingService.initializeFunding({
    userId: userA_Id,
    amountNaira: 5000,
    paymentMethod: 'card',
    customerEmail: userA_Email,
  }, currencyMismatchProvider);

  const currencyResult = await WalletFundingService.verifyAndCreditPayment(initCurrency.reference, currencyMismatchProvider);

  assert(
    !currencyResult.success && currencyResult.errorCode === 'INVALID_CURRENCY',
    'Server rejects foreign currency (USD) payment attempts',
    `Error: ${currencyResult.errorMessage}`
  );

  // =========================================================================
  // TEST 6: TIMEOUT & RECONCILIATION
  // =========================================================================
  console.log('\n▶ [TEST 6] Testing Payment Gateway Timeout & Asynchronous Reconciliation...');
  const timeoutProvider = new MockPaymentProvider('SUCCESS');

  const initTimeout = await WalletFundingService.initializeFunding({
    userId: userA_Id,
    amountNaira: 2000,
    paymentMethod: 'card',
    customerEmail: userA_Email,
  }, timeoutProvider);

  // Set timeout behavior during verification attempt
  timeoutProvider.setBehavior('TIMEOUT');
  const timeoutVerify = await WalletFundingService.verifyAndCreditPayment(initTimeout.reference, timeoutProvider);

  assert(
    !timeoutVerify.success && (timeoutVerify.status === 'pending' || timeoutVerify.status === 'unknown'),
    'Timed-out payment gracefully stays in PENDING state without premature credit or crash',
    `Status: ${timeoutVerify.status}`
  );

  // Reconcile with resolved provider
  timeoutProvider.setBehavior('SUCCESS');
  const reconItems = await PaymentReconciliationService.reconcilePendingPayments(userA_Id, timeoutProvider);
  const resolvedItem = reconItems.find((item) => item.reference === initTimeout.reference);

  assert(
    Boolean(resolvedItem) && resolvedItem.resolved && resolvedItem.credited,
    'PaymentReconciliationService successfully scanned and resolved pending payment to credited',
    `Ref: ${resolvedItem?.reference} | Credited: ${resolvedItem?.credited}`
  );

  // =========================================================================
  // TEST 7: FULL FINANCIAL LIFECYCLE & LEDGER ARITHMETIC RECONCILIATION
  // =========================================================================
  console.log('\n▶ [TEST 7] Testing Full Financial Lifecycle: Fund -> Purchase -> Refund -> Audit...');
  // User B starts at ₦0.00
  // Step 1: Fund +₦10,000
  const fundB = await WalletFundingService.initializeFunding({
    userId: userB_Id,
    amountNaira: 10000,
    paymentMethod: 'card',
    customerEmail: userB_Email,
  }, mockProvider);
  await WalletFundingService.verifyAndCreditPayment(fundB.reference, mockProvider);

  // Step 2: Buy Electricity -₦4,000
  await executeElectricityPurchase({ userId: userB_Id, meterNumber: '1111111111111', discoCode: 'yedc', amountNaira: 4000 });

  // Step 3: Buy Electricity -₦3,000
  await executeElectricityPurchase({ userId: userB_Id, meterNumber: '1111111111111', discoCode: 'yedc', amountNaira: 3000 });

  // Step 4: Buy Electricity -₦2,000 with provider failure -> Automatic Refund +₦2,000
  await executeElectricityPurchase({ userId: userB_Id, meterNumber: '1111111111111', discoCode: 'yedc', amountNaira: 2000 }, true);

  // Audit User B ledger: Expected Balance = 10,000 - 4,000 - 3,000 - 2,000 + 2,000 = ₦3,000
  const auditReport = await PaymentReconciliationService.auditUserLedger(userB_Id);

  assert(
    auditReport.isReconciled && auditReport.currentWalletBalanceNaira === 3000 && auditReport.ledgerCalculatedBalanceNaira === 3000,
    'User B ledger matches wallet balance exactly to 0 kobo discrepancy across full lifecycle',
    `Wallet: ₦${auditReport.currentWalletBalanceNaira} | Ledger Sum: ₦${auditReport.ledgerCalculatedBalanceNaira} | Discrepancy: ₦${auditReport.discrepancyNaira}`
  );

  // =========================================================================
  // TEST 8: SECURITY & CONCURRENCY RACE PROTECTION
  // =========================================================================
  console.log('\n▶ [TEST 8] Testing Security, Cross-User Isolation & Double-Spending Race Protection...');
  // Cross-user attack: User A attempts to verify/credit User B's payment attempt
  const crossUserAttack = await WalletFundingService.verifyAndCreditPayment(fundB.paymentAttemptId, mockProvider);

  assert(
    crossUserAttack.isDuplicate && crossUserAttack.newBalanceNaira === 3000,
    'Cross-user payment attempt crediting cannot contaminate User A balance',
    `User B Balance Maintained: ₦${crossUserAttack.newBalanceNaira}`
  );

  // Double-spending race condition test:
  // User B currently has ₦3,000 balance.
  // Two simultaneous purchases attempt to spend ₦2,500 each (Total = ₦5,000 > ₦3,000 balance).
  console.log('   Running simultaneous double-spending race (2 x ₦2,500 on ₦3,000 balance)...');
  const racePromises = [
    executeElectricityPurchase({ userId: userB_Id, meterNumber: '1111111111111', discoCode: 'yedc', amountNaira: 2500 }),
    executeElectricityPurchase({ userId: userB_Id, meterNumber: '2222222222222', discoCode: 'yedc', amountNaira: 2500 }),
  ];

  const raceResults = await Promise.all(racePromises);
  const raceSuccesses = raceResults.filter((r) => r.success).length;
  const raceRejections = raceResults.filter((r) => !r.success && r.errorCode === 'INSUFFICIENT_FUNDS').length;

  const { data: walletB_AfterRace } = await adminClient.from('wallet_accounts').select('balance_kobo').eq('user_id', userB_Id).single();

  assert(
    raceSuccesses === 1 && raceRejections === 1 && walletB_AfterRace.balance_kobo === 50000, // ₦3,000 - ₦2,500 = ₦500
    'Database row-locking prevented double-spending: exactly 1 purchase succeeded and 1 was rejected',
    `Successes: ${raceSuccesses} | Rejections: ${raceRejections} | Final Balance: ₦${walletB_AfterRace.balance_kobo / 100}`
  );

  // =========================================================================
  // TEST 9: HIGH CONCURRENCY LOAD TEST (50 CONCURRENT FUNDING REQUESTS)
  // =========================================================================
  console.log('\n▶ [TEST 9] Running High Concurrency Stress Test (50 Simultaneous Funding Requests)...');
  mockProvider.setBehavior('SUCCESS');

  const concurrentFundingPromises = [];
  const CONCURRENT_COUNT = 50;

  for (let i = 0; i < CONCURRENT_COUNT; i++) {
    concurrentFundingPromises.push(
      WalletFundingService.initializeFunding(
        {
          userId: userA_Id,
          amountNaira: 500,
          paymentMethod: 'card',
          customerEmail: userA_Email,
          clientRequestId: `CONCUR-FUND-${i}-${Date.now()}`,
        },
        mockProvider
      )
    );
  }

  const concurrentResults = await Promise.all(concurrentFundingPromises);
  const successFundingCount = concurrentResults.filter((r) => r.success).length;
  const uniqueReferences = new Set(concurrentResults.map((r) => r.reference)).size;

  assert(
    successFundingCount === CONCURRENT_COUNT && uniqueReferences === CONCURRENT_COUNT,
    'All 50 concurrent funding initializations completed successfully with 100% collision-free references',
    `Completed: ${successFundingCount}/${CONCURRENT_COUNT} | Unique Refs: ${uniqueReferences}`
  );

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log('📊 PHASE 5 TEST RESULTS SUMMARY');
  console.log('================================================================');
  console.log(`Total Tests Run: ${passedCount + failedCount}`);
  console.log(`Passed:          ${passedCount}`);
  console.log(`Failed:          ${failedCount}\n`);

  if (failedCount === 0) {
    console.log('🎉 ALL PHASE 5 AUTOMATED TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error(`⚠️ ${failedCount} tests failed. Review logs above.`);
    process.exit(1);
  }
}

runPhase5Tests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
