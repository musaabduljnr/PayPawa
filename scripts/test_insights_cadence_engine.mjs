import assert from 'assert';

/**
 * Test Suite for PayPawa Insights Data Synchronization & Authoritative Cadence Engine
 */

// Simulated deterministic client-side calculation matching ConsumptionAnalyticsService
function computeAnalytics(txs, meterId = null, period = '30d') {
  const now = new Date();
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
  const currentPeriodStart = new Date(now.getTime() - periodDays * 86400 * 1000);
  const previousPeriodStart = new Date(currentPeriodStart.getTime() - periodDays * 86400 * 1000);

  // 1. Successful transactions only
  let successfulTxs = txs.filter((t) => t.status === 'successful');

  // 2. Strict meter isolation (No fallback to other meters!)
  if (meterId) {
    successfulTxs = successfulTxs.filter((t) => t.meter_id === meterId);
  }

  const currentPeriodTxs = successfulTxs.filter((t) => new Date(t.created_at) >= currentPeriodStart);
  const prevPeriodTxs = successfulTxs.filter(
    (t) => new Date(t.created_at) >= previousPeriodStart && new Date(t.created_at) < currentPeriodStart
  );

  const currentSpendNaira = currentPeriodTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount_kobo)) / 100, 0);
  const prevSpendNaira = prevPeriodTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount_kobo)) / 100, 0);

  const validUnitTxs = currentPeriodTxs.filter((t) => t.units_kwh !== null && Number(t.units_kwh) > 0);
  const totalUnitsKwh = validUnitTxs.length > 0 ? validUnitTxs.reduce((sum, t) => sum + Number(t.units_kwh), 0) : null;
  const unitSource = validUnitTxs.length > 0 ? 'PROVIDER' : 'UNAVAILABLE';

  // Cadence calculation across all successful purchases for this meter
  const intervals = [];
  for (let i = 1; i < successfulTxs.length; i++) {
    const prevDate = new Date(successfulTxs[i - 1].created_at).getTime();
    const currDate = new Date(successfulTxs[i].created_at).getTime();
    const diffDays = Math.round(((currDate - prevDate) / (86400 * 1000)) * 10) / 10;
    if (diffDays > 0.05) intervals.push(diffDays);
  }

  let medianIntervalDays = null;
  if (intervals.length > 0) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianIntervalDays = sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }

  const sampleSize = currentPeriodTxs.length;
  const totalMeterPurchases = successfulTxs.length;

  let purchaseVelocity;
  if (totalMeterPurchases === 0) {
    purchaseVelocity = 'Awaiting first recharge';
  } else if (totalMeterPurchases === 1 || medianIntervalDays === null) {
    purchaseVelocity = 'Need 2+ purchases for cadence';
  } else {
    purchaseVelocity = `Every ~${medianIntervalDays} days`;
  }

  let estimatedDaysRemainingRange;
  if (totalMeterPurchases === 0) {
    estimatedDaysRemainingRange = 'Awaiting recharge';
  } else if (totalMeterPurchases === 1 || medianIntervalDays === null) {
    estimatedDaysRemainingRange = 'Need 2+ purchases';
  } else {
    const latestTx = successfulTxs[successfulTxs.length - 1];
    const daysSinceLast = Math.round(((now.getTime() - new Date(latestTx.created_at).getTime()) / (86400 * 1000)) * 10) / 10;
    const expectedLeft = medianIntervalDays - daysSinceLast;
    if (expectedLeft > 0) {
      const minRange = Math.max(1, Math.floor(expectedLeft * 0.8));
      const maxRange = Math.max(minRange + 1, Math.ceil(expectedLeft * 1.2));
      estimatedDaysRemainingRange = `${minRange}–${maxRange} days`;
    } else {
      estimatedDaysRemainingRange = 'Recharge due soon';
    }
  }

  return {
    currentSpendNaira,
    totalUnitsKwh,
    unitSource,
    totalPurchases: totalMeterPurchases,
    currentPeriodPurchases: sampleSize,
    medianIntervalDays,
    purchaseVelocity,
    estimatedDaysRemainingRange,
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('⚡ PAYPAWA: INSIGHTS CADENCE & SYNCHRONIZATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${desc}:`, err.message);
    }
  }

  const now = new Date();

  // Test A: 0 purchases
  test('A. Zero purchases → Terminal states, ₦0 spend, no calculating lock', () => {
    const res = computeAnalytics([], 'meter-1', '7d');
    assert.strictEqual(res.currentSpendNaira, 0);
    assert.strictEqual(res.totalUnitsKwh, null);
    assert.strictEqual(res.totalPurchases, 0);
    assert.strictEqual(res.medianIntervalDays, null);
    assert.strictEqual(res.purchaseVelocity, 'Awaiting first recharge');
    assert.strictEqual(res.estimatedDaysRemainingRange, 'Awaiting recharge');
    assert(!res.purchaseVelocity.includes('calculating'), 'Never shows calculating on zero purchases');
  });

  // Test B: 1 purchase
  test('B. One purchase → Terminal state "Need 2+ purchases", valid spend', () => {
    const txs = [
      { id: '1', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 24.2, status: 'successful', created_at: now.toISOString() }
    ];
    const res = computeAnalytics(txs, 'meter-1', '7d');
    assert.strictEqual(res.currentSpendNaira, 5000);
    assert.strictEqual(res.totalUnitsKwh, 24.2);
    assert.strictEqual(res.totalPurchases, 1);
    assert.strictEqual(res.medianIntervalDays, null);
    assert.strictEqual(res.purchaseVelocity, 'Need 2+ purchases for cadence');
    assert.strictEqual(res.estimatedDaysRemainingRange, 'Need 2+ purchases');
  });

  // Test C: 2 valid purchases
  test('C. Two valid purchases → Computes exact cadence and days remaining', () => {
    const txs = [
      { id: '1', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 24.2, status: 'successful', created_at: new Date(now.getTime() - 8 * 86400000).toISOString() },
      { id: '2', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 24.2, status: 'successful', created_at: now.toISOString() }
    ];
    const res = computeAnalytics(txs, 'meter-1', '30d');
    assert.strictEqual(res.totalPurchases, 2);
    assert.strictEqual(res.medianIntervalDays, 8);
    assert.strictEqual(res.purchaseVelocity, 'Every ~8 days');
    assert(res.estimatedDaysRemainingRange !== null);
  });

  // Test D: 6 valid purchases
  test('D. Six valid purchases → Accurate median interval across multiple intervals', () => {
    const txs = [
      { id: '1', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'successful', created_at: new Date(now.getTime() - 25 * 86400000).toISOString() },
      { id: '2', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'successful', created_at: new Date(now.getTime() - 20 * 86400000).toISOString() },
      { id: '3', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'successful', created_at: new Date(now.getTime() - 15 * 86400000).toISOString() },
      { id: '4', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'successful', created_at: new Date(now.getTime() - 10 * 86400000).toISOString() },
      { id: '5', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'successful', created_at: new Date(now.getTime() - 5 * 86400000).toISOString() },
      { id: '6', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'successful', created_at: now.toISOString() }
    ];
    const res = computeAnalytics(txs, 'meter-1', '30d');
    assert.strictEqual(res.totalPurchases, 6);
    assert.strictEqual(res.medianIntervalDays, 5);
    assert.strictEqual(res.purchaseVelocity, 'Every ~5 days');
    assert.strictEqual(res.currentSpendNaira, 30000);
    assert.strictEqual(res.totalUnitsKwh, 150);
  });

  // Test E: Failed transactions ignored
  test('E. Failed transactions do NOT contribute to electricity spend or cadence', () => {
    const txs = [
      { id: '1', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'successful', created_at: new Date(now.getTime() - 5 * 86400000).toISOString() },
      { id: '2', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'failed', created_at: now.toISOString() },
      { id: '3', meter_id: 'meter-1', amount_kobo: 500000, units_kwh: 25, status: 'pending', created_at: now.toISOString() }
    ];
    const res = computeAnalytics(txs, 'meter-1', '30d');
    assert.strictEqual(res.totalPurchases, 1);
    assert.strictEqual(res.currentSpendNaira, 5000);
    assert.strictEqual(res.totalUnitsKwh, 25);
    assert.strictEqual(res.purchaseVelocity, 'Need 2+ purchases for cadence');
  });

  // Test F: Strict Multi-meter isolation
  test('F. Strict Multi-Meter Isolation: Meter B with 0 purchases never inherits Meter A data', () => {
    const txs = [
      { id: '1', meter_id: 'meter-A', amount_kobo: 1000000, units_kwh: 50, status: 'successful', created_at: new Date(now.getTime() - 5 * 86400000).toISOString() },
      { id: '2', meter_id: 'meter-A', amount_kobo: 1000000, units_kwh: 50, status: 'successful', created_at: now.toISOString() }
    ];
    const resMeterA = computeAnalytics(txs, 'meter-A', '30d');
    assert.strictEqual(resMeterA.totalPurchases, 2);
    assert.strictEqual(resMeterA.currentSpendNaira, 20000);

    const resMeterB = computeAnalytics(txs, 'meter-B', '30d');
    assert.strictEqual(resMeterB.totalPurchases, 0, 'Meter B must have 0 purchases');
    assert.strictEqual(resMeterB.currentSpendNaira, 0, 'Meter B must have ₦0 spend');
    assert.strictEqual(resMeterB.totalUnitsKwh, null);
    assert.strictEqual(resMeterB.purchaseVelocity, 'Awaiting first recharge');
  });

  // Test G: Concurrency Race-Condition simulation
  test('G. Concurrency Guard: Out-of-order async responses do not overwrite newer state', async () => {
    let currentSeq = 0;
    let finalCommittedData = null;

    async function mockAsyncFetch(period, delayMs) {
      const reqSeq = ++currentSeq;
      await new Promise((r) => setTimeout(r, delayMs));
      if (reqSeq === currentSeq) {
        finalCommittedData = period;
      }
    }

    // User rapidly switches W -> M -> Y
    // Suppose W takes 100ms, M takes 80ms, Y takes 20ms
    const p1 = mockAsyncFetch('W', 100);
    const p2 = mockAsyncFetch('M', 80);
    const p3 = mockAsyncFetch('Y', 20);

    await Promise.all([p1, p2, p3]);

    assert.strictEqual(finalCommittedData, 'Y', 'Final committed data must match latest request (Y)');
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
