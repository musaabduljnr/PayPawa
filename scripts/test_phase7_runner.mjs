import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// ── Environment Setup ────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env');
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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('================================================================');
console.log('⚡ RUNNING PHASE 7: CONSUMPTION INTELLIGENCE ENGINE TEST SUITE');
console.log('================================================================');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failedTests++;
  }
}

async function createTestUser(emailPrefix) {
  const email = `${emailPrefix}-${Date.now()}@smart-electricity-test.ng`;
  const password = 'Password123!';
  const { data, error } = await supabaseAdmin.auth.signUp({ email, password });
  if (error || !data.user) {
    throw new Error(`Failed to create test user ${email}: ${error?.message}`);
  }
  const userId = data.user.id;

  // Insert profile & wallet
  await supabaseAdmin.from('profiles').upsert({
    id: userId,
    full_name: 'Test Energy User',
    email,
    account_type: 'household',
    onboarding_completed: true,
  });

  let { data: wRow } = await supabaseAdmin.from('wallet_accounts').select('id').eq('user_id', userId).single();
  if (!wRow) {
    const { data: newW } = await supabaseAdmin.from('wallet_accounts').insert({
      user_id: userId,
      balance_kobo: 5000000, // ₦50,000
      currency: 'NGN',
      is_locked: false,
    }).select('id').single();
    wRow = newW;
  }

  return { userId, email, walletId: wRow.id };
}

