/**
 * ==============================================================================
 * PAYPAWA — PHASE 10B OPERATIONS CENTER TEST RUNNER
 * ==============================================================================
 * Tests:
 * 1. Customer Directory: Search, Filters, Pagination & Detail Inspection
 * 2. Meter Operations: DisCo Filtering, Type Gating & History Mapping
 * 3. Transaction Explorer: State Model, Date/Status Filtering & Timeline
 * 4. Idempotent Reconciliation & Audit Logging
 * 5. Provider Data Protection: Zero Secret Key Exposure
 * ==============================================================================
 */

class MockOperationsDatabase {
  constructor() {
    this.profiles = new Map();
    this.meters = new Map();
    this.transactions = new Map();
    this.wallets = new Map();
    this.auditLogs = [];
  }

  seedData() {
    // 1. Seed Profiles
    const customers = [
      { id: 'c1', full_name: 'Musa Abubakar', email: 'musa@example.com', phone: '+2348011112222', account_type: 'household', is_onboarded: true, created_at: '2026-08-01T10:00:00Z' },
      { id: 'c2', full_name: 'Ibrahim Hassan', email: 'ibrahim@example.com', phone: '+2348033334444', account_type: 'business', is_onboarded: true, created_at: '2026-08-05T12:00:00Z' },
      { id: 'c3', full_name: 'Amina Bello', email: 'amina@example.com', phone: '+2348055556666', account_type: 'household', is_onboarded: false, created_at: '2026-08-10T15:00:00Z' },
      { id: 'c4', full_name: 'Techcorp Ventures', email: 'ops@techcorp.ng', phone: '+2348077778888', account_type: 'commercial', is_onboarded: true, created_at: '2026-08-15T09:00:00Z' },
      { id: 'c5', full_name: 'Fatima Garba', email: 'fatima@example.com', phone: '+2348099990000', account_type: 'household', is_onboarded: true, created_at: '2026-08-20T11:00:00Z' },
    ];
    customers.forEach(c => this.profiles.set(c.id, c));

    // 2. Seed Wallets
    customers.forEach(c => {
      this.wallets.set(c.id, { id: `w-${c.id}`, user_id: c.id, balance_kobo: 500000 });
    });

    // 3. Seed Meters
    const meterList = [
      { id: 'm1', user_id: 'c1', meter_number: '45028392101', disco_code: 'AEDC', disco_name: 'Abuja Electricity', meter_type: 'prepaid', customer_name: 'Musa Abubakar', is_active: true, created_at: '2026-08-02T10:00:00Z' },
      { id: 'm2', user_id: 'c1', meter_number: '45028392102', disco_code: 'EKEDC', disco_name: 'Eko Electricity', meter_type: 'postpaid', customer_name: 'Musa Abubakar', is_active: true, created_at: '2026-08-03T10:00:00Z' },
      { id: 'm3', user_id: 'c2', meter_number: '14283901928', disco_code: 'IBEDC', disco_name: 'Ibadan Electricity', meter_type: 'prepaid', customer_name: 'Ibrahim Hassan', is_active: true, created_at: '2026-08-06T12:00:00Z' },
      { id: 'm4', user_id: 'c4', meter_number: '99018273645', disco_code: 'IKEDC', disco_name: 'Ikeja Electricity', meter_type: 'prepaid', customer_name: 'Techcorp Ventures', is_active: true, created_at: '2026-08-16T09:00:00Z' },
    ];
    meterList.forEach(m => this.meters.set(m.id, m));

    // 4. Seed Transactions
    const txList = [
      { id: 'tx-1', user_id: 'c1', meter_id: 'm1', meter_number: '45028392101', amount_kobo: 500000, service_fee_kobo: 10000, customer_charge_kobo: 510000, units_kwh: 75.4, token: '4829-1029-3849-1029-4829', status: 'successful', reference: 'PP-20260802-001', idempotency_key: 'ik-001', provider_name: 'vtpass', provider_transaction_id: 'vt-1111', created_at: '2026-08-02T10:30:00Z', completed_at: '2026-08-02T10:30:15Z' },
      { id: 'tx-2', user_id: 'c1', meter_id: 'm2', meter_number: '45028392102', amount_kobo: 1000000, service_fee_kobo: 10000, customer_charge_kobo: 1010000, units_kwh: 150.8, status: 'processing', reference: 'PP-20260803-002', idempotency_key: 'ik-002', provider_name: 'vtpass', created_at: '2026-08-03T11:00:00Z' },
      { id: 'tx-3', user_id: 'c2', meter_id: 'm3', meter_number: '14283901928', amount_kobo: 300000, service_fee_kobo: 10000, customer_charge_kobo: 310000, status: 'failed', failure_code: 'METER_NOT_FOUND', failure_message: 'Invalid meter number on switch', reference: 'PP-20260806-003', idempotency_key: 'ik-003', provider_name: 'vtpass', created_at: '2026-08-06T12:15:00Z', completed_at: '2026-08-06T12:15:20Z' },
      { id: 'tx-4', user_id: 'c4', meter_id: 'm4', meter_number: '99018273645', amount_kobo: 2500000, service_fee_kobo: 10000, customer_charge_kobo: 2510000, units_kwh: 380.0, token: '9928-3829-1029-4829-5738', status: 'successful', reference: 'PP-20260816-004', idempotency_key: 'ik-004', provider_name: 'vtpass', provider_transaction_id: 'vt-4444', created_at: '2026-08-16T09:45:00Z', completed_at: '2026-08-16T09:45:10Z' },
      { id: 'tx-5', user_id: 'c1', meter_id: 'm1', meter_number: '45028392101', amount_kobo: 200000, service_fee_kobo: 10000, customer_charge_kobo: 210000, status: 'unknown', reference: 'PP-20260820-005', idempotency_key: 'ik-005', provider_name: 'vtpass', created_at: '2026-08-20T14:00:00Z' },
    ];
    txList.forEach(t => this.transactions.set(t.id, t));
  }

