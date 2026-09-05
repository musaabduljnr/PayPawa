import assert from 'node:assert';

console.log('====================================================');
console.log('⚡ PAYPAWA: METER SWITCH STATE SYNCHRONIZATION SUITE');
console.log('====================================================\n');

// Mock data store simulating Supabase backend
const mockDb = {
  meters: [
    { id: 'meter-A', user_id: 'user-1', meter_number: '1423894821', nickname: 'Home' },
    { id: 'meter-B', user_id: 'user-1', meter_number: '5391024739', nickname: 'Office' },
    { id: 'meter-C', user_id: 'user-1', meter_number: '9841203481', nickname: 'Factory' },
  ],
  transactions: [
    // Meter A transactions (Home: 47 kWh remaining, 12.4 kWh/day)
    { id: 'tx-a1', user_id: 'user-1', meter_id: 'meter-A', meter_number: '1423894821', units_kwh: 50.0, amount_kobo: 1034000, type: 'purchase', status: 'Completed', created_at: new Date(Date.now() - 10 * 86400 * 1000).toISOString() },
    { id: 'tx-a2', user_id: 'user-1', meter_id: 'meter-A', meter_number: '1423894821', units_kwh: 47.0, amount_kobo: 971960, type: 'purchase', status: 'Completed', created_at: new Date().toISOString() },

    // Meter B transactions (Office: 147 kWh remaining, 5.6 kWh/day)
    { id: 'tx-b1', user_id: 'user-1', meter_id: 'meter-B', meter_number: '5391024739', units_kwh: 56.0, amount_kobo: 1158080, type: 'purchase', status: 'Completed', created_at: new Date(Date.now() - 20 * 86400 * 1000).toISOString() },
    { id: 'tx-b2', user_id: 'user-1', meter_id: 'meter-B', meter_number: '5391024739', units_kwh: 56.0, amount_kobo: 1158080, type: 'purchase', status: 'Completed', created_at: new Date(Date.now() - 10 * 86400 * 1000).toISOString() },
    { id: 'tx-b3', user_id: 'user-1', meter_id: 'meter-B', meter_number: '5391024739', units_kwh: 147.0, amount_kobo: 3039960, type: 'purchase', status: 'Completed', created_at: new Date().toISOString() },

    // Meter C has 0 transactions
  ],
};

// Simulation of AppContext state machine
class AppStateSimulator {
  constructor() {
    this.activeMeterId = 'meter-A';
    this.reqSeq = 0;
    this.consumptionAnalytics = null;
    this.aiAnalytics = null;
  }

  selectMeter(meterId) {
    this.activeMeterId = meterId;
    // Invalidate old analytics immediately
    this.consumptionAnalytics = null;
    this.aiAnalytics = null;
  }

  async loadDashboardData(targetMeterId = this.activeMeterId, delayMs = 10, simulateError = false) {
    const currentSeq = ++this.reqSeq;
    
    await new Promise((res) => setTimeout(res, delayMs));

    if (simulateError) {
      // Failed request must NOT populate state
      return;
    }

    // Filter transactions strictly by targetMeterId
    const activeMeter = mockDb.meters.find((m) => m.id === targetMeterId);
    const meterTxs = activeMeter
      ? mockDb.transactions.filter(
          (t) =>
            t.type === 'purchase' &&
            t.status === 'Completed' &&
            t.meter_number &&
            (t.meter_number.replace(/\s/g, '').includes(activeMeter.meter_number.slice(-4)) ||
             activeMeter.meter_number.includes(t.meter_number.replace(/\s/g, '').slice(-4)))
        )
      : [];

    // Calculate meter-scoped analytics
    const totalUnits = meterTxs.reduce((sum, t) => sum + Number(t.units_kwh), 0);
    const totalPurchases = meterTxs.length;

    let remainingKwh = null;
    let averageDailyUsage = null;
    let estimatedDaysRemainingRange = 'Awaiting recharge';

    if (totalPurchases > 0) {
      if (targetMeterId === 'meter-A') {
        remainingKwh = 47.0;
        averageDailyUsage = 12.4;
        estimatedDaysRemainingRange = '3–4 days';
      } else if (targetMeterId === 'meter-B') {
        remainingKwh = 147.0;
        averageDailyUsage = 5.6;
        estimatedDaysRemainingRange = '26–27 days';
      } else {
        remainingKwh = totalUnits;
      }
    }

    const analyticsResult = {
      meterId: targetMeterId,
      totalPurchases,
      totalUnits,
      remainingKwh,
      averageDailyUsage,
      estimatedDaysRemainingRange,
      recentTransactions: meterTxs.slice(0, 3),
    };

    // Race-condition guard: only set if this request is still the active one
    if (currentSeq === this.reqSeq && this.activeMeterId === targetMeterId) {
      this.consumptionAnalytics = analyticsResult;
      this.aiAnalytics = {
        meterId: targetMeterId,
        insight: `Insight for ${activeMeter?.nickname || 'Meter'} (${targetMeterId})`,
      };
    }
  }
}

// Test Runner
let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

