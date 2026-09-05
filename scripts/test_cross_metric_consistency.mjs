import assert from 'node:assert';

console.log('====================================================');
console.log('⚡ PAYPAWA: CROSS-METRIC ANALYTICS CONSISTENCY SUITE');
console.log('====================================================\n');

// Authoritative calculation logic
function calculateAuthoritativeAnalytics({
  remainingUnitsKwh,
  averageDailyUnitsKwh,
  medianPurchaseIntervalDays,
  totalPurchases = 3,
}) {
  // 1. Purchase Cadence is strictly the historical purchase velocity
  let purchaseVelocity;
  if (totalPurchases === 0) {
    purchaseVelocity = 'Awaiting first recharge';
  } else if (totalPurchases === 1 || medianPurchaseIntervalDays === null) {
    purchaseVelocity = 'Need 2+ purchases for cadence';
  } else {
    purchaseVelocity = `Every ~${medianPurchaseIntervalDays} days`;
  }

  // 2. Estimated Days Remaining is strictly remainingUnits / averageDailyUnits (at full precision)
  let estimatedDaysRemainingRange = null;
  let exactDaysRemaining = null;

  if (
    remainingUnitsKwh !== null &&
    remainingUnitsKwh !== undefined &&
    averageDailyUnitsKwh !== null &&
    averageDailyUnitsKwh !== undefined &&
    averageDailyUnitsKwh > 0
  ) {
    exactDaysRemaining = remainingUnitsKwh / averageDailyUnitsKwh;
    if (exactDaysRemaining >= 0.8) {
      const minRange = Math.floor(exactDaysRemaining);
      const maxRange = Math.ceil(exactDaysRemaining);
      estimatedDaysRemainingRange = minRange === maxRange ? `~${minRange} days` : `${minRange}–${maxRange} days`;
    } else {
      estimatedDaysRemainingRange = 'Recharge due soon';
    }
  } else if (totalPurchases === 1) {
    estimatedDaysRemainingRange = 'Need 2+ purchases';
  } else {
    estimatedDaysRemainingRange = 'Awaiting recharge';
  }

  return {
    remainingUnitsKwh,
    averageDailyUnitsKwh,
    exactDaysRemaining,
    estimatedDaysRemainingRange,
    medianPurchaseIntervalDays,
    purchaseVelocity,
    totalPurchases,
  };
}