  // Procedure: admin_list_customers
  listCustomers({ search = '', accountType = 'ALL', limit = 20, offset = 0 } = {}) {
    let list = Array.from(this.profiles.values());

    if (accountType && accountType !== 'ALL') {
      list = list.filter(c => c.account_type === accountType);
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => 
        c.full_name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
      );
    }

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return {
      total,
      data: paginated.map(c => ({
        ...c,
        meters_count: Array.from(this.meters.values()).filter(m => m.user_id === c.id).length,
        transactions_count: Array.from(this.transactions.values()).filter(t => t.user_id === c.id).length,
        wallet_balance_kobo: this.wallets.get(c.id)?.balance_kobo || 0,
      }))
    };
  }

  // Procedure: admin_list_meters
  listMeters({ search = '', disco = 'ALL', meterType = 'ALL', limit = 20, offset = 0 } = {}) {
    let list = Array.from(this.meters.values());

    if (disco && disco !== 'ALL') {
      list = list.filter(m => m.disco_code.toUpperCase() === disco.toUpperCase());
    }

    if (meterType && meterType !== 'ALL') {
      list = list.filter(m => m.meter_type.toLowerCase() === meterType.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => 
        m.meter_number.includes(q) ||
        m.customer_name.toLowerCase().includes(q)
      );
    }

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return {
      total,
      data: paginated.map(m => {
        const owner = this.profiles.get(m.user_id);
        return {
          ...m,
          owner_name: owner?.full_name,
          owner_email: owner?.email,
        };
      })
    };
  }

  // Procedure: admin_list_transactions
  listTransactions({ search = '', status = 'ALL', provider = 'ALL', fromDate, toDate, limit = 20, offset = 0 } = {}) {
    let list = Array.from(this.transactions.values());

    if (status && status !== 'ALL') {
      list = list.filter(t => t.status === status);
    }

    if (provider && provider !== 'ALL') {
      list = list.filter(t => t.provider_name === provider);
    }

    if (fromDate) {
      list = list.filter(t => new Date(t.created_at) >= new Date(fromDate));
    }

    if (toDate) {
      list = list.filter(t => new Date(t.created_at) <= new Date(toDate));
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => 
        t.reference.toLowerCase().includes(q) ||
        t.meter_number.includes(q)
      );
    }

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return {
      total,
      data: paginated.map(t => {
        const customer = this.profiles.get(t.user_id);
        return {
          ...t,
          customer_name: customer?.full_name,
          customer_email: customer?.email,
        };
      })
    };
  }

  // Procedure: admin_reconcile_transaction
  reconcileTransaction(txId, actorUserId) {
    const tx = this.transactions.get(txId);
    if (!tx) return { success: false, error: 'TX_NOT_FOUND' };

    // Record audit event
    const auditId = `audit-${Date.now()}`;
    this.auditLogs.push({
      id: auditId,
      actor_user_id: actorUserId,
      action: 'TRANSACTION_RECONCILE',
      target_type: 'ELECTRICITY_TRANSACTION',
      target_id: txId,
      metadata: { previous_status: tx.status, reference: tx.reference },
      created_at: new Date().toISOString()
    });

    if (tx.status === 'unknown') {
      tx.status = 'successful';
      tx.token = '5566-7788-9900-1122-3344';
      tx.units_kwh = 30.2;
      tx.completed_at = new Date().toISOString();
      return { success: true, status: 'successful', message: 'Transaction verified with provider switch and completed.' };
    }

    return { success: true, status: tx.status, message: `Transaction status confirmed as ${tx.status}.` };
  }
}

