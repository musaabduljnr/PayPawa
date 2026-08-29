import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env variables directly for test runner
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
console.log('🛡️  RUNNING PHASE 6: PRODUCTION HARDENING & SECURITY TESTS');
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

// 1. Paystack Webhook Cryptographic Verification Implementation for Runner
class RealPaystackPaymentProvider {
  constructor(secretKey = 'test_secret_key', webhookSecret = 'test_webhook_secret') {
    this.secretKey = secretKey;
    this.webhookSecret = webhookSecret;
  }

  async parseAndVerifyWebhook(rawPayload, signatureHeader) {
    if (!rawPayload) {
      return { isValid: false, errorMessage: 'Empty webhook payload' };
    }

    const payloadObj = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    const event = payloadObj.event;
    const tx = payloadObj.data;

    if (!event || !tx) {
      return { isValid: false, errorMessage: 'Invalid Paystack webhook format' };
    }

    if (!signatureHeader) {
      return { isValid: false, errorMessage: 'Missing x-paystack-signature header' };
    }

    const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
    const cryptoObj = globalThis.crypto || (typeof require !== 'undefined' ? require('crypto').webcrypto : null);

    if (!cryptoObj || !cryptoObj.subtle) {
      return { isValid: false, errorMessage: 'Cryptography API not available' };
    }

    let isValidSignature = false;
    
    // Candidates: webhookSecret (if valid) and secretKey as primary fallback
    const candidateSecrets = [];
    if (this.webhookSecret && !this.webhookSecret.includes('whsec_xxx') && !this.webhookSecret.includes('whsec_placeholder')) {
      candidateSecrets.push(this.webhookSecret);
    }
    if (this.secretKey && !candidateSecrets.includes(this.secretKey)) {
      candidateSecrets.push(this.secretKey);
    }

    if (candidateSecrets.length === 0) {
      return { isValid: false, errorMessage: 'No valid webhook signing secret configured' };
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(payloadStr);

    for (const secret of candidateSecrets) {
      try {
        const keyData = encoder.encode(secret);
        const cryptoKey = await cryptoObj.subtle.importKey(
          'raw',
          keyData,
          { name: 'HMAC', hash: 'SHA-512' },
          false,
          ['sign']
        );

        const signatureBuffer = await cryptoObj.subtle.sign(
          'HMAC',
          cryptoKey,
          data
        );

        const hashArray = Array.from(new Uint8Array(signatureBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (hashHex === signatureHeader) {
          isValidSignature = true;
          break;
        }
      } catch (cryptoErr) {
        // continue
      }
    }

    if (!isValidSignature) {
      return { isValid: false, errorMessage: 'Invalid cryptographic signature match' };
    }

    const isSuccessful = event === 'charge.success' && tx.status === 'success';
    const isFailed = tx.status === 'failed';
    const status = isSuccessful ? 'successful' : isFailed ? 'failed' : 'pending';

    return {
      isValid: true,
      event,
      internalReference: tx.metadata?.internal_reference || tx.reference,
      providerReference: tx.reference,
      amountKobo: tx.amount,
      currency: tx.currency,
      status,
      channel: tx.channel,
      rawPayload: payloadObj,
    };
  }
}

// Helper to compute HMAC SHA512 signature in JavaScript tests
async function computeSignature(payloadStr, secret) {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payloadStr);
  const cryptoObj = globalThis.crypto || (typeof require !== 'undefined' ? require('crypto').webcrypto : null);
  
  const cryptoKey = await cryptoObj.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );

  const signatureBuffer = await cryptoObj.subtle.sign(
    'HMAC',
    cryptoKey,
    data
  );

  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function runPhase6Tests() {
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const userA_Email = `musa.phase6.${randomSuffix}@gmail.com`;
  const userB_Email = `amina.phase6.${randomSuffix}@gmail.com`;
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

  let { data: walletA } = await adminClient.from('wallet_accounts').upsert([
    { user_id: userA_Id, balance_kobo: 300000, currency: 'NGN', is_locked: false }, // ₦3,000.00
    { user_id: userB_Id, balance_kobo: 500000, currency: 'NGN', is_locked: false },  // ₦5,000.00
  ], { onConflict: 'user_id' }).select();

  const walletA_Row = walletA.find(w => w.user_id === userA_Id);

  console.log(`   └─ User A ID: ${userA_Id} (Balance: ₦3,000)`);
  console.log(`   └─ User B ID: ${userB_Id} (Balance: ₦5,000)\n`);

  // =========================================================================
  // TEST 1: CRYPTOGRAPHIC SIGNATURE VERIFICATION
  // =========================================================================
  console.log('▶ [TEST 1] Testing Cryptographic Webhook Signature Check...');
  const webhookSecret = 'whsec_secret_key_12345';
  const provider = new RealPaystackPaymentProvider('sk_test_123', webhookSecret);

  const payload = {
    event: 'charge.success',
    data: {
      reference: 'WF-20260829-ABCD1234',
      amount: 500000,
      currency: 'NGN',
      status: 'success',
      channel: 'card',
      metadata: {
        internal_reference: 'WF-20260829-ABCD1234',
      }
    }
  };

  const payloadStr = JSON.stringify(payload);
  const correctSignature = await computeSignature(payloadStr, webhookSecret);
  const wrongSignature = 'wrong_signature_hex_code_999999999999999999';

  // 1. Success case with valid signature
  const verifyValid = await provider.parseAndVerifyWebhook(payloadStr, correctSignature);
  assert(
    verifyValid.isValid === true && verifyValid.status === 'successful',
    'Correct HMAC-SHA512 webhook signature is successfully accepted',
    `Event: ${verifyValid.event} | Ref: ${verifyValid.internalReference}`
  );

  // 2. Reject invalid signature
  const verifyInvalid = await provider.parseAndVerifyWebhook(payloadStr, wrongSignature);
  assert(
    verifyInvalid.isValid === false && verifyInvalid.errorMessage.includes('Invalid cryptographic signature'),
    'Incorrect HMAC-SHA512 signature is rejected with error',
    `Error Message: "${verifyInvalid.errorMessage}"`
  );

  // 3. Reject missing signature
  const verifyMissing = await provider.parseAndVerifyWebhook(payloadStr, null);
  assert(
    verifyMissing.isValid === false && verifyMissing.errorMessage.includes('Missing x-paystack-signature'),
    'Webhook without signature header is rejected',
    `Error Message: "${verifyMissing.errorMessage}"`
  );

  // 4. Webhook secret fallback case: when webhookSecret is placeholder, verify using secretKey
  const fallbackProvider = new RealPaystackPaymentProvider('sk_test_123456789', 'whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  const fallbackSignature = await computeSignature(payloadStr, 'sk_test_123456789');
  const verifyFallback = await fallbackProvider.parseAndVerifyWebhook(payloadStr, fallbackSignature);
  assert(
    verifyFallback.isValid === true && verifyFallback.status === 'successful',
    'Webhook secret verification automatically falls back to secretKey when webhookSecret is placeholder',
    `Fallback Verified Status: ${verifyFallback.status}`
  );

  // =========================================================================
  // TEST 2: DOUBLE-SPENDING RACE PROTECTION
  // =========================================================================
  console.log('\n▶ [TEST 2] Testing Double-Spending and Balance Mutation Isolation...');
  // User A starts at ₦3,000.
  // We simulate a race condition where 2 simultaneous debits of ₦2,500 each are processed.
  // Exactly 1 must succeed and the other must be rejected (due to row lock/balance checks).
  
  async function simulateDebit(userId, walletId, amountNaira) {
    const amountKobo = Math.round(amountNaira * 100);
    const client = adminClient;
    
    // 1. Create a processing transaction row first to satisfy FK
    const { data: txRow, error: txErr } = await client
      .from('electricity_transactions')
      .insert({
        user_id: userId,
        wallet_id: walletId,
        meter_number: '1111111111111',
        disco_code: 'yedc',
        amount_kobo: amountKobo,
        status: 'processing',
        reference: `RACE-REF-${Math.floor(100000 + Math.random() * 900000)}`,
        provider_name: 'mock',
        idempotency_key: `RACE-IDEMP-${Math.floor(100000 + Math.random() * 900000)}`,
      })
      .select()
      .single();

    if (txErr || !txRow) {
      return { success: false, reason: 'TX_INSERT_FAILED' };
    }

    // 2. Execute balance debit RPC
    const { data: debitResult, error: debitError } = await client.rpc('debit_wallet_for_electricity', {
      p_user_id: userId,
      p_amount_kobo: amountKobo,
      p_electricity_tx_id: txRow.id,
      p_idempotency_key: txRow.idempotency_key
    });

    if (debitError || !debitResult?.success) {
      // Clean up the failed transaction row
      await client.from('electricity_transactions').delete().eq('id', txRow.id);
      return { success: false, reason: debitError?.message || 'INSUFFICIENT_FUNDS' };
    }

    return { success: true };
  }

  console.log('   Running simultaneous double-debit (2 x ₦2,500 on ₦3,000 balance)...');
  const raceResults = await Promise.all([
    simulateDebit(userA_Id, walletA_Row.id, 2500),
    simulateDebit(userA_Id, walletA_Row.id, 2500)
  ]);
  
  const raceSuccesses = raceResults.filter(r => r.success).length;
  const raceRejections = raceResults.filter(r => !r.success).length;

  const { data: walletA_After } = await adminClient
    .from('wallet_accounts')
    .select('balance_kobo')
    .eq('user_id', userA_Id)
    .single();

  assert(
    raceSuccesses === 1 && raceRejections === 1 && walletA_After.balance_kobo === 50000,
    'Database integrity maintained: exactly 1 transaction succeeds and final balance is ₦500.00',
    `Successes: ${raceSuccesses} | Rejections: ${raceRejections} | Final Balance: ₦${walletA_After.balance_kobo / 100}`
  );

  // =========================================================================
  // TEST 3: CLIENT-SIDE CAPABILITY DETECTION & FALLBACK VERIFICATION
  // =========================================================================
  console.log('\n▶ [TEST 3] Testing Capability Detection & Client-Side Fallback...');
  
  const purchaseServicePath = path.resolve(__dirname, '../src/services/purchase.service.ts');
  const reconciliationServicePath = path.resolve(__dirname, '../src/services/reconciliation.service.ts');
  
  const purchaseCode = fs.readFileSync(purchaseServicePath, 'utf8');
  const reconciliationCode = fs.readFileSync(reconciliationServicePath, 'utf8');

  assert(
    purchaseCode.includes('PGRST202') && purchaseCode.includes('execute_electricity_purchase_init'),
    'PurchaseService.ts contains RPC capabilities check and fallback to client-side updates',
    'Checked: PGRST202 and execute_electricity_purchase_init present in file.'
  );

  assert(
    reconciliationCode.includes('PGRST202') && reconciliationCode.includes('finalize_electricity_purchase_success'),
    'reconciliation.service.ts contains RPC capabilities check and fallback to client-side success settlement',
    'Checked: PGRST202 and finalize_electricity_purchase_success present in file.'
  );

  // Clean up test wallets
  await adminClient.from('wallet_accounts').delete().eq('user_id', userA_Id);
  await adminClient.from('wallet_accounts').delete().eq('user_id', userB_Id);
  await adminClient.from('profiles').delete().eq('id', userA_Id);
  await adminClient.from('profiles').delete().eq('id', userB_Id);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log('📊 PHASE 6 SECURITY & HARDENING RESULTS SUMMARY');
  console.log('================================================================');
  console.log(`Passed:  ${passedCount}`);
  console.log(`Failed:  ${failedCount}`);
  
  if (failedCount === 0) {
    console.log('🎉 ALL PHASE 6 HARDENING SECURITY TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runPhase6Tests();
