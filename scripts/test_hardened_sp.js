import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSP() {
  console.log('Logging in as User A...');
  // We can sign in with a test user or just use a random email
  const email = `test-user-a-${Date.now()}@smart-electricity.app`;
  const password = 'Password123!';

  console.log(`Signing up ${email}...`);
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    console.error('Sign up failed:', signUpError.message);
    return;
  }

  const userId = signUpData.user?.id;
  console.log('Signed up User A:', userId);

  // Now let's try calling execute_electricity_purchase_init passing User B's ID
  const fakeUserBId = '00000000-0000-0000-0000-000000000002';
  
  console.log('Calling execute_electricity_purchase_init with User B ID...');
  const { data, error } = await supabase.rpc('execute_electricity_purchase_init', {
    p_user_id: fakeUserBId,
    p_meter_id: null,
    p_meter_number: '1234567890',
    p_meter_type: 'prepaid',
    p_disco_code: 'aedc',
    p_disco_name: 'AEDC',
    p_amount_kobo: 50000,
    p_service_fee_kobo: 0,
    p_reference: 'TEST-REF-999',
    p_idempotency_key: 'TEST-IDEMP-999',
    p_provider_name: 'mock',
  });

  console.log('RPC Result:', { data, error });
}

testSP();
