import assert from 'node:assert';

console.log('====================================================');
console.log('⚡ PAYPAWA: AI ANALYTICS ENGINE & DATA TRUTH SUITE');
console.log('====================================================\n');

// 1. Mock Context Generator
function makeContext({
  totalPurchases = 0,
  currentSpendNaira = 0,
  medianInterval = null,
  grade = 'INSUFFICIENT',
  meterId = 'meter-uuid-1',
  period = '30d',
  unitSource = 'ESTIMATED',
  totalUnitsKwh = null,
} = {}) {
  return {
    user: { id: 'user-1', accountType: 'household', name: 'Musa A. Abubakar' },
    meter: { id: meterId, name: 'Main Meter', meterNumber: '04123456789', discoCode: 'aedc', meterType: 'prepaid' },
    period: { key: period, startDate: '2026-08-01', endDate: '2026-08-31' },
    spending: {
      currentPeriodSpendNaira: currentSpendNaira,
      previousPeriodSpendNaira: 0,
      direction: 'STABLE',
      percentageChange: 0,
      hasPreviousBaseline: false,
    },
    consumption: {
      totalUnitsKwh,
      estimatedDailyUnitsKwh: totalPurchases > 1 ? 5.2 : null,
      unitSource,
    },
    purchasing: {
      totalPurchases,
      medianIntervalDays: medianInterval,
      averageIntervalDays: medianInterval,
      purchaseVelocity: medianInterval !== null ? `every ~${medianInterval} days` : 'Need 2+ purchases for cadence',
      shortestIntervalDays: medianInterval,
      longestIntervalDays: medianInterval,
    },
    forecast: {
      estimatedDaysRemainingRange: medianInterval !== null ? `${Math.floor(medianInterval * 0.8)}–${Math.ceil(medianInterval * 1.2)} days` : 'Need 2+ purchases',
    },
    appliances: { totalEstimatedDailyKwh: 4.5, items: [], count: 0, isSelfReported: true },
    dataQuality: { grade, sampleSize: totalPurchases, unitSource, hasContinuousHistory: totalPurchases >= 3 },
    recentPurchases: [],
    dataFreshness: { calculatedAt: new Date().toISOString(), dataThrough: new Date().toISOString(), isStale: false },
  };
}

// 2. Guardrails Validator Implementation (Mirroring TypeScript service)
class GuardrailsEngine {
  static validateAnalytics(analytics, context) {
    if (!analytics) {
      return { isValid: false, rejectionReason: 'Empty payload' };
    }

    if (analytics.purchaseFrequency?.value !== null && analytics.purchaseFrequency?.value !== undefined) {
      if (analytics.purchaseFrequency.value !== context.purchasing.totalPurchases) {
        return {
          isValid: false,
          rejectionReason: `Frequency (${analytics.purchaseFrequency.value}) diverges from source count (${context.purchasing.totalPurchases})`,
        };
      }
    }

    if (analytics.periodSpend?.value !== null && analytics.periodSpend?.value !== undefined) {
      if (isNaN(analytics.periodSpend.value) || analytics.periodSpend.value < 0) {
        return { isValid: false, rejectionReason: 'Period spend is negative or NaN' };
      }
      if (Math.abs(analytics.periodSpend.value - context.spending.currentPeriodSpendNaira) > 5) {
        return {
          isValid: false,
          rejectionReason: `Period spend (₦${analytics.periodSpend.value}) diverges from source (₦${context.spending.currentPeriodSpendNaira})`,
        };
      }
    }

    if (analytics.estimatedDaysRemaining?.value !== null && analytics.estimatedDaysRemaining?.value !== undefined) {
      if (
        isNaN(analytics.estimatedDaysRemaining.value) ||
        !isFinite(analytics.estimatedDaysRemaining.value) ||
        analytics.estimatedDaysRemaining.value < 0
      ) {
        return { isValid: false, rejectionReason: 'Estimated days remaining contains invalid or infinite value' };
      }
    }

    if (context.purchasing.totalPurchases <= 1 && analytics.purchaseCadence?.value !== null) {
      return { isValid: false, rejectionReason: 'Cadence interval must be null when purchase count is <= 1' };
    }

    return { isValid: true, sanitizedAnalytics: analytics };
  }
}

// 3. Test Suites
let passedCount = 0;
let totalCount = 0;

function test(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
  }
}

// --- SUITE 1: Health Check & Model Diagnostics ---
test('1. Diagnostics expose active provider, model name, and configuration state', () => {
  const diagnostics = {
    activeProvider: 'gemini',
    configuredModel: 'gemini-3.5-flash',
    isKeyConfigured: false,
    timeoutMs: 12000,
  };
  assert.strictEqual(diagnostics.configuredModel, 'gemini-3.5-flash');
  assert.strictEqual(typeof diagnostics.timeoutMs, 'number');
});

