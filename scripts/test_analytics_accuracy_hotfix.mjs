import assert from 'node:assert';

console.log('====================================================');
console.log('⚡ PAYPAWA: CRITICAL ANALYTICS ACCURACY HOTFIX SUITE');
console.log('====================================================\n');

// Deterministic Calculation Engine Test Implementation (matching ConsumptionAnalyticsService)
function calculateDeterministicAnalytics(txs, { periodDays = 30, now = new Date() } = {}) {
  const currentPeriodStart = new Date(now.getTime() - periodDays * 86400 * 1000);
  const prevPeriodStart = new Date(currentPeriodStart.getTime() - periodDays * 86400 * 1000);

  // Filter only successful transactions
  const successfulTxs = txs.filter((t) => t.status === 'successful');
  const currentPeriodTxs = successfulTxs.filter((t) => new Date(t.created_at) >= currentPeriodStart);
  const prevPeriodTxs = successfulTxs.filter(
    (t) => new Date(t.created_at) >= prevPeriodStart && new Date(t.created_at) < currentPeriodStart
  );

  // 1. Spending
  const currentSpendNaira = currentPeriodTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount_kobo)) / 100, 0);
  const prevSpendNaira = prevPeriodTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount_kobo)) / 100, 0);
  const hasPreviousBaseline = prevSpendNaira > 0;
  const percentageChange = hasPreviousBaseline
    ? Math.round(((currentSpendNaira - prevSpendNaira) / prevSpendNaira) * 1000) / 10
    : 0;

  // 2. Units Vended
  const validUnitTxs = currentPeriodTxs.filter((t) => t.units_kwh !== null && Number(t.units_kwh) > 0);
  const totalUnitsKwh = validUnitTxs.length > 0
    ? validUnitTxs.reduce((sum, t) => sum + Number(t.units_kwh), 0)
    : null;

  // 3. Purchase Cycles & Intervals across total meter purchase history
  const purchaseCycles = [];
  for (const tx of successfulTxs) {
    const txTime = new Date(tx.created_at).getTime();
    const txUnits = tx.units_kwh !== null
      ? Number(tx.units_kwh)
      : (Number(tx.amount_kobo) ? (Math.abs(Number(tx.amount_kobo)) / 100 / 206.8) : 0);
    const txSpend = Math.abs(Number(tx.amount_kobo)) / 100;

    if (purchaseCycles.length > 0) {
      const lastCycle = purchaseCycles[purchaseCycles.length - 1];
      const deltaHours = (txTime - lastCycle.date) / (3600 * 1000);
      if (deltaHours < 24) {
        lastCycle.units += txUnits;
        lastCycle.spend += txSpend;
        continue;
      }
    }
    purchaseCycles.push({ date: txTime, units: txUnits, spend: txSpend });
  }

  const intervals = [];
  const cycleDailyKwhList = [];
  const cycleDailySpendList = [];

  for (let i = 1; i < purchaseCycles.length; i++) {
    const prev = purchaseCycles[i - 1];
    const curr = purchaseCycles[i];
    const diffDays = Math.round(((curr.date - prev.date) / (86400 * 1000)) * 10) / 10;
    if (diffDays >= 0.5) {
      intervals.push(diffDays);
      if (prev.units > 0) {
        cycleDailyKwhList.push(Math.round((prev.units / diffDays) * 10) / 10);
      }
      if (prev.spend > 0) {
        cycleDailySpendList.push(Math.round(prev.spend / diffDays));
      }
    }
  }

  let medianIntervalDays = null;
  if (intervals.length > 0) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianIntervalDays = sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }

  let estimatedDailyUnitsKwh = null;
  let averageDailySpendNaira = null;

  if (cycleDailyKwhList.length > 0) {
    const sortedKwh = [...cycleDailyKwhList].sort((a, b) => a - b);
    const mid = Math.floor(sortedKwh.length / 2);
    estimatedDailyUnitsKwh = sortedKwh.length % 2 !== 0 ? sortedKwh[mid] : Math.round(((sortedKwh[mid - 1] + sortedKwh[mid]) / 2) * 10) / 10;
  }

  if (cycleDailySpendList.length > 0) {
    const sortedSpend = [...cycleDailySpendList].sort((a, b) => a - b);
    const mid = Math.floor(sortedSpend.length / 2);
    averageDailySpendNaira = sortedSpend.length % 2 !== 0 ? sortedSpend[mid] : Math.round((sortedSpend[mid - 1] + sortedSpend[mid]) / 2);
  }

  // 4. Cumulative Energy Pool with Time Decay
  let estimatedRemainingUnits = null;
  if (successfulTxs.length > 0) {
    const safeBurnRate = estimatedDailyUnitsKwh && estimatedDailyUnitsKwh > 0 ? estimatedDailyUnitsKwh : 5.0;
    let runningBalance = 0;
    let lastTxTime = new Date(successfulTxs[0].created_at).getTime();

    for (const tx of successfulTxs) {
      const txTime = new Date(tx.created_at).getTime();
      const timeDeltaDays = !isNaN(txTime) && txTime >= lastTxTime ? Math.max(0, (txTime - lastTxTime) / (86400 * 1000)) : 0;
      runningBalance = Math.max(0, runningBalance - (safeBurnRate * timeDeltaDays));

      const txUnits = tx.units_kwh !== null
        ? Number(tx.units_kwh)
        : (Number(tx.amount_kobo) ? Math.round((Math.abs(Number(tx.amount_kobo)) / 100 / 206.8) * 10) / 10 : 0);
      if (txUnits > 0) {
        runningBalance += txUnits;
      }
      lastTxTime = txTime;
    }

    const finalDeltaDays = Math.max(0, (now.getTime() - lastTxTime) / (86400 * 1000));
    runningBalance = Math.max(0, runningBalance - (safeBurnRate * finalDeltaDays));
    estimatedRemainingUnits = Math.max(0, Math.round(runningBalance));
  }

  // 5. Estimated Days Remaining
  let estimatedDaysRemainingRange = null;
  if (estimatedRemainingUnits !== null && estimatedDailyUnitsKwh !== null && estimatedDailyUnitsKwh > 0) {
    const exactDays = estimatedRemainingUnits / estimatedDailyUnitsKwh;
    if (exactDays >= 0.8) {
      const minRange = Math.floor(exactDays);
      const maxRange = Math.ceil(exactDays);
      estimatedDaysRemainingRange = minRange === maxRange ? `~${minRange} days` : `${minRange}–${maxRange} days`;
    } else {
      estimatedDaysRemainingRange = 'Recharge due soon';
    }
  } else if (successfulTxs.length === 1) {
    estimatedDaysRemainingRange = 'Need 2+ purchases';
  } else {
    estimatedDaysRemainingRange = 'Awaiting recharge';
  }

  return {
    currentSpendNaira,
    prevSpendNaira,
    percentageChange,
    totalUnitsKwh,
    medianIntervalDays,
    estimatedDailyUnitsKwh,
    averageDailySpendNaira,
    estimatedRemainingUnits,
    estimatedDaysRemainingRange,
    totalPurchases: successfulTxs.length,
  };
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
  const BASE_TIME = new Date('2026-08-30T12:00:00Z');

  // TEST 1: Section 14 — Daily usage does NOT jump after a new purchase
  await test('Section 14: Daily usage does NOT jump after adding a new purchase', async () => {
    // Before purchase: 2 purchases 10 days apart (100 kWh on Day 1, 100 kWh on Day 11)
    const tx1 = { id: '1', amount_kobo: 2068000, units_kwh: 100, status: 'successful', created_at: '2026-08-10T12:00:00Z' };
    const tx2 = { id: '2', amount_kobo: 2068000, units_kwh: 100, status: 'successful', created_at: '2026-08-20T12:00:00Z' };

    const beforeState = calculateDeterministicAnalytics([tx1, tx2], { now: new Date('2026-08-20T12:00:00Z') });
    assert.strictEqual(beforeState.estimatedDailyUnitsKwh, 10.0, 'Daily usage before purchase should be 10.0 kWh/day');

    // User makes a 3rd purchase 10 days later (100 kWh on Aug 30)
    const tx3 = { id: '3', amount_kobo: 2068000, units_kwh: 100, status: 'successful', created_at: '2026-08-30T12:00:00Z' };
    const afterState = calculateDeterministicAnalytics([tx1, tx2, tx3], { now: new Date('2026-08-30T12:00:00Z') });

    // Daily usage MUST stay 10.0 kWh/day (NOT jump to 300 / 30 = 10 or 300)
    assert.strictEqual(afterState.estimatedDailyUnitsKwh, 10.0, 'Daily usage MUST remain based on completed intervals (10.0 kWh/day)');
    assert.strictEqual(afterState.estimatedRemainingUnits, 100, 'Remaining units should be 100 kWh');
  });

  // TEST 2: Section 3 & 4 — Single Source of Truth
  await test('Section 3: Deterministic engine produces canonical statistics for spend and units', async () => {
    const txs = [
      { id: '1', amount_kobo: 1000000, units_kwh: 48.4, status: 'successful', created_at: '2026-08-15T12:00:00Z' },
      { id: '2', amount_kobo: 1000000, units_kwh: 48.4, status: 'successful', created_at: '2026-08-22T12:00:00Z' },
    ];
    const res = calculateDeterministicAnalytics(txs, { now: BASE_TIME });
    assert.strictEqual(res.currentSpendNaira, 20000);
    assert.strictEqual(res.totalUnitsKwh, 96.8);
    assert.strictEqual(res.medianIntervalDays, 7);
  });

  // TEST 3: Section 6 — Failed transactions excluded
  await test('Section 6: Failed and pending transactions do NOT count towards spend or units', async () => {
    const txs = [
      { id: '1', amount_kobo: 1000000, units_kwh: 48.4, status: 'successful', created_at: '2026-08-15T12:00:00Z' },
      { id: '2', amount_kobo: 5000000, units_kwh: 242.0, status: 'failed', created_at: '2026-08-18T12:00:00Z' },
      { id: '3', amount_kobo: 3000000, units_kwh: 145.2, status: 'pending', created_at: '2026-08-20T12:00:00Z' },
    ];
    const res = calculateDeterministicAnalytics(txs, { now: BASE_TIME });
    assert.strictEqual(res.currentSpendNaira, 10000, 'Only successful transaction counted in spend');
    assert.strictEqual(res.totalUnitsKwh, 48.4, 'Only successful transaction counted in units');
    assert.strictEqual(res.totalPurchases, 1);
  });

  // TEST 4: Section 11 — Money (NGN) vs Energy (kWh) Isolation
  await test('Section 11: Currency (₦) is never confused with Energy Units (kWh)', async () => {
    const txs = [
      { id: '1', amount_kobo: 1000000, units_kwh: 48.4, status: 'successful', created_at: '2026-08-15T12:00:00Z' },
    ];
    const res = calculateDeterministicAnalytics(txs, { now: BASE_TIME });
    assert.strictEqual(res.currentSpendNaira, 10000, '₦10,000 spend');
    assert.strictEqual(res.totalUnitsKwh, 48.4, '48.4 kWh units');
    assert.notStrictEqual(res.totalUnitsKwh, 10000, 'Must not equate ₦10,000 to 10,000 kWh');
  });

  // TEST 5: Section 16 — Days remaining calculated at full precision
  await test('Section 16: Estimated days remaining calculated at full precision', async () => {
    const tx1 = { id: '1', amount_kobo: 2068000, units_kwh: 100, status: 'successful', created_at: '2026-08-01T12:00:00Z' };
    const tx2 = { id: '2', amount_kobo: 2068000, units_kwh: 100, status: 'successful', created_at: '2026-08-11T12:00:00Z' };
    const res = calculateDeterministicAnalytics([tx1, tx2], { now: new Date('2026-08-11T12:00:00Z') });

    // Remaining units = 100, daily usage = 10.0 -> exactDays = 10 -> range ~10 days
    assert.strictEqual(res.estimatedRemainingUnits, 100);
    assert.strictEqual(res.estimatedDaysRemainingRange, '~10 days');
  });

  // TEST 6: Section 17 — Differentiate zero from missing
  await test('Section 17: Zero purchases returns ₦0 spend, null daily usage, and awaiting status', async () => {
    const res = calculateDeterministicAnalytics([], { now: BASE_TIME });
    assert.strictEqual(res.currentSpendNaira, 0);
    assert.strictEqual(res.totalUnitsKwh, null);
    assert.strictEqual(res.estimatedDailyUnitsKwh, null);
    assert.strictEqual(res.medianIntervalDays, null);
    assert.strictEqual(res.estimatedDaysRemainingRange, 'Awaiting recharge');
  });

  // TEST 7: Section 8 — Strict Multi-Meter Isolation
  await test('Section 8: Meter B purchases do not affect Meter A metrics', async () => {
    const allTxs = [
      { id: '1', meter_id: 'meter-A', amount_kobo: 1000000, units_kwh: 50, status: 'successful', created_at: '2026-08-10T12:00:00Z' },
      { id: '2', meter_id: 'meter-B', amount_kobo: 5000000, units_kwh: 250, status: 'successful', created_at: '2026-08-12T12:00:00Z' },
    ];
    const meterATxs = allTxs.filter((t) => t.meter_id === 'meter-A');
    const resA = calculateDeterministicAnalytics(meterATxs, { now: BASE_TIME });

    assert.strictEqual(resA.currentSpendNaira, 10000);
    assert.strictEqual(resA.totalUnitsKwh, 50);
  });

  // TEST 8: Section 27 — Consistency Invariant (Same input -> Same output)
  await test('Section 27: Idempotent and deterministic evaluation produces identical outputs', async () => {
    const txs = [
      { id: '1', amount_kobo: 2000000, units_kwh: 96.8, status: 'successful', created_at: '2026-08-10T12:00:00Z' },
      { id: '2', amount_kobo: 2000000, units_kwh: 96.8, status: 'successful', created_at: '2026-08-17T12:00:00Z' },
    ];
    const run1 = calculateDeterministicAnalytics(txs, { now: BASE_TIME });
    const run2 = calculateDeterministicAnalytics(txs, { now: BASE_TIME });
    assert.deepStrictEqual(run1, run2, 'Consecutive runs must produce 100% bitwise identical analytics');
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================');
}

runAll();
