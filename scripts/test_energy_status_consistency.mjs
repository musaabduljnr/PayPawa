import assert from 'node:assert';

console.log('====================================================');
console.log('⚡ PAYPAWA: ENERGY STATUS & DAYS REMAINING AUDIT SUITE');
console.log('====================================================\n');

// Mock colors
const mockColors = {
  primary: '#1e293b',
  secondary: '#22c55e', // Green
  secondaryDark: '#15803d',
  error: '#ef4444',     // Red
  outlineVariant: '#cbd5e1',
};

// Deterministic Energy Status Calculation Engine
function calculateEnergyStatusSnapshot({
  remainingUnitsKwh,
  averageDailyUnitsKwh,
  totalPurchasedUnitsKwh = 150,
  medianPurchaseIntervalDays = 2.0,
  totalPurchases = 3,
}) {
  // 1. Cadence velocity
  let purchaseVelocity;
  if (totalPurchases === 0) {
    purchaseVelocity = 'Awaiting first recharge';
  } else if (totalPurchases === 1 || medianPurchaseIntervalDays === null) {
    purchaseVelocity = 'Need 2+ purchases for cadence';
  } else {
    purchaseVelocity = `Every ~${medianPurchaseIntervalDays} days`;
  }

  // 2. Physical Duration Calculation
  let exactDays = null;
  let estimatedDaysRemainingRange = null;

  if (
    remainingUnitsKwh !== null &&
    remainingUnitsKwh !== undefined &&
    !isNaN(Number(remainingUnitsKwh)) &&
    averageDailyUnitsKwh !== null &&
    averageDailyUnitsKwh !== undefined &&
    !isNaN(Number(averageDailyUnitsKwh)) &&
    Number(averageDailyUnitsKwh) > 0
  ) {
    exactDays = Number(remainingUnitsKwh) / Number(averageDailyUnitsKwh);
    if (exactDays >= 1.0) {
      const minRange = Math.floor(exactDays);
      const maxRange = Math.ceil(exactDays);
      estimatedDaysRemainingRange = minRange === maxRange ? `~${minRange} days` : `${minRange}–${maxRange} days`;
    } else if (exactDays > 0) {
      estimatedDaysRemainingRange = 'Recharge due soon';
    } else {
      estimatedDaysRemainingRange = 'Awaiting recharge';
    }
  } else if (totalPurchases === 1) {
    estimatedDaysRemainingRange = 'Need 2+ purchases';
  } else {
    estimatedDaysRemainingRange = 'Awaiting recharge';
  }

  // 3. Status Level and Visual Indicator Color
  const progressPercent =
    totalPurchasedUnitsKwh > 0 && remainingUnitsKwh !== null && !isNaN(Number(remainingUnitsKwh))
      ? Math.min(100, Math.max(0, (Number(remainingUnitsKwh) / totalPurchasedUnitsKwh) * 100))
      : 0;

  let status = null;
  let color = mockColors.outlineVariant;
  let label = 'Unavailable';

  if (remainingUnitsKwh !== null && remainingUnitsKwh !== undefined) {
    if (exactDays !== null && exactDays > 7) {
      status = 'healthy';
      color = mockColors.secondary;
      label = 'Healthy';
    } else if (exactDays !== null && exactDays > 2) {
      status = 'medium';
      color = '#eab308';
      label = 'Medium';
    } else if (exactDays !== null) {
      status = 'low';
      color = mockColors.error;
      label = 'Low';
    } else if (progressPercent > 50) {
      status = 'healthy';
      color = mockColors.secondary;
      label = 'Healthy';
    } else if (progressPercent > 20) {
      status = 'medium';
      color = '#eab308';
      label = 'Medium';
    } else {
      status = 'low';
      color = mockColors.error;
      label = 'Low';
    }
  }

  return {
    remainingUnitsKwh,
    averageDailyUnitsKwh,
    exactDays,
    estimatedDaysRemainingRange,
    purchaseVelocity,
    medianPurchaseIntervalDays,
    progressPercent,
    status,
    color,
    label,
  };
}