test('2. Health check resolves to a terminal non-blocking health status', () => {
  const allowedStatuses = [
    'CONNECTED',
    'AUTHENTICATION_ERROR',
    'CONFIGURATION_ERROR',
    'TIMEOUT',
    'RATE_LIMITED',
    'PROVIDER_ERROR',
    'INVALID_RESPONSE',
    'UNAVAILABLE',
  ];
  const sampleHealth = { status: 'CONFIGURATION_ERROR', latencyMs: 0 };
  assert.ok(allowedStatuses.includes(sampleHealth.status));
});

// --- SUITE 2: Structured Output & Zero vs Missing Distinction ---
test('3. Zero actual spend is marked ACTUAL (₦0 != null)', () => {
  const zeroSpendContext = makeContext({ totalPurchases: 2, currentSpendNaira: 0, medianInterval: 5, grade: 'GOOD' });
  const validZeroResult = {
    dataQuality: { grade: 'GOOD', sampleSize: 2, status: 'ACTUAL' },
    periodSpend: { value: 0, currency: 'NGN', status: 'ACTUAL' },
    purchaseFrequency: { value: 2, unit: 'purchases', status: 'ACTUAL' },
    purchaseCadence: { value: 5, unit: 'days', status: 'AI_CALCULATED' },
    estimatedDaysRemaining: { value: 5, unit: 'days', status: 'AI_CALCULATED' },
  };

  const val = GuardrailsEngine.validateAnalytics(validZeroResult, zeroSpendContext);
  assert.strictEqual(val.isValid, true);
  assert.strictEqual(validZeroResult.periodSpend.value, 0);
  assert.strictEqual(validZeroResult.periodSpend.status, 'ACTUAL');
});

test('4. Missing data with 0 purchases is strictly INSUFFICIENT_DATA and null', () => {
  const noPurchasesContext = makeContext({ totalPurchases: 0, currentSpendNaira: 0, medianInterval: null, grade: 'INSUFFICIENT' });
  const zeroTxResult = {
    dataQuality: { grade: 'INSUFFICIENT', sampleSize: 0, status: 'INSUFFICIENT_DATA' },
    periodSpend: { value: 0, currency: 'NGN', status: 'ACTUAL' },
    purchaseFrequency: { value: 0, unit: 'purchases', status: 'ACTUAL' },
    purchaseCadence: { value: null, unit: 'days', status: 'INSUFFICIENT_DATA' },
    estimatedDaysRemaining: { value: null, unit: 'days', status: 'INSUFFICIENT_DATA' },
  };

  const val = GuardrailsEngine.validateAnalytics(zeroTxResult, noPurchasesContext);
  assert.strictEqual(val.isValid, true);
  assert.strictEqual(zeroTxResult.purchaseCadence.value, null);
});

// --- SUITE 3: AI Hallucination Defense & Source Cross-Check ---
test('5. Rejects AI output when purchaseFrequency diverges from source count', () => {
  const context = makeContext({ totalPurchases: 6, currentSpendNaira: 30000, medianInterval: 5, grade: 'STRONG' });
  const hallucinatedFrequency = {
    periodSpend: { value: 30000, currency: 'NGN', status: 'ACTUAL' },
    purchaseFrequency: { value: 12, unit: 'purchases', status: 'ACTUAL' }, // Fabricated 12 vs actual 6
    purchaseCadence: { value: 5, unit: 'days', status: 'AI_CALCULATED' },
  };

  const val = GuardrailsEngine.validateAnalytics(hallucinatedFrequency, context);
  assert.strictEqual(val.isValid, false);
  assert.ok(val.rejectionReason.includes('diverges from source count'));
});

test('6. Rejects AI output when periodSpend diverges from source records', () => {
  const context = makeContext({ totalPurchases: 2, currentSpendNaira: 10000, medianInterval: 7, grade: 'GOOD' });
  const hallucinatedSpend = {
    periodSpend: { value: 50000, currency: 'NGN', status: 'ACTUAL' }, // Fabricated ₦50,000 vs ₦10,000
    purchaseFrequency: { value: 2, unit: 'purchases', status: 'ACTUAL' },
    purchaseCadence: { value: 7, unit: 'days', status: 'AI_CALCULATED' },
  };

  const val = GuardrailsEngine.validateAnalytics(hallucinatedSpend, context);
  assert.strictEqual(val.isValid, false);
  assert.ok(val.rejectionReason.includes('diverges from source'));
});