// Consistency Validator
function validateCrossMetricConsistency(analytics) {
  const { remainingUnitsKwh, averageDailyUnitsKwh, exactDaysRemaining, estimatedDaysRemainingRange } = analytics;
  if (remainingUnitsKwh > 0 && averageDailyUnitsKwh > 0) {
    const expected = remainingUnitsKwh / averageDailyUnitsKwh;
    assert.ok(
      Math.abs(exactDaysRemaining - expected) < 0.001,
      `Exact days remaining (${exactDaysRemaining}) must match remainingUnits / averageDailyUnits (${expected})`
    );
    // Parse range e.g. "3–4 days" or "~10 days"
    const match = estimatedDaysRemainingRange.match(/(\d+)(?:–(\d+))?\s+days/);
    if (match) {
      const min = parseInt(match[1], 10);
      const max = match[2] ? parseInt(match[2], 10) : min;
      assert.ok(
        expected >= min * 0.9 && expected <= max * 1.1,
        `Expected days (${expected}) must fall within formatted range [${min}, ${max}]`
      );
    }
    return true;
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
  // TEST 1: Exact Section 15 & 28 acceptance test (47 kWh / 12.4 kWh/day)
  await test('Section 15 & 28: 47 kWh / 12.4 kWh/day yields ~3.79 days ("3–4 days"), NOT "1–2 days"', async () => {
    const result = calculateAuthoritativeAnalytics({
      remainingUnitsKwh: 47.0,
      averageDailyUnitsKwh: 12.4,
      medianPurchaseIntervalDays: 1.6, // Historical purchase cadence is 1.6 days
      totalPurchases: 4,
    });

    // 1. Exact days remaining must be 47 / 12.4 = 3.7903...
    assert.ok(Math.abs(result.exactDaysRemaining - (47.0 / 12.4)) < 0.0001);
    assert.strictEqual(result.estimatedDaysRemainingRange, '3–4 days', 'Must display "3–4 days", not "1–2 days"');

    // 2. Purchase cadence is strictly independent
    assert.strictEqual(result.purchaseVelocity, 'Every ~1.6 days');
    assert.strictEqual(result.medianPurchaseIntervalDays, 1.6);

    // 3. Cross-metric validator must pass
    assert.strictEqual(validateCrossMetricConsistency(result), true);
  });

  // TEST 2: Decoupling Test — Changing cadence does NOT alter days remaining
  await test('Section 3 & 4: Changing purchase cadence does NOT alter available energy duration', async () => {
    const caseA = calculateAuthoritativeAnalytics({
      remainingUnitsKwh: 47.0,
      averageDailyUnitsKwh: 12.4,
      medianPurchaseIntervalDays: 1.6, // Frequent buyer
      totalPurchases: 5,
    });

    const caseB = calculateAuthoritativeAnalytics({
      remainingUnitsKwh: 47.0,
      averageDailyUnitsKwh: 12.4,
      medianPurchaseIntervalDays: 14.0, // Infrequent bulk buyer
      totalPurchases: 5,
    });

    // Both must have the exact same remaining duration (3.79 days -> 3-4 days)
    assert.strictEqual(caseA.estimatedDaysRemainingRange, '3–4 days');
    assert.strictEqual(caseB.estimatedDaysRemainingRange, '3–4 days');

    // But their purchase velocities differ
    assert.strictEqual(caseA.purchaseVelocity, 'Every ~1.6 days');
    assert.strictEqual(caseB.purchaseVelocity, 'Every ~14 days');
  });

  // TEST 3: Mathematical Invariant across multiple values
  await test('Section 24: Cross-metric mathematical invariant holds across arbitrary energy states', async () => {
    const testCases = [
      { remaining: 100, usage: 10.0, expectedRange: '~10 days' },
      { remaining: 50, usage: 5.0, expectedRange: '~10 days' },
      { remaining: 25, usage: 10.0, expectedRange: '2–3 days' },
      { remaining: 12.5, usage: 25.0, expectedRange: 'Recharge due soon' },
    ];

    for (const tc of testCases) {
      const res = calculateAuthoritativeAnalytics({
        remainingUnitsKwh: tc.remaining,
        averageDailyUnitsKwh: tc.usage,
        medianPurchaseIntervalDays: 7,
        totalPurchases: 3,
      });
      assert.strictEqual(res.estimatedDaysRemainingRange, tc.expectedRange);
      assert.strictEqual(validateCrossMetricConsistency(res), true);
    }
  });

  // TEST 4: Post-Purchase Recalculation Flow
  await test('Section 10 & 14: New purchase updates remaining units and days left without resetting daily usage', async () => {
    const beforePurchase = calculateAuthoritativeAnalytics({
      remainingUnitsKwh: 47.0,
      averageDailyUnitsKwh: 12.4,
      medianPurchaseIntervalDays: 3.0,
      totalPurchases: 3,
    });

    // User buys 100 kWh -> remaining becomes 147 kWh, daily usage stays 12.4
    const afterPurchase = calculateAuthoritativeAnalytics({
      remainingUnitsKwh: 47.0 + 100.0, // 147 kWh
      averageDailyUnitsKwh: 12.4, // Unchanged
      medianPurchaseIntervalDays: 3.0,
      totalPurchases: 4,
    });

    assert.strictEqual(afterPurchase.remainingUnitsKwh, 147.0);
    assert.strictEqual(afterPurchase.averageDailyUnitsKwh, 12.4);
    // 147 / 12.4 = 11.85 days -> 11-12 days range
    assert.strictEqual(afterPurchase.estimatedDaysRemainingRange, '11–12 days');
    assert.strictEqual(validateCrossMetricConsistency(afterPurchase), true);
  });

  // TEST 5: Missing and Zero States
  await test('Section 18: Missing or single purchase states return honest non-fabricated statuses', async () => {
    const zeroState = calculateAuthoritativeAnalytics({
      remainingUnitsKwh: null,
      averageDailyUnitsKwh: null,
      medianPurchaseIntervalDays: null,
      totalPurchases: 0,
    });
    assert.strictEqual(zeroState.estimatedDaysRemainingRange, 'Awaiting recharge');
    assert.strictEqual(zeroState.purchaseVelocity, 'Awaiting first recharge');

    const singlePurchaseState = calculateAuthoritativeAnalytics({
      remainingUnitsKwh: 50.0,
      averageDailyUnitsKwh: null,
      medianPurchaseIntervalDays: null,
      totalPurchases: 1,
    });
    assert.strictEqual(singlePurchaseState.estimatedDaysRemainingRange, 'Need 2+ purchases');
    assert.strictEqual(singlePurchaseState.purchaseVelocity, 'Need 2+ purchases for cadence');
  });

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================');
}

runAll();