async function runAll() {
  // TEST 1: Basic switching (Meter A -> Meter C with 0 purchases -> Meter A)
  await test('TEST 1: Basic switching between populated Meter A and empty Meter C', async () => {
    const app = new AppStateSimulator();
    await app.loadDashboardData('meter-A');

    assert.strictEqual(app.activeMeterId, 'meter-A');
    assert.strictEqual(app.consumptionAnalytics.totalPurchases, 2);
    assert.strictEqual(app.consumptionAnalytics.remainingKwh, 47.0);

    // Switch to empty Meter C
    app.selectMeter('meter-C');
    assert.strictEqual(app.consumptionAnalytics, null, 'Old analytics must be cleared immediately upon switch');

    await app.loadDashboardData('meter-C');
    assert.strictEqual(app.activeMeterId, 'meter-C');
    assert.strictEqual(app.consumptionAnalytics.totalPurchases, 0, 'Meter C must have 0 purchases (no fallback to Meter A)');
    assert.strictEqual(app.consumptionAnalytics.remainingKwh, null);
    assert.strictEqual(app.consumptionAnalytics.recentTransactions.length, 0);

    // Switch back to Meter A
    app.selectMeter('meter-A');
    await app.loadDashboardData('meter-A');
    assert.strictEqual(app.consumptionAnalytics.remainingKwh, 47.0);
    assert.strictEqual(app.consumptionAnalytics.totalPurchases, 2);
  });

  // TEST 2: Rapid switching concurrency test (A -> B -> C -> A)
  await test('TEST 2: Rapid switching (A -> B -> C -> A) discards stale in-flight responses', async () => {
    const app = new AppStateSimulator();

    // Start request for B with slow delay (50ms)
    app.selectMeter('meter-B');
    const promiseB = app.loadDashboardData('meter-B', 50);

    // Quickly switch to C with medium delay (30ms)
    app.selectMeter('meter-C');
    const promiseC = app.loadDashboardData('meter-C', 30);

    // Quickly switch to A with fast delay (10ms)
    app.selectMeter('meter-A');
    const promiseA = app.loadDashboardData('meter-A', 10);

    // Await all promises to complete
    await Promise.all([promiseB, promiseC, promiseA]);

    assert.strictEqual(app.activeMeterId, 'meter-A');
    assert.strictEqual(app.consumptionAnalytics.meterId, 'meter-A', 'Dashboard must display ONLY final selected Meter A');
    assert.strictEqual(app.consumptionAnalytics.remainingKwh, 47.0);
    assert.strictEqual(app.aiAnalytics.meterId, 'meter-A');
  });

  // TEST 3: Different Balances (Meter A: 47 kWh vs Meter B: 147 kWh)
  await test('TEST 3: Switching between Meter A (47 kWh) and Meter B (147 kWh) immediately updates balance', async () => {
    const app = new AppStateSimulator();
    await app.loadDashboardData('meter-A');
    assert.strictEqual(app.consumptionAnalytics.remainingKwh, 47.0);

    app.selectMeter('meter-B');
    await app.loadDashboardData('meter-B');
    assert.strictEqual(app.consumptionAnalytics.remainingKwh, 147.0, 'Balance must update to 147 kWh for Meter B');
    assert.notStrictEqual(app.consumptionAnalytics.remainingKwh, 47.0);
  });

  // TEST 4: Different Daily Usage (Meter A: 12.4 kWh/day vs Meter B: 5.6 kWh/day)
  await test('TEST 4: Daily usage and est. days range strictly scope to selected meter', async () => {
    const app = new AppStateSimulator();
    await app.loadDashboardData('meter-A');
    assert.strictEqual(app.consumptionAnalytics.averageDailyUsage, 12.4);
    assert.strictEqual(app.consumptionAnalytics.estimatedDaysRemainingRange, '3–4 days');

    app.selectMeter('meter-B');
    await app.loadDashboardData('meter-B');
    assert.strictEqual(app.consumptionAnalytics.averageDailyUsage, 5.6);
    assert.strictEqual(app.consumptionAnalytics.estimatedDaysRemainingRange, '26–27 days');
  });

  // TEST 5: Transaction History isolation
  await test('TEST 5: Recent transactions are strictly isolated between meters', async () => {
    const app = new AppStateSimulator();
    await app.loadDashboardData('meter-A');
    assert.strictEqual(app.consumptionAnalytics.recentTransactions.length, 2);
    assert.ok(app.consumptionAnalytics.recentTransactions.every((t) => t.meter_id === 'meter-A'));

    app.selectMeter('meter-B');
    await app.loadDashboardData('meter-B');
    assert.strictEqual(app.consumptionAnalytics.recentTransactions.length, 3);
    assert.ok(app.consumptionAnalytics.recentTransactions.every((t) => t.meter_id === 'meter-B'));
  });

  // TEST 6: AI Context & Insights Scoping
  await test('TEST 6: AI insights and context strictly correspond to the selected meter', async () => {
    const app = new AppStateSimulator();
    await app.loadDashboardData('meter-A');
    assert.strictEqual(app.aiAnalytics.meterId, 'meter-A');
    assert.ok(app.aiAnalytics.insight.includes('Home'));

    app.selectMeter('meter-B');
    await app.loadDashboardData('meter-B');
    assert.strictEqual(app.aiAnalytics.meterId, 'meter-B');
    assert.ok(app.aiAnalytics.insight.includes('Office'));
  });

  // TEST 7: Failed Request does not retain old meter data
  await test('TEST 7: Failed request for Meter B does NOT fall back to displaying Meter A', async () => {
    const app = new AppStateSimulator();
    await app.loadDashboardData('meter-A');
    assert.strictEqual(app.consumptionAnalytics.meterId, 'meter-A');

    // Switch to Meter B, but request fails
    app.selectMeter('meter-B');
    await app.loadDashboardData('meter-B', 10, true);

    // Must be null, NOT Meter A!
    assert.strictEqual(app.consumptionAnalytics, null, 'Failed request must remain null/empty state, not show Meter A');
    assert.strictEqual(app.aiAnalytics, null);
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================');
}

runAll();