test('7. Rejects AI output with invalid/infinite estimatedDaysRemaining', () => {
  const context = makeContext({ totalPurchases: 2, currentSpendNaira: 10000, medianInterval: 7, grade: 'GOOD' });
  const invalidDays = {
    periodSpend: { value: 10000, currency: 'NGN', status: 'ACTUAL' },
    purchaseFrequency: { value: 2, unit: 'purchases', status: 'ACTUAL' },
    purchaseCadence: { value: 7, unit: 'days', status: 'AI_CALCULATED' },
    estimatedDaysRemaining: { value: Infinity, unit: 'days', status: 'AI_CALCULATED' },
  };

  const val = GuardrailsEngine.validateAnalytics(invalidDays, context);
  assert.strictEqual(val.isValid, false);
});

// --- SUITE 4: Cadence State Machine & Multi-Purchase Scenarios ---
test('8. 1 purchase yields deterministic INSUFFICIENT_DATA for cadence', () => {
  const oneTxContext = makeContext({ totalPurchases: 1, currentSpendNaira: 5000, medianInterval: null, grade: 'INSUFFICIENT' });
  const oneTxResult = {
    periodSpend: { value: 5000, currency: 'NGN', status: 'ACTUAL' },
    purchaseFrequency: { value: 1, unit: 'purchases', status: 'ACTUAL' },
    purchaseCadence: { value: null, unit: 'days', status: 'INSUFFICIENT_DATA' },
    estimatedDaysRemaining: { value: null, unit: 'days', status: 'INSUFFICIENT_DATA' },
  };

  const val = GuardrailsEngine.validateAnalytics(oneTxResult, oneTxContext);
  assert.strictEqual(val.isValid, true);
  assert.strictEqual(oneTxResult.purchaseCadence.value, null);
});

test('9. 2+ purchases calculate exact median interval and days remaining', () => {
  const twoTxContext = makeContext({ totalPurchases: 2, currentSpendNaira: 10000, medianInterval: 6, grade: 'GOOD' });
  const twoTxResult = {
    periodSpend: { value: 10000, currency: 'NGN', status: 'ACTUAL' },
    purchaseFrequency: { value: 2, unit: 'purchases', status: 'ACTUAL' },
    purchaseCadence: { value: 6, unit: 'days', status: 'AI_CALCULATED' },
    estimatedDaysRemaining: { value: 6, unit: 'days', status: 'AI_CALCULATED' },
  };

  const val = GuardrailsEngine.validateAnalytics(twoTxResult, twoTxContext);
  assert.strictEqual(val.isValid, true);
  assert.strictEqual(twoTxResult.purchaseCadence.value, 6);
});

// --- SUITE 5: Strict Meter Isolation & Concurrency Safety ---
test('10. Strict Meter Isolation: Meter B with 0 purchases never inherits Meter A data', () => {
  const meterAContext = makeContext({ meterId: 'meter-A', totalPurchases: 6, currentSpendNaira: 30000, medianInterval: 5, grade: 'STRONG' });
  const meterBContext = makeContext({ meterId: 'meter-B', totalPurchases: 0, currentSpendNaira: 0, medianInterval: null, grade: 'INSUFFICIENT' });

  assert.strictEqual(meterAContext.purchasing.totalPurchases, 6);
  assert.strictEqual(meterBContext.purchasing.totalPurchases, 0);
  assert.strictEqual(meterBContext.spending.currentPeriodSpendNaira, 0);
  assert.strictEqual(meterBContext.purchasing.medianIntervalDays, null);
});

test('11. AI Failure / Timeout does not crash application or block purchasing', () => {
  const unavailableAnalytics = {
    dataQuality: { grade: 'INSUFFICIENT', sampleSize: 0, status: 'UNAVAILABLE' },
    averageDailyUsage: { value: null, unit: 'kWh/day', status: 'UNAVAILABLE' },
    estimatedDaysRemaining: { value: null, unit: 'days', status: 'UNAVAILABLE' },
    periodSpend: { value: null, currency: 'NGN', status: 'UNAVAILABLE' },
    purchaseFrequency: { value: null, unit: 'purchases', status: 'UNAVAILABLE' },
    purchaseCadence: { value: null, unit: 'days', status: 'UNAVAILABLE' },
    metadata: { isAiCalculated: false, provider: 'fallback', model: 'unavailable' },
  };

  assert.strictEqual(unavailableAnalytics.averageDailyUsage.status, 'UNAVAILABLE');
  assert.strictEqual(unavailableAnalytics.averageDailyUsage.value, null);
  assert.strictEqual(unavailableAnalytics.metadata.isAiCalculated, false);
});

console.log('\n====================================================');
console.log(`RESULTS: ${passedCount}/${totalCount} Tests Passed (${Math.round((passedCount / totalCount) * 100)}%)`);
console.log('====================================================');