// Consistency Validator
function validateConsistency(snapshot) {
  const { remainingUnitsKwh, averageDailyUnitsKwh, exactDays, estimatedDaysRemainingRange, status } = snapshot;

  if (remainingUnitsKwh > 0 && averageDailyUnitsKwh > 0) {
    const expectedDays = remainingUnitsKwh / averageDailyUnitsKwh;
    assert.ok(Math.abs(exactDays - expectedDays) < 0.001, 'exactDays must match remainingUnits / dailyUsage');

    if (expectedDays >= 2.0) {
      assert.notStrictEqual(
        estimatedDaysRemainingRange,
        'Recharge due soon',
        'Cannot show "Recharge due soon" when expectedDays >= 2.0 days'
      );
      assert.notStrictEqual(status, 'low', 'Cannot have "low" status when expectedDays >= 2.0 days');
    }

    if (expectedDays > 7.0) {
      assert.strictEqual(status, 'healthy', 'Must have "healthy" status when expectedDays > 7.0 days');
    }
  }
  return true;
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
  // TEST 1: Profile 1 (147 kWh / 5.6 kWh/day)
  await test('Profile 1: 147 kWh / 5.6 kWh/day yields 26.25 days ("26–27 days"), Status: HEALTHY', async () => {
    const snap = calculateEnergyStatusSnapshot({
      remainingUnitsKwh: 147.0,
      averageDailyUnitsKwh: 5.6,
      totalPurchasedUnitsKwh: 150.0,
      medianPurchaseIntervalDays: 2.0, // Historical purchasing interval is 2 days
      totalPurchases: 4,
    });

    assert.ok(Math.abs(snap.exactDays - 26.25) < 0.001, `Exact days should be 26.25, got ${snap.exactDays}`);
    assert.strictEqual(snap.estimatedDaysRemainingRange, '26–27 days', 'Must display "26–27 days", NOT "Recharge due soon"');
    assert.strictEqual(snap.status, 'healthy', 'Status must be healthy (GREEN)');
    assert.strictEqual(snap.purchaseVelocity, 'Every ~2 days', 'Purchase cadence remains independent');
    assert.strictEqual(validateConsistency(snap), true);
  });

  // TEST 2: Profile 2 (47 kWh / 12.4 kWh/day)
  await test('Profile 2: 47 kWh / 12.4 kWh/day yields 3.79 days ("3–4 days"), Status: MEDIUM', async () => {
    const snap = calculateEnergyStatusSnapshot({
      remainingUnitsKwh: 47.0,
      averageDailyUnitsKwh: 12.4,
      totalPurchasedUnitsKwh: 100.0,
      medianPurchaseIntervalDays: 1.6,
      totalPurchases: 4,
    });

    assert.ok(Math.abs(snap.exactDays - (47.0 / 12.4)) < 0.001);
    assert.strictEqual(snap.estimatedDaysRemainingRange, '3–4 days');
    assert.strictEqual(snap.status, 'medium', 'Status must be medium (YELLOW)');
    assert.strictEqual(validateConsistency(snap), true);
  });

  // TEST 3: Low Duration (10 kWh / 12.4 kWh/day = 0.8 days)
  await test('Low Duration: 10 kWh / 12.4 kWh/day yields 0.8 days ("Recharge due soon"), Status: LOW', async () => {
    const snap = calculateEnergyStatusSnapshot({
      remainingUnitsKwh: 10.0,
      averageDailyUnitsKwh: 12.4,
      totalPurchasedUnitsKwh: 100.0,
      medianPurchaseIntervalDays: 3.0,
      totalPurchases: 4,
    });

    assert.ok(Math.abs(snap.exactDays - (10.0 / 12.4)) < 0.001);
    assert.strictEqual(snap.estimatedDaysRemainingRange, 'Recharge due soon');
    assert.strictEqual(snap.status, 'low', 'Status must be low (RED)');
  });

  // TEST 4: Edge Cases (5/5, 0/5, 147/0, null/5, 147/null)
  await test('Edge Cases: Division by zero, nulls, and exact 1.0 day duration', async () => {
    // 5 kWh / 5 kWh/day = 1.0 day
    const oneDay = calculateEnergyStatusSnapshot({ remainingUnitsKwh: 5.0, averageDailyUnitsKwh: 5.0 });
    assert.strictEqual(oneDay.estimatedDaysRemainingRange, '~1 days');

    // 0 kWh / 5 kWh/day = 0 days
    const zeroKwh = calculateEnergyStatusSnapshot({ remainingUnitsKwh: 0, averageDailyUnitsKwh: 5.0 });
    assert.strictEqual(zeroKwh.estimatedDaysRemainingRange, 'Awaiting recharge');

    // 147 kWh / 0 kWh/day (Division by zero protected)
    const zeroUsage = calculateEnergyStatusSnapshot({ remainingUnitsKwh: 147.0, averageDailyUnitsKwh: 0 });
    assert.strictEqual(zeroUsage.exactDays, null);
    assert.notStrictEqual(zeroUsage.exactDays, Infinity);
    assert.notStrictEqual(zeroUsage.exactDays, NaN);

    // null / 5 kWh/day
    const nullKwh = calculateEnergyStatusSnapshot({ remainingUnitsKwh: null, averageDailyUnitsKwh: 5.0 });
    assert.strictEqual(nullKwh.exactDays, null);

    // 147 kWh / null
    const nullUsage = calculateEnergyStatusSnapshot({ remainingUnitsKwh: 147.0, averageDailyUnitsKwh: null });
    assert.strictEqual(nullUsage.exactDays, null);
  });

  // TEST 5: Cadence Independence Invariant
  await test('Cadence Independence: Short purchase cadence (1.6 days) does NOT force "Recharge due soon" on 147 kWh balance', async () => {
    const snap = calculateEnergyStatusSnapshot({
      remainingUnitsKwh: 147.0,
      averageDailyUnitsKwh: 5.6,
      totalPurchasedUnitsKwh: 150.0,
      medianPurchaseIntervalDays: 1.6, // Rapid cadence
      totalPurchases: 8,
    });

    assert.strictEqual(snap.estimatedDaysRemainingRange, '26–27 days');
    assert.strictEqual(snap.status, 'healthy');
    assert.strictEqual(snap.purchaseVelocity, 'Every ~1.6 days');
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================');
}

runAll();