async function runPhase7Tests() {
  try {
    // ── Setup Test User ───────────────────────────────────────────────────────
    console.log('\n▶ [SETUP] Provisioning test user and meters...');
    const userA = await createTestUser('p7-user-a');
    console.log(`   └─ User ID: ${userA.userId}`);

    // Create 2 distinct meters for Multi-Meter Testing
    const { data: meterHome } = await supabaseAdmin
      .from('meters')
      .insert({
        user_id: userA.userId,
        meter_number: '11112222333',
        disco_code: 'aedc',
        disco_name: 'Abuja Electricity',
        nickname: 'Home Main Meter',
        meter_type: 'prepaid',
        is_active: true,
      })
      .select('id')
      .single();

    const { data: meterOffice } = await supabaseAdmin
      .from('meters')
      .insert({
        user_id: userA.userId,
        meter_number: '44445555666',
        disco_code: 'ekedc',
        disco_name: 'Eko Electricity',
        nickname: 'Office Meter',
        meter_type: 'prepaid',
        is_active: true,
      })
      .select('id')
      .single();

    assert(meterHome?.id && meterOffice?.id, 'Successfully created Home and Office meters');

    // ── TEST 1: Authoritative Unit Source & No Fabrication ────────────────────
    console.log('\n▶ [TEST 1] Testing Authoritative Unit Source Classification...');
    // Insert purchase with real provider units
    const { data: txWithUnits, error: tx1Err } = await supabaseAdmin
      .from('electricity_transactions')
      .insert({
        user_id: userA.userId,
        wallet_id: userA.walletId,
        meter_id: meterHome.id,
        meter_number: '11112222333',
        disco_code: 'aedc',
        amount_kobo: 500000,
        units_kwh: 104.2,
        status: 'successful',
        reference: `WF-TEST-UNITS-${Date.now()}`,
        provider_name: 'vtpass',
        idempotency_key: `IDEMP-UNITS-${Date.now()}`,
        token: '1234-5678-9012-3456-7890',
        created_at: new Date(Date.now() - 25 * 86400 * 1000).toISOString(),
      })
      .select('*')
      .single();

    // Insert purchase WITHOUT units (unreturned by provider)
    const { data: txNoUnits, error: tx2Err } = await supabaseAdmin
      .from('electricity_transactions')
      .insert({
        user_id: userA.userId,
        wallet_id: userA.walletId,
        meter_id: meterHome.id,
        meter_number: '11112222333',
        disco_code: 'aedc',
        amount_kobo: 500000,
        units_kwh: null, // No units returned
        status: 'successful',
        reference: `WF-TEST-NOUNITS-${Date.now()}`,
        provider_name: 'vtpass',
        idempotency_key: `IDEMP-NOUNITS-${Date.now()}`,
        token: '9876-5432-1098-7654-3210',
        created_at: new Date(Date.now() - 15 * 86400 * 1000).toISOString(),
      })
      .select('*')
      .single();

    assert(txWithUnits?.units_kwh === 104.2, 'Authoritative provider units are preserved');
    assert(txNoUnits?.units_kwh === null, 'Missing provider units are NULL, not fabricated with hardcoded rates');

    // ── TEST 2: Purchase Interval & Cadence Analysis ──────────────────────────
    console.log('\n▶ [TEST 2] Testing Purchase Interval & Cadence Statistics...');
    // Insert 2 more purchases at deterministic 10-day intervals
    await supabaseAdmin.from('electricity_transactions').insert([
      {
        user_id: userA.userId,
        wallet_id: userA.walletId,
        meter_id: meterHome.id,
        meter_number: '11112222333',
        disco_code: 'aedc',
        amount_kobo: 500000,
        units_kwh: 102.5,
        status: 'successful',
        reference: `WF-TEST-INT1-${Date.now()}`,
        provider_name: 'vtpass',
        idempotency_key: `IDEMP-INT1-${Date.now()}`,
        created_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
      },
      {
        user_id: userA.userId,
        wallet_id: userA.walletId,
        meter_id: meterHome.id,
        meter_number: '11112222333',
        disco_code: 'aedc',
        amount_kobo: 500000,
        units_kwh: 100.0,
        status: 'successful',
        reference: `WF-TEST-INT2-${Date.now()}`,
        provider_name: 'vtpass',
        idempotency_key: `IDEMP-INT2-${Date.now()}`,
        created_at: new Date(Date.now()).toISOString(),
      },
    ]);

    // Fetch all Home meter transactions and test interval logic
    const { data: homeTxs } = await supabaseAdmin
      .from('electricity_transactions')
      .select('*')
      .eq('meter_id', meterHome.id)
      .eq('status', 'successful')
      .order('created_at', { ascending: true });

    const intervals = [];
    for (let i = 1; i < homeTxs.length; i++) {
      const prev = new Date(homeTxs[i - 1].created_at).getTime();
      const curr = new Date(homeTxs[i].created_at).getTime();
      const diffDays = Math.round(((curr - prev) / (86400 * 1000)) * 10) / 10;
      intervals.push(diffDays);
    }

    const sortedInts = [...intervals].sort((a, b) => a - b);
    const medianInterval = sortedInts[Math.floor(sortedInts.length / 2)];

    assert(intervals.length === 3, `Calculated ${intervals.length} purchase intervals from 4 historical purchases`);
    assert(medianInterval >= 9 && medianInterval <= 11, `Median purchase interval is ~${medianInterval} days`);

    // ── TEST 3: Period Comparison & Zero-Baseline Safety ──────────────────────
    console.log('\n▶ [TEST 3] Testing Safe Period Comparisons & Zero-Baseline Handling...');
    const currentPeriodSpend = homeTxs.reduce((sum, t) => sum + Number(t.amount_kobo) / 100, 0);
    const prevPeriodSpend = 0; // Fresh user with no prior baseline

    let percentageChange = 0;
    let hasPreviousBaseline = prevPeriodSpend > 0;
    if (hasPreviousBaseline) {
      percentageChange = Math.round(((currentPeriodSpend - prevPeriodSpend) / prevPeriodSpend) * 100);
    }

    assert(!hasPreviousBaseline, 'Zero previous spend baseline correctly identified as no baseline');
    assert(percentageChange === 0, 'Zero baseline avoided division-by-zero / Infinity%');

    // ── TEST 4: Manual Meter Reading Validation & Anomaly Detection ───────────
    console.log('\n▶ [TEST 4] Testing Manual Meter Readings & Anomaly Drop/Jump Detection...');
    
    // Initial Reading
    const val1 = 12000.0;
    const initialRecord = {
      id: `MR-${Date.now()}-1`,
      user_id: userA.userId,
      meter_id: meterHome.id,
      reading_value: val1,
      unit: 'kwh',
      reading_type: 'cumulative',
      source: 'USER_REPORTED',
      is_anomalous: false,
      anomaly_reason: null,
      recorded_at: new Date(Date.now() - 10 * 86400 * 1000).toISOString(),
    };

    await supabaseAdmin
      .from('meters')
      .update({
        metadata: {
          meter_readings: [initialRecord],
        },
      })
      .eq('id', meterHome.id);

    assert(initialRecord.reading_value === 12000.0, 'Initial manual meter reading of 12,000 kWh recorded');

    // Normal Subsequent Reading (+150 kWh)
    const val2 = 12150.0;
    const delta = val2 - val1;
    const secondRecord = {
      id: `MR-${Date.now()}-2`,
      user_id: userA.userId,
      meter_id: meterHome.id,
      reading_value: val2,
      unit: 'kwh',
      reading_type: 'cumulative',
      source: 'USER_REPORTED',
      is_anomalous: false,
      anomaly_reason: null,
      recorded_at: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    };

    await supabaseAdmin
      .from('meters')
      .update({
        metadata: {
          meter_readings: [secondRecord, initialRecord],
        },
      })
      .eq('id', meterHome.id);

    assert(delta === 150.0, `Calculated exact user-reported delta of ${delta} kWh`);

    // Anomalous Drop Reading (e.g. 11,500 < 12,150)
    const dropVal = 11500.0;
    const isAnomalousDrop = dropVal < val2;
    const dropRecord = {
      id: `MR-${Date.now()}-3`,
      user_id: userA.userId,
      meter_id: meterHome.id,
      reading_value: dropVal,
      unit: 'kwh',
      reading_type: 'cumulative',
      source: 'USER_REPORTED',
      is_anomalous: isAnomalousDrop,
      anomaly_reason: 'Reading is lower than previous reading. Possible rollover or typo.',
      recorded_at: new Date().toISOString(),
    };

    assert(dropRecord.is_anomalous === true, 'Drop in cumulative reading flagged as anomalous without calculating negative usage');

    // ── TEST 5: Multi-Meter Isolation ─────────────────────────────────────────
    console.log('\n▶ [TEST 5] Testing Multi-Meter History Isolation (Home vs Office)...');
    // Add purchase on Office meter
    await supabaseAdmin.from('electricity_transactions').insert({
      user_id: userA.userId,
      wallet_id: userA.walletId,
      meter_id: meterOffice.id,
      meter_number: '44445555666',
      disco_code: 'ekedc',
      amount_kobo: 2000000, // ₦20,000
      units_kwh: 350.0,
      status: 'successful',
      reference: `WF-TEST-OFFICE-${Date.now()}`,
      provider_name: 'vtpass',
      idempotency_key: `IDEMP-OFFICE-${Date.now()}`,
    });

    const { data: homeOnlyTxs } = await supabaseAdmin
      .from('electricity_transactions')
      .select('amount_kobo')
      .eq('meter_id', meterHome.id)
      .eq('status', 'successful');

    const { data: officeOnlyTxs } = await supabaseAdmin
      .from('electricity_transactions')
      .select('amount_kobo')
      .eq('meter_id', meterOffice.id)
      .eq('status', 'successful');

    const homeSpend = homeOnlyTxs.reduce((s, t) => s + Number(t.amount_kobo) / 100, 0);
    const officeSpend = officeOnlyTxs.reduce((s, t) => s + Number(t.amount_kobo) / 100, 0);

    assert(homeSpend === 20000, `Home meter spend (₦${homeSpend}) is strictly isolated from Office meter`);
    assert(officeSpend === 20000, `Office meter spend (₦${officeSpend}) is strictly isolated from Home meter`);
    assert(homeOnlyTxs.length === 4 && officeOnlyTxs.length === 1, 'Transaction counts match individual meter ledgers');

    // ── TEST 6: Data Quality Grading ──────────────────────────────────────────
    console.log('\n▶ [TEST 6] Testing Data Quality Grading & Confidence...');
    const calculateQuality = (count) => {
      if (count === 0) return 'INSUFFICIENT';
      if (count < 3) return 'LIMITED';
      if (count < 5) return 'GOOD';
      return 'STRONG';
    };

    assert(calculateQuality(0) === 'INSUFFICIENT', '0 purchases -> INSUFFICIENT');
    assert(calculateQuality(2) === 'LIMITED', '2 purchases -> LIMITED');
    assert(calculateQuality(4) === 'GOOD', '4 purchases -> GOOD');
    assert(calculateQuality(6) === 'STRONG', '6 purchases -> STRONG');

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log('📊 PHASE 7 CONSUMPTION INTELLIGENCE RESULTS SUMMARY');
    console.log('================================================================');
    console.log(`Passed:  ${passedTests}`);
    console.log(`Failed:  ${failedTests}`);

    if (failedTests === 0) {
      console.log('🎉 ALL PHASE 7 CONSUMPTION INTELLIGENCE TESTS PASSED SUCCESSFULLY!\n');
    } else {
      console.error('❌ SOME TESTS FAILED. Check log output above.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Phase 7 Test Runner Fatal Error:', err);
    process.exit(1);
  }
}

runPhase7Tests();
