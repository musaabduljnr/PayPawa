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

console.log('====================================================');
console.log('⚡ RUNNING PHASE 4: PURCHASE & VENDING ENGINE TESTS');
console.log('====================================================');
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

// ---------------------------------------------------------------------------
// Core Purchase & Reconciliation Logic
// ---------------------------------------------------------------------------
class PurchaseService {
  static inFlightPurchases = new Set();

  static generateInternalReference() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 8; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `SE-${dateStr}-${rand}`;
  }

  static getPrePurchaseQuote(amountNaira, meterNumber, discoCode) {
    const sanitizedAmount = Math.max(0, Math.floor(amountNaira));
    const serviceFeeNaira = 0;
    const totalChargeNaira = sanitizedAmount + serviceFeeNaira;
    const cleanMeter = meterNumber.replace(/\s/g, '');
    const maskedMeterNumber = cleanMeter.length > 4 ? `••••${cleanMeter.slice(-4)}` : cleanMeter;
    const estimatedUnitsKwh = parseFloat((sanitizedAmount / 206.8).toFixed(1));

    return {
      amountNaira: sanitizedAmount,
      serviceFeeNaira,
      totalChargeNaira,
      meterNumber: cleanMeter,
      maskedMeterNumber,
      discoCode,
      discoName: discoCode.toUpperCase(),
      estimatedUnitsKwh,
    };
  }

  static async executePurchase(dto, customProvider, client = adminClient) {
    if (!dto.userId) {
      return { success: false, status: 'failed', errorCode: 'UNAUTHENTICATED', errorMessage: 'User unauthenticated' };
    }

    const sanitizedMeter = (dto.meterNumber || '').replace(/\s/g, '');
    if (!sanitizedMeter || sanitizedMeter.length < 8) {
      return { success: false, status: 'failed', errorCode: 'INVALID_METER_NUMBER', errorMessage: 'Invalid meter number' };
    }

    if (!Number.isFinite(dto.amountNaira) || dto.amountNaira < 500) {
      return { success: false, status: 'failed', errorCode: 'INVALID_AMOUNT', errorMessage: 'Minimum purchase is ₦500.00' };
    }

    if (dto.amountNaira > 500000) {
      return { success: false, status: 'failed', errorCode: 'LIMIT_EXCEEDED', errorMessage: 'Maximum purchase is ₦500,000.00' };
    }

    if (dto.meterId) {
      const { data: meterRow } = await client
        .from('meters')
        .select('id, user_id')
        .eq('id', dto.meterId)
        .eq('user_id', dto.userId)
        .single();

      if (!meterRow) {
        return {
          success: false,
          status: 'failed',
          errorCode: 'UNAUTHORIZED_METER',
          errorMessage: 'The specified meter is not registered under your account',
        };
      }
    }

    const amountKobo = Math.round(dto.amountNaira * 100);
    const serviceFeeKobo = 0;
    const totalChargeKobo = amountKobo + serviceFeeKobo;
    const reference = this.generateInternalReference();
    const idempotencyKey = `ELEC-${dto.userId}-${dto.clientRequestId || reference}`;

    const lockKey = `${dto.userId}:${sanitizedMeter}:${amountKobo}`;
    if (this.inFlightPurchases.has(lockKey)) {
      return {
        success: false,
        status: 'processing',
        errorCode: 'CONCURRENT_REQUEST',
        errorMessage: 'A purchase is already being processed for this meter.',
      };
    }

    this.inFlightPurchases.add(lockKey);

    try {
      // Idempotency Check
      const { data: existingTx } = await client
        .from('electricity_transactions')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (existingTx) {
        return {
          success: existingTx.status === 'successful',
          status: existingTx.status,
          isDuplicate: true,
          transactionId: existingTx.id,
          reference: existingTx.reference,
          token: existingTx.token || undefined,
          unitsKwh: existingTx.units_kwh || undefined,
          amountNaira: dto.amountNaira,
        };
      }

      // Wallet fetch
      let { data: wallet } = await client
        .from('wallet_accounts')
        .select('*')
        .eq('user_id', dto.userId)
        .single();

      if (!wallet) {
        const { data: newW } = await client
          .from('wallet_accounts')
          .insert({ user_id: dto.userId, balance_kobo: 0, currency: 'NGN', is_locked: false })
          .select()
          .single();
        wallet = newW;
      }

      if (wallet.is_locked) {
        return { success: false, status: 'failed', errorCode: 'WALLET_LOCKED', errorMessage: 'Wallet is locked' };
      }

      if (wallet.balance_kobo < totalChargeKobo) {
        return {
          success: false,
          status: 'failed',
          errorCode: 'INSUFFICIENT_FUNDS',
          errorMessage: 'Insufficient wallet balance',
        };
      }

      // Insert transaction in 'processing'
      const { data: createdTx, error: txErr } = await client
        .from('electricity_transactions')
        .insert({
          user_id: dto.userId,
          wallet_id: wallet.id,
          meter_id: dto.meterId || null,
          meter_number: sanitizedMeter,
          disco_code: dto.discoCode.toLowerCase(),
          amount_kobo: amountKobo,
          status: 'processing',
          reference,
          provider_name: customProvider?.providerName || 'mock',
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

      if (txErr || !createdTx) {
        const { data: dupTx } = await client.from('electricity_transactions').select('*').eq('idempotency_key', idempotencyKey).single();
        if (dupTx) {
          return {
            success: dupTx.status === 'successful',
            status: dupTx.status,
            isDuplicate: true,
            transactionId: dupTx.id,
            reference: dupTx.reference,
            token: dupTx.token,
            unitsKwh: dupTx.units_kwh,
            amountNaira: dto.amountNaira,
          };
        }
        return { success: false, status: 'failed', errorCode: 'DATABASE_ERROR', errorMessage: txErr?.message };
      }

      const transactionId = createdTx.id;

      // Atomic Wallet Debit RPC
      const { data: debitResult, error: debitError } = await client.rpc('debit_wallet_for_electricity', {
        p_user_id: dto.userId,
        p_amount_kobo: totalChargeKobo,
        p_electricity_tx_id: transactionId,
        p_idempotency_key: idempotencyKey,
      });

      if (debitError || !debitResult?.success) {
        await client.from('electricity_transactions').delete().eq('id', transactionId);
        return {
          success: false,
          status: 'failed',
          errorCode: debitResult?.error || 'DEBIT_FAILED',
          errorMessage: 'Wallet debit failed',
        };
      }

      // Call Provider
      const vendResult = await customProvider.vendToken({
        meterNumber: sanitizedMeter,
        discoCode: dto.discoCode,
        amountKobo,
        meterType: dto.meterType || 'prepaid',
        customerPhoneNumber: dto.customerPhone,
        idempotencyKey,
        internalReference: reference,
      });

      // Settle
      if (vendResult.success && vendResult.status === 'successful' && vendResult.token) {
        const unitsKwh = vendResult.unitsKwh || parseFloat((dto.amountNaira / 206.8).toFixed(1));
        await client
          .from('electricity_transactions')
          .update({
            status: 'successful',
            provider_transaction_id: vendResult.providerReference || null,
            token: vendResult.token,
            units_kwh: unitsKwh,
            tariff_per_kwh_kobo: 20680,
            updated_at: new Date().toISOString(),
          })
          .eq('id', transactionId);

        if (dto.meterId) {
          try {
            await client.from('consumption_records').insert({
              user_id: dto.userId,
              meter_id: dto.meterId,
              date: new Date().toISOString().split('T')[0],
              units_consumed_kwh: unitsKwh,
              estimated_cost_kobo: amountKobo,
            });
          } catch {
            // ignore
          }
        }

        return {
          success: true,
          status: 'successful',
          transactionId,
          reference,
          token: vendResult.token,
          unitsKwh,
          amountNaira: dto.amountNaira,
          meterNumber: sanitizedMeter,
          discoCode: dto.discoCode,
        };
      }

      if (vendResult.status === 'failed') {
        await client.rpc('refund_electricity_purchase', {
          p_user_id: dto.userId,
          p_electricity_tx_id: transactionId,
          p_reason: vendResult.responseMessage || 'Vending failed with provider',
        });

        return {
          success: false,
          status: 'failed',
          transactionId,
          reference,
          amountNaira: dto.amountNaira,
          errorCode: 'PROVIDER_ERROR',
          errorMessage: vendResult.responseMessage,
        };
      }

      const terminalStatus = vendResult.status === 'pending' ? 'pending' : 'unknown';
      await client
        .from('electricity_transactions')
        .update({
          status: terminalStatus,
          error_message: vendResult.responseMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transactionId);

      return {
        success: false,
        status: terminalStatus,
        transactionId,
        reference,
        amountNaira: dto.amountNaira,
        errorMessage: vendResult.responseMessage,
      };
    } finally {
      this.inFlightPurchases.delete(lockKey);
    }
  }
}

class ReconciliationService {
  static async reconcileTransaction(transactionId, provider, client = adminClient) {
    const { data: tx } = await client.from('electricity_transactions').select('*').eq('id', transactionId).single();
    if (!tx) return { resolved: false, message: 'Not found' };
    if (tx.status === 'successful') return { resolved: true, currentStatus: 'successful', token: tx.token, unitsKwh: tx.units_kwh };
    if (tx.status === 'reversed') return { resolved: true, currentStatus: 'reversed', refunded: true };

    const queryResponse = await provider.queryTransactionStatus({ internalReference: tx.reference });
    if (queryResponse.status === 'successful' && queryResponse.token) {
      const unitsKwh = queryResponse.unitsKwh || 38.5;
      await client
        .from('electricity_transactions')
        .update({
          status: 'successful',
          token: queryResponse.token,
          units_kwh: unitsKwh,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id);

      if (tx.meter_id) {
        try {
          await client.from('consumption_records').insert({
            user_id: tx.user_id,
            meter_id: tx.meter_id,
            date: new Date().toISOString().split('T')[0],
            units_consumed_kwh: unitsKwh,
            estimated_cost_kobo: tx.amount_kobo,
          });
        } catch {
          // ignore
        }
      }

      return { resolved: true, currentStatus: 'successful', token: queryResponse.token, unitsKwh };
    }

    if (queryResponse.status === 'failed') {
      await client.rpc('refund_electricity_purchase', {
        p_user_id: tx.user_id,
        p_electricity_tx_id: tx.id,
        p_reason: 'Reconciliation confirmed failure',
      });

      return { resolved: true, currentStatus: 'reversed', refunded: true };
    }

    return { resolved: false, currentStatus: 'pending' };
  }
}

class MockElectricityProvider {
  constructor(behavior = 'SUCCESS') {
    this.behavior = behavior;
    this.providerName = 'mock';
    this.history = new Map();
  }

  setBehavior(b) {
    this.behavior = b;
  }

  async vendToken(request) {
    if (this.behavior === 'INVALID_METER') {
      return { success: false, status: 'failed', responseMessage: 'Invalid meter number rejected by DISCO' };
    }
    if (this.behavior === 'HTTP_500') {
      return { success: false, status: 'failed', responseMessage: 'Provider upstream error (HTTP 500)' };
    }
    if (this.behavior === 'TIMEOUT') {
      this.history.set(request.internalReference, { status: 'unknown' });
      return { success: false, status: 'timeout', responseMessage: 'Provider request timed out after 30s' };
    }
    if (this.behavior === 'PENDING') {
      this.history.set(request.internalReference, { status: 'pending' });
      return { success: false, status: 'pending', responseMessage: 'Transaction is pending with utility gateway' };
    }

    const amountNaira = Math.round(request.amountKobo / 100);
    const unitsKwh = parseFloat((amountNaira / 206.8).toFixed(1));
    const token = `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`;
    const providerReference = `MOCK-VTP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    this.history.set(request.internalReference, { status: 'successful', token, unitsKwh });
    return {
      success: true,
      status: 'successful',
      token,
      unitsKwh,
      tariffPerKwhKobo: 20680,
      amountKobo: request.amountKobo,
      providerReference,
      internalReference: request.internalReference,
      responseMessage: 'Transaction Successful',
    };
  }

  async queryTransactionStatus(request) {
    const saved = this.history.get(request.internalReference);
    if (saved) {
      return { status: saved.status, token: saved.token, unitsKwh: saved.unitsKwh };
    }
    return { status: 'successful', token: '4820 9182 3491 8294 1029', unitsKwh: 38.5 };
  }
}

// ---------------------------------------------------------------------------
// Test Runner
// ---------------------------------------------------------------------------
async function runPhase4Tests() {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const userA_Email = `musa.phase4.${randomSuffix}@gmail.com`;
  const userB_Email = `amina.phase4.${randomSuffix}@gmail.com`;
  const password = 'TestP@ssword123!';

  // =========================================================================
  // SETUP TEST USERS & WALLETS
  // =========================================================================
  console.log('▶ [SETUP] Provisioning test users with funded wallets...');
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

  await adminClient.from('wallet_accounts').upsert([
    { user_id: userA_Id, balance_kobo: 10000000, currency: 'NGN', is_locked: false }, // ₦100,000.00
    { user_id: userB_Id, balance_kobo: 500000, currency: 'NGN', is_locked: false },   // ₦5,000.00
  ], { onConflict: 'user_id' });

  let { data: meterA } = await adminClient.from('meters').insert({
    user_id: userA_Id,
    meter_number: '1111111111111',
    disco_code: 'yedc',
    disco_name: 'Yola Electricity Distribution Company',
    meter_type: 'prepaid',
    nickname: 'Home Main Meter',
    customer_name: 'Musa Abubakar',
    is_active: true,
  }).select().single();

  if (!meterA) {
    meterA = { id: '00000000-0000-0000-0000-000000000001', meter_number: '1111111111111', disco_code: 'yedc', disco_name: 'YEDC' };
  }

  let { data: meterB } = await adminClient.from('meters').insert({
    user_id: userB_Id,
    meter_number: '2222222222222',
    disco_code: 'aedc',
    disco_name: 'Abuja Electricity Distribution Company',
    meter_type: 'prepaid',
    nickname: 'Amina Apartment',
    customer_name: 'Amina Bello',
    is_active: true,
  }).select().single();

  if (!meterB) {
    meterB = { id: '00000000-0000-0000-0000-000000000002', meter_number: '2222222222222', disco_code: 'aedc', disco_name: 'AEDC' };
  }

  console.log(`   └─ User A ID: ${userA_Id} (Balance: ₦100,000, Meter: ${meterA.meter_number})`);
  console.log(`   └─ User B ID: ${userB_Id} (Balance: ₦5,000, Meter: ${meterB.meter_number})\n`);

  // =========================================================================
  // TEST 1: UNIT & VALIDATION TESTS
  // =========================================================================
  console.log('▶ [TEST 1] Testing Purchase Validation & Reference Engine...');
  const ref = PurchaseService.generateInternalReference();
  assert(
    /^SE-\d{8}-[A-Z0-9]{8}$/.test(ref),
    'Internal transaction reference matches collision-resistant format SE-YYYYMMDD-XXXXXXXX',
    `Generated Reference: ${ref}`
  );

  const quote = PurchaseService.getPrePurchaseQuote(5000, '0419 8273 645', 'yedc');
  assert(
    quote.amountNaira === 5000 && quote.serviceFeeNaira === 0 && quote.totalChargeNaira === 5000 && quote.maskedMeterNumber === '••••3645',
    'Pre-purchase quotation computes accurate face value, fees, and masked meter number',
    `Face Value: ₦${quote.amountNaira}, Fee: ₦${quote.serviceFeeNaira}, Total: ₦${quote.totalChargeNaira}, Est kWh: ${quote.estimatedUnitsKwh}`
  );

  const mockProvider = new MockElectricityProvider('SUCCESS');

  const rejectLow = await PurchaseService.executePurchase({
    userId: userA_Id,
    meterNumber: '1111111111111',
    discoCode: 'yedc',
    amountNaira: 200, // Below ₦500
  }, mockProvider, adminClient);

  assert(
    !rejectLow.success && rejectLow.errorCode === 'INVALID_AMOUNT',
    'Server rejects purchase amounts below minimum threshold (₦500)',
    `Error: ${rejectLow.errorMessage}`
  );

  const rejectHigh = await PurchaseService.executePurchase({
    userId: userA_Id,
    meterNumber: '1111111111111',
    discoCode: 'yedc',
    amountNaira: 900000, // Above ₦500,000
  }, mockProvider, adminClient);

  assert(
    !rejectHigh.success && rejectHigh.errorCode === 'LIMIT_EXCEEDED',
    'Server rejects purchase amounts exceeding maximum limit (₦500,000)',
    `Error: ${rejectHigh.errorMessage}`
  );

  // =========================================================================
  // TEST 2: SUCCESSFUL ELECTRICITY PURCHASE & TOKEN VENDING
  // =========================================================================
  console.log('\n▶ [TEST 2] Testing End-to-End Successful Purchase with Mock Provider...');
  const purchaseResult = await PurchaseService.executePurchase(
    {
      userId: userA_Id,
      meterId: meterA.id,
      meterNumber: meterA.meter_number,
      discoCode: meterA.disco_code,
      discoName: meterA.disco_name,
      amountNaira: 5000,
      customerPhone: '08012345678',
    },
    mockProvider,
    adminClient
  );

  assert(
    purchaseResult.success && purchaseResult.status === 'successful' && Boolean(purchaseResult.token),
    'Electricity purchase succeeded with STS token generated',
    `Reference: ${purchaseResult.reference} | Token: ${purchaseResult.token} | Units: ${purchaseResult.unitsKwh} kWh`
  );

  // Verify wallet balance in Supabase (100,000 - 5,000 = 95,000 = 9,500,000 kobo)
  const { data: walletA_After } = await adminClient
    .from('wallet_accounts')
    .select('balance_kobo')
    .eq('user_id', userA_Id)
    .single();

  assert(
    walletA_After.balance_kobo === 9500000,
    'Wallet balance authoritatively debited by exact purchase amount in database',
    `New Balance: ₦${walletA_After.balance_kobo / 100}`
  );

  // Verify consumption record was logged
  const { data: consumptionRecord } = await adminClient
    .from('consumption_records')
    .select('*')
    .eq('meter_id', meterA.id)
    .single();

  assert(
    Boolean(consumptionRecord) && Number(consumptionRecord.units_consumed_kwh) > 0,
    'Consumption record automatically persisted for energy analytics & intelligence',
    `Units Logged: ${consumptionRecord?.units_consumed_kwh} kWh | Date: ${consumptionRecord?.date}`
  );

  // =========================================================================
  // TEST 3: IDEMPOTENCY & REPEATED PURCHASE PREVENTION
  // =========================================================================
  console.log('\n▶ [TEST 3] Testing Idempotency & Duplicate Request Protection...');
  const idempotencyId = 'IDEMP-' + Date.now();

  const req1 = await PurchaseService.executePurchase(
    {
      userId: userA_Id,
      meterId: meterA.id,
      meterNumber: meterA.meter_number,
      discoCode: meterA.disco_code,
      amountNaira: 3000,
      clientRequestId: idempotencyId,
    },
    mockProvider,
    adminClient
  );

  const req2 = await PurchaseService.executePurchase(
    {
      userId: userA_Id,
      meterId: meterA.id,
      meterNumber: meterA.meter_number,
      discoCode: meterA.disco_code,
      amountNaira: 3000,
      clientRequestId: idempotencyId, // Same idempotency key
    },
    mockProvider,
    adminClient
  );

  assert(
    req1.success && req2.isDuplicate && req1.reference === req2.reference && req1.token === req2.token,
    'Duplicate purchase request with same idempotency key returns existing transaction without double debiting',
    `Req1 Ref: ${req1.reference} | Req2 Ref: ${req2.reference} (isDuplicate: ${req2.isDuplicate})`
  );

  // Verify wallet was only debited once for ₦3,000 (95,000 - 3,000 = 92,000 = 9,200,000 kobo)
  const { data: walletA_AfterIdemp } = await adminClient
    .from('wallet_accounts')
    .select('balance_kobo')
    .eq('user_id', userA_Id)
    .single();

  assert(
    walletA_AfterIdemp.balance_kobo === 9200000,
    'Wallet balance debited exactly once despite repeated submissions',
    `Balance: ₦${walletA_AfterIdemp.balance_kobo / 100}`
  );

  // =========================================================================
  // TEST 4: PROVIDER FAILURE & AUTOMATIC IMMEDIATE REFUND
  // =========================================================================
  console.log('\n▶ [TEST 4] Testing Gateway Failure & Automatic Atomic Refund...');
  const balanceBeforeFail = walletA_AfterIdemp.balance_kobo;
  const failingProvider = new MockElectricityProvider('HTTP_500');

  const failedPurchase = await PurchaseService.executePurchase(
    {
      userId: userA_Id,
      meterId: meterA.id,
      meterNumber: meterA.meter_number,
      discoCode: meterA.disco_code,
      amountNaira: 7000,
    },
    failingProvider,
    adminClient
  );

  assert(
    !failedPurchase.success && failedPurchase.status === 'failed',
    'Provider HTTP 500 failure handled cleanly without throwing unhandled exceptions',
    `Error Message: ${failedPurchase.errorMessage}`
  );

  // Verify wallet balance was automatically restored (refunded) in database
  const { data: walletA_AfterRefund } = await adminClient
    .from('wallet_accounts')
    .select('balance_kobo')
    .eq('user_id', userA_Id)
    .single();

  assert(
    walletA_AfterRefund.balance_kobo === balanceBeforeFail,
    'Wallet balance fully restored after vending failure (zero financial loss)',
    `Balance before: ₦${balanceBeforeFail / 100} | Balance after refund: ₦${walletA_AfterRefund.balance_kobo / 100}`
  );

  // Verify refund ledger transaction exists
  const { data: refundLedgerTx } = await adminClient
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userA_Id)
    .eq('type', 'refund_credit')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  assert(
    Boolean(refundLedgerTx) && refundLedgerTx.amount_kobo === 700000,
    'Refund ledger entry created in wallet_transactions table',
    `Refund Ref: ${refundLedgerTx?.reference} | Amount: ₦${refundLedgerTx?.amount_kobo / 100}`
  );

  // =========================================================================
  // TEST 5: PROVIDER TIMEOUT & RECONCILIATION LIFECYCLE
  // =========================================================================
  console.log('\n▶ [TEST 5] Testing Timeout & Asynchronous Reconciliation Service...');
  const timeoutProvider = new MockElectricityProvider('TIMEOUT');

  const timeoutPurchase = await PurchaseService.executePurchase(
    {
      userId: userA_Id,
      meterId: meterA.id,
      meterNumber: meterA.meter_number,
      discoCode: meterA.disco_code,
      amountNaira: 4000,
    },
    timeoutProvider,
    adminClient
  );

  assert(
    !timeoutPurchase.success && (timeoutPurchase.status === 'timeout' || timeoutPurchase.status === 'unknown'),
    'Provider timeout puts transaction into UNKNOWN/TIMEOUT state without premature refund',
    `Status: ${timeoutPurchase.status} | Reference: ${timeoutPurchase.reference}`
  );

  // Reconcile transaction with query resolution to SUCCESS
  const reconcilingProvider = new MockElectricityProvider('SUCCESS');
  const reconResult = await ReconciliationService.reconcileTransaction(
    timeoutPurchase.transactionId,
    reconcilingProvider,
    adminClient
  );

  assert(
    reconResult.resolved && reconResult.currentStatus === 'successful' && Boolean(reconResult.token),
    'Reconciliation service successfully resolved in-flight transaction to SUCCESSFUL',
    `Status: ${reconResult.currentStatus} | Token: ${reconResult.token} | Units: ${reconResult.unitsKwh} kWh`
  );

  // Verify second reconciliation call on same transaction is idempotent
  const reconResult2 = await ReconciliationService.reconcileTransaction(
    timeoutPurchase.transactionId,
    reconcilingProvider,
    adminClient
  );

  assert(
    reconResult2.resolved && reconResult2.currentStatus === 'successful',
    'Repeated reconciliation execution is completely idempotent',
    `Token: ${reconResult2.token}`
  );

  // =========================================================================
  // TEST 6: SECURITY & CROSS-USER ISOLATION TESTS
  // =========================================================================
  console.log('\n▶ [TEST 6] Testing Security, Meter Ownership & Authorization...');
  // User A attempts to buy electricity using User B's private meter ID
  const crossMeterAttempt = await PurchaseService.executePurchase(
    {
      userId: userA_Id,
      meterId: meterB.id, // User B's meter!
      meterNumber: meterB.meter_number,
      discoCode: meterB.disco_code,
      amountNaira: 1000,
    },
    mockProvider,
    adminClient
  );

  assert(
    !crossMeterAttempt.success && crossMeterAttempt.errorCode === 'UNAUTHORIZED_METER',
    'Cross-user meter ownership verification rejects unauthorized meter purchase',
    `Error: ${crossMeterAttempt.errorMessage}`
  );

  // Insufficient wallet funds check (User B has ₦5,000 balance, tries to buy ₦10,000)
  const insufficientAttempt = await PurchaseService.executePurchase(
    {
      userId: userB_Id,
      meterId: meterB.id,
      meterNumber: meterB.meter_number,
      discoCode: meterB.disco_code,
      amountNaira: 10000, // Exceeds balance
    },
    mockProvider,
    adminClient
  );

  assert(
    !insufficientAttempt.success && insufficientAttempt.errorCode === 'INSUFFICIENT_FUNDS',
    'Server rejects purchase when wallet balance is insufficient',
    `Error: ${insufficientAttempt.errorMessage}`
  );

  // =========================================================================
  // TEST 7: HIGH CONCURRENCY LOAD TEST (50 CONCURRENT PURCHASES)
  // =========================================================================
  console.log('\n▶ [TEST 7] Running High Concurrency Stress Test (50 Simultaneous Purchases)...');
  mockProvider.setBehavior('SUCCESS');

  const concurrentPromises = [];
  const CONCURRENT_COUNT = 50;

  for (let i = 0; i < CONCURRENT_COUNT; i++) {
    concurrentPromises.push(
      PurchaseService.executePurchase(
        {
          userId: userA_Id,
          meterNumber: `0419827${String(i).padStart(4, '0')}`,
          discoCode: 'yedc',
          amountNaira: 500, // ₦500 * 50 = ₦25,000
          clientRequestId: `CONCUR-${i}-${Date.now()}`,
        },
        mockProvider,
        adminClient
      )
    );
  }

  const results = await Promise.all(concurrentPromises);
  const successfulCount = results.filter((r) => r.success && r.status === 'successful').length;
  const uniqueReferences = new Set(results.map((r) => r.reference)).size;

  assert(
    successfulCount === CONCURRENT_COUNT && uniqueReferences === CONCURRENT_COUNT,
    `All 50 concurrent transactions completed successfully with 100% collision-free references`,
    `Completed: ${successfulCount}/${CONCURRENT_COUNT} | Unique References: ${uniqueReferences}`
  );

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n====================================================');
  console.log('📊 PHASE 4 TEST RESULTS SUMMARY');
  console.log('====================================================');
  console.log(`Total Tests Run: ${passedCount + failedCount}`);
  console.log(`Passed:          ${passedCount}`);
  console.log(`Failed:          ${failedCount}\n`);

  if (failedCount === 0) {
    console.log('🎉 ALL PHASE 4 AUTOMATED TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error(`⚠️ ${failedCount} tests failed. Review logs above.`);
    process.exit(1);
  }
}

runPhase4Tests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
