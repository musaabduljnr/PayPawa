import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
  if (match && !match[1].startsWith('#')) {
    process.env[match[1].trim()] = (match[2] || '').trim().replace(/^["'](.*)["']$/, '$1');
  }
});

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data: rows } = await supabase.from('electricity_transactions').select('*').limit(1);
  if (rows && rows.length > 0) {
    console.log('Sample electricity_transactions columns:', Object.keys(rows[0]));
    console.log('Sample row:', rows[0]);
  } else {
    console.log('No rows in electricity_transactions');
  }
}

check();