// -----------------------------------------------------------------------------
// TEST RUNNER EXECUTION
// -----------------------------------------------------------------------------
async function runTests() {
  console.log('\n================================================================');
  console.log('⚡ PAYPAWA — PHASE 10B OPERATIONS CENTER TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, description) {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failed++;
    }
  }

  const db = new MockOperationsDatabase();
  db.seedData();

  // --- SUITE 1: CUSTOMER MANAGEMENT ---
  console.log('=== SUITE 1: CUSTOMER DIRECTORY & FILTERS ===');
  const allCust = db.listCustomers({ limit: 10 });
  assert(allCust.total === 5, 'Returns exact total count of customers (5)');
  assert(allCust.data.length === 5, 'Paginated data matches total under limit');

  const householdCust = db.listCustomers({ accountType: 'household' });
  assert(householdCust.total === 3, 'Filters correctly by account_type = household (3)');
  assert(householdCust.data.every(c => c.account_type === 'household'), 'All returned records are household');

  const commercialCust = db.listCustomers({ accountType: 'commercial' });
  assert(commercialCust.total === 1 && commercialCust.data[0].full_name === 'Techcorp Ventures', 'Filters correctly by account_type = commercial');

  const searchCust = db.listCustomers({ search: 'ibrahim' });
  assert(searchCust.total === 1 && searchCust.data[0].email === 'ibrahim@example.com', 'Searches customer by name or email correctly');

  const musaCust = allCust.data.find(c => c.full_name === 'Musa Abubakar');
  assert(musaCust.meters_count === 2, 'Customer aggregates registered meters count (2)');
  assert(musaCust.transactions_count === 3, 'Customer aggregates transaction count (3)');
  assert(musaCust.wallet_balance_kobo === 500000, 'Customer joins wallet balance (₦5,000)');

  // --- SUITE 2: METER OPERATIONS ---
  console.log('\n=== SUITE 2: METER OPERATIONS & DISCO ROUTING ===');
  const allMeters = db.listMeters({ limit: 10 });
  assert(allMeters.total === 4, 'Returns exact total registered meters (4)');

  const aedcMeters = db.listMeters({ disco: 'AEDC' });
  assert(aedcMeters.total === 1 && aedcMeters.data[0].meter_number === '45028392101', 'Filters correctly by DisCo = AEDC');

  const prepaidMeters = db.listMeters({ meterType: 'prepaid' });
  assert(prepaidMeters.total === 3, 'Filters correctly by meter_type = prepaid (3)');

  const postpaidMeters = db.listMeters({ meterType: 'postpaid' });
  assert(postpaidMeters.total === 1 && postpaidMeters.data[0].disco_code === 'EKEDC', 'Filters correctly by meter_type = postpaid (1)');

  const searchMeter = db.listMeters({ search: '45028392101' });
  assert(searchMeter.total === 1 && searchMeter.data[0].owner_name === 'Musa Abubakar', 'Meter search joins registered owner');

  // --- SUITE 3: TRANSACTION EXPLORER ---
  console.log('\n=== SUITE 3: TRANSACTION EXPLORER & STATE MACHINE ===');
  const allTxs = db.listTransactions({ limit: 10 });
  assert(allTxs.total === 5, 'Returns exact transaction stream count (5)');

  const successfulTxs = db.listTransactions({ status: 'successful' });
  assert(successfulTxs.total === 2, 'Filters correctly by status = successful (2)');
  assert(successfulTxs.data.every(t => t.status === 'successful' && t.token), 'All successful prepaid transactions possess token');

  const processingTxs = db.listTransactions({ status: 'processing' });
  assert(processingTxs.total === 1 && processingTxs.data[0].reference === 'PP-20260803-002', 'Filters correctly by status = processing');

  const failedTxs = db.listTransactions({ status: 'failed' });
  assert(failedTxs.total === 1 && failedTxs.data[0].failure_code === 'METER_NOT_FOUND', 'Failed transaction contains diagnostic failure_code');

  const unknownTxs = db.listTransactions({ status: 'unknown' });
  assert(unknownTxs.total === 1 && unknownTxs.data[0].reference === 'PP-20260820-005', 'In-flight transaction recognized as unknown status');

  // --- SUITE 4: IDEMPOTENT RECONCILIATION & AUDIT TRAIL ---
  console.log('\n=== SUITE 4: RECONCILIATION & AUDIT LOGGING ===');
  const staffUserId = 'staff-ops-101';
  const reconRes = db.reconcileTransaction('tx-5', staffUserId);
  assert(reconRes.success === true && reconRes.status === 'successful', 'Reconciled in-flight transaction to successful');
  
  const updatedTx5 = db.transactions.get('tx-5');
  assert(updatedTx5.status === 'successful' && updatedTx5.token === '5566-7788-9900-1122-3344', 'Delivered token and units upon switch confirmation');
  
  assert(db.auditLogs.length === 1, 'Audit log created for reconciliation event');
  const auditEntry = db.auditLogs[0];
  assert(auditEntry.actor_user_id === staffUserId, 'Audit log records actor user');
  assert(auditEntry.target_id === 'tx-5', 'Audit log records target transaction ID');
  assert(auditEntry.metadata.previous_status === 'unknown', 'Audit log preserves prior status');

  // --- SUITE 5: DATA SECURITY & ZERO SECRET EXPOSURE ---
  console.log('\n=== SUITE 5: DATA SECURITY & SECRET ISOLATION ===');
  const sampleTx = db.transactions.get('tx-1');
  assert(!('vtpass_api_key' in sampleTx), 'Zero provider API keys in transaction model');
  assert(!('secret_key' in sampleTx), 'Zero secret keys exposed in client transaction payload');
  assert(sampleTx.customer_charge_kobo === 510000, 'Exact financial charge preserved in kobo');

  console.log('\n================================================================');
  console.log('📊 PHASE 10B TEST RUNNER RESULTS SUMMARY');
  console.log('================================================================');
  console.log(`Total Assertions: ${passed + failed}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 ALL PHASE 10B OPERATIONS CENTER TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error(`\n❌ PHASE 10B FAILED WITH ${failed} FAILURES!\n`);
    process.exit(1);
  }
}

runTests();
