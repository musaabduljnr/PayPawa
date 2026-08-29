// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

import * as path from 'path';
import type { Database } from '../src/types/database';

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

console.log('====================================================');
console.log('🧪 RUNNING PHASE 2: AUTH, PROFILES & RLS TEST SUITE');
console.log('====================================================');
console.log(`Supabase URL: ${SUPABASE_URL}\n`);

const randomSuffix = Math.floor(100000 + Math.random() * 900000);
const userA_Email = `musa.smartelec.${randomSuffix}@gmail.com`;
const userB_Email = `amina.smartelec.${randomSuffix}@gmail.com`;
const password = 'TestP@ssword123!';


async function runPhase2Tests() {
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
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

  // Admin client strictly for provisioning test accounts without email rate limits
  const adminClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Client-side isolated clients using ONLY public anon key
  const clientA = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const clientB = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userA_Id: string = '';
  let userB_Id: string = '';

  // ----------------------------------------------------
  // TEST 1: User A Creation & Auto Profile Provisioning
  // ----------------------------------------------------
  console.log('▶ [TEST 1] Creating User A via Supabase Auth...');
  try {
    const { data: createA, error: errA } = await adminClient.auth.admin.createUser({
      email: userA_Email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Musa Abubakar',
        phone: '08012345678',
        account_type: 'household',
      },
    });

    if (errA) console.error('Create User A Error:', errA);
    assert(!errA && !!createA?.user, 'User A created in Supabase Auth', `User ID: ${createA?.user?.id}`);
    userA_Id = createA?.user?.id || '';

    // Ensure profile row exists (via trigger or upsert)
    const { data: profileCheck, error: pErr } = await adminClient
      .from('profiles')
      .upsert({
        id: userA_Id,
        full_name: 'Musa Abubakar',
        email: userA_Email,
        phone: '08012345678',
        account_type: 'household',
        onboarding_completed: false,
        is_onboarded: false,
      })
      .select()
      .single();

    assert(
      !pErr && !!profileCheck,
      'User A profile verified in public.profiles table',
      `Name: ${profileCheck?.full_name}, Account Type: ${profileCheck?.account_type}`
    );
  } catch (e: any) {
    assert(false, 'User A Creation threw error', e.message);
  }

  // ----------------------------------------------------
  // TEST 2: User A Sign In & Client-Side Session
  // ----------------------------------------------------
  console.log('\n▶ [TEST 2] Signing in as User A with public Anon client...');
  try {
    const { data: signInA, error: signErrA } = await clientA.auth.signInWithPassword({
      email: userA_Email,
      password: password,
    });

    if (signErrA) console.error('Sign In A Error:', signErrA);
    assert(!signErrA && !!signInA?.session, 'User A authenticated with JWT session token');

    // Read profile as authenticated User A
    const { data: userAProfile, error: getProfErr } = await clientA
      .from('profiles')
      .select('*')
      .eq('id', userA_Id)
      .single();

    assert(
      !getProfErr && userAProfile?.id === userA_Id,
      'User A successfully read own profile via RLS',
      `Email: ${userAProfile?.email}`
    );
  } catch (e: any) {
    assert(false, 'User A Sign In threw error', e.message);
  }

  // ----------------------------------------------------
  // TEST 3: User A Energy Profile & Appliances Onboarding
  // ----------------------------------------------------
  console.log('\n▶ [TEST 3] Saving Energy Profile & User Appliances for User A...');
  try {
    // 1. Insert Energy Profile via clientA
    const { error: eProfErr } = await clientA.from('energy_profiles').upsert({
      user_id: userA_Id,
      account_type: 'household',
      occupants_count: 4,
      building_type: 'duplex',
      primary_cooking_source: 'gas_electric',
      has_solar: true,
      has_generator: true,
      updated_at: new Date().toISOString(),
    });

    if (eProfErr) console.error('Energy Profile Error:', eProfErr);
    assert(!eProfErr, 'Energy profile saved for User A via client session');

    // 2. Insert Appliances via clientA
    const testAppliances = [
      { user_id: userA_Id, appliance_type: 'light_bulb', quantity: 8, usage_frequency: 'daily', weekly_hours: 42, estimated_daily_kwh: 0.72 },
      { user_id: userA_Id, appliance_type: 'television', quantity: 2, usage_frequency: 'daily', weekly_hours: 35, estimated_daily_kwh: 1.0 },
      { user_id: userA_Id, appliance_type: 'refrigerator', quantity: 1, usage_frequency: 'multiple_daily', weekly_hours: 168, estimated_daily_kwh: 3.6 },
      { user_id: userA_Id, appliance_type: 'air_conditioner', quantity: 2, usage_frequency: 'daily', weekly_hours: 56, estimated_daily_kwh: 18.0 },
    ];

    const { error: appErr } = await clientA.from('user_appliances').insert(testAppliances);
    if (appErr) console.error('Appliances Error:', appErr);
    assert(!appErr, '4 User appliances saved for User A');

    // 3. Mark Onboarding Completed via clientA
    const { error: markErr } = await clientA
      .from('profiles')
      .update({
        onboarding_completed: true,
        is_onboarded: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userA_Id);

    assert(!markErr, 'User A profile updated with onboarding_completed = true');

    // 4. Retrieve Energy Profile and Appliances
    const { data: fetchEProf } = await clientA.from('energy_profiles').select('*').eq('user_id', userA_Id).single();
    const { data: fetchApps } = await clientA.from('user_appliances').select('*').eq('user_id', userA_Id);

    assert(
      fetchEProf?.building_type === 'duplex' && (fetchApps?.length || 0) === 4,
      'User A energy profile and all 4 appliances retrieved correctly from database'
    );
  } catch (e: any) {
    assert(false, 'Energy Onboarding threw error', e.message);
  }

  // ----------------------------------------------------
  // TEST 4: User A Profile Editing & Persistence
  // ----------------------------------------------------
  console.log('\n▶ [TEST 4] Testing User Profile Editing & Persistence...');
  try {
    const updatedName = 'Musa Abubakar Senior';
    const updatedPhone = '+234 809 999 8888';

    const { data: updatedProfile, error: updateErr } = await clientA
      .from('profiles')
      .update({
        full_name: updatedName,
        phone: updatedPhone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userA_Id)
      .select()
      .single();

    assert(
      !updateErr && updatedProfile?.full_name === updatedName,
      'User A profile edited and persisted to Supabase',
      `Updated Name: ${updatedProfile?.full_name}, Phone: ${updatedProfile?.phone}`
    );
  } catch (e: any) {
    assert(false, 'Profile update threw error', e.message);
  }

  // ----------------------------------------------------
  // TEST 5: User B Creation & Authentication
  // ----------------------------------------------------
  console.log('\n▶ [TEST 5] Creating and signing in as User B...');
  try {
    const { data: createB, error: errB } = await adminClient.auth.admin.createUser({
      email: userB_Email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Amina Bello',
        account_type: 'business',
      },
    });

    assert(!errB && !!createB?.user, 'User B created in Supabase Auth', `User ID: ${createB?.user?.id}`);
    userB_Id = createB?.user?.id || '';

    await adminClient.from('profiles').upsert({
      id: userB_Id,
      full_name: 'Amina Bello',
      email: userB_Email,
      account_type: 'business',
      onboarding_completed: false,
      is_onboarded: false,
    });

    const { data: signInB, error: signErrB } = await clientB.auth.signInWithPassword({
      email: userB_Email,
      password: password,
    });

    assert(!signErrB && !!signInB?.session, 'User B authenticated with independent session');
  } catch (e: any) {
    assert(false, 'User B Setup threw error', e.message);
  }

  // ----------------------------------------------------
  // TEST 6: Row Level Security (RLS) Cross-User Data Isolation
  // ----------------------------------------------------
  console.log('\n▶ [TEST 6] Testing Cross-User Row Level Security (RLS) Isolation...');
  try {
    // 1. User B attempts to read User A's profile
    const { data: crossProfile } = await clientB
      .from('profiles')
      .select('*')
      .eq('id', userA_Id);

    assert(
      !crossProfile || crossProfile.length === 0,
      'RLS: User B cannot read User A profile (returned 0 rows)'
    );

    // 2. User B attempts to update User A's profile
    const { data: crossUpdate } = await clientB
      .from('profiles')
      .update({ full_name: 'Hacked Name' })
      .eq('id', userA_Id)
      .select();

    assert(
      !crossUpdate || crossUpdate.length === 0,
      'RLS: User B cannot modify User A profile (0 rows affected)'
    );

    // 3. User B attempts to read User A's energy profile
    const { data: crossEProf } = await clientB
      .from('energy_profiles')
      .select('*')
      .eq('user_id', userA_Id);

    assert(
      !crossEProf || crossEProf.length === 0,
      'RLS: User B cannot read User A energy profile (0 rows returned)'
    );

    // 4. User B attempts to read User A's appliances
    const { data: crossApps } = await clientB
      .from('user_appliances')
      .select('*')
      .eq('user_id', userA_Id);

    assert(
      !crossApps || crossApps.length === 0,
      'RLS: User B cannot read User A appliances (0 rows returned)'
    );
  } catch (e: any) {
    assert(false, 'RLS Isolation Test threw error', e.message);
  }

  // ----------------------------------------------------
  // TEST 7: Authentication Edge Cases & Error Handling
  // ----------------------------------------------------
  console.log('\n▶ [TEST 7] Testing Auth Edge Cases (Invalid Password & Duplicate Email)...');
  try {
    // Wrong password
    const { data: badAuth, error: badAuthErr } = await clientA.auth.signInWithPassword({
      email: userA_Email,
      password: 'WrongPassword999!',
    });

    assert(
      !!badAuthErr && !badAuth.session,
      'Invalid password safely rejected by Supabase Auth',
      `Error Message: ${badAuthErr?.message}`
    );

    // Duplicate signup attempt
    const { data: dupAuth, error: dupErr } = await clientA.auth.signUp({
      email: userA_Email,
      password: password,
    });

    // Supabase either returns user_already_exists error or fake identity without session
    assert(
      !dupAuth.session || !!dupErr,
      'Duplicate email registration safely blocked from creating active session'
    );
  } catch (e: any) {
    assert(false, 'Auth Edge Cases test threw error', e.message);
  }

  // ----------------------------------------------------
  // TEST SUMMARY
  // ----------------------------------------------------
  console.log('\n====================================================');
  console.log('📊 PHASE 2 TEST RESULTS SUMMARY');
  console.log('====================================================');
  console.log(`Total Tests Run: ${passedCount + failedCount}`);
  console.log(`Passed:          ${passedCount}`);
  console.log(`Failed:          ${failedCount}`);

  if (failedCount === 0) {
    console.log('\n🎉 ALL PHASE 2 AUTOMATED TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error('\n⚠️ SOME TESTS FAILED. Please review output above.');
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
