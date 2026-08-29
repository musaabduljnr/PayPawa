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
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function queryFunctions() {
  console.log('Querying database routines...');
  const { data, error } = await supabase
    .from('wallet_accounts')
    .select('id')
    .limit(1);

  if (error) {
    console.error('Connection error:', error.message);
    return;
  }
  console.log('Connection successful!');

  // Let's run a query to get function names
  // In Supabase, we can't query pg_proc directly using .from() because it's not exposed in PostgREST by default.
  // But wait! We can call a RPC or we can use another way to check what functions exist.
  // Wait! Let's check if there is an error in execute_electricity_purchase_init.
  // Let's try calling another RPC, like debit_wallet_for_electricity, to see if it works.
  
  console.log('Calling debit_wallet_for_electricity...');
  const { data: debitData, error: debitError } = await supabase.rpc('debit_wallet_for_electricity', {
    p_user_id: '00000000-0000-0000-0000-000000000002', // random user
    p_amount_kobo: 1000,
    p_electricity_tx_id: '00000000-0000-0000-0000-000000000002',
    p_idempotency_key: `debit-test-${Date.now()}`,
  });

  console.log('debit_wallet_for_electricity result:', { debitData, debitError });
}

queryFunctions();
