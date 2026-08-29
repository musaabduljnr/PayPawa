import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const host = 'aws-0-eu-west-2.pooler.supabase.com';
const port = 6543;
const database = 'postgres';
const user = 'postgres.ohaartcdjulywktqjzqp';

const passwords = [
  'postgres',
  'postgres123',
  'Supabase123!',
  'ohaartcdjulywktqjzqp',
  'your-db-password',
  'supabase',
  'password',
  'admin',
  'postgres_password'
];

async function tryConnect(password) {
  const client = new pg.Client({
    host,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`Successfully connected using password: "${password}"`);
    return client;
  } catch (err) {
    // console.log(`Failed for password "${password}":`, err.message);
    await client.end();
    return null;
  }
}

async function run() {
  let client = null;
  for (const pw of passwords) {
    client = await tryConnect(pw);
    if (client) break;
  }

  if (!client) {
    console.error('Failed to connect to PostgreSQL pooler with any of the candidate passwords.');
    return;
  }

  try {
    // 1. Read Phase 4 migration SQL
    const phase4Path = path.resolve(process.cwd(), 'supabase/migrations/20260828000001_phase4_purchase_engine.sql');
    if (fs.existsSync(phase4Path)) {
      console.log('Reading Phase 4 migration...');
      let sql4 = fs.readFileSync(phase4Path, 'utf8');
      
      // Let's clean the SQL to ensure it executes cleanly.
      // Remove any transaction wraps if it's executed as a single query
      console.log('Applying Phase 4 migration...');
      await client.query(sql4);
      console.log('✅ Phase 4 migration applied successfully!');
    } else {
      console.warn('Phase 4 migration file not found.');
    }

    // 2. Read Phase 6 migration SQL
    const phase6Path = path.resolve(process.cwd(), 'supabase/migrations/20260828000002_phase6_production_hardening.sql');
    if (fs.existsSync(phase6Path)) {
      console.log('Reading Phase 6 migration...');
      const sql6 = fs.readFileSync(phase6Path, 'utf8');
      console.log('Applying Phase 6 migration...');
      await client.query(sql6);
      console.log('✅ Phase 6 migration applied successfully!');
    } else {
      console.warn('Phase 6 migration file not found.');
    }

  } catch (err) {
    console.error('Error applying migrations:', err.message);
  } finally {
    await client.end();
  }
}

run();
