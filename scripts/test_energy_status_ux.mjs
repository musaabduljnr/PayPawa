import assert from 'assert';

// Simulated ColorPalette for tests
const mockColors = {
  primary: '#0f172a',
  secondary: '#84cc16',
  secondaryDark: '#416900',
  background: '#fcf8fa',
  surface: '#ffffff',
  outline: '#76777d',
  outlineVariant: '#c6c6cd',
  error: '#ba1a1a',
  white: '#ffffff',
};

const DEFAULT_THRESHOLDS = {
  healthyMinPercent: 50,
  mediumMinPercent: 20,
  lowMaxPercent: 20,
};

function getEnergyStatus(remainingPercentage, kwhLeft, colors = mockColors, thresholds = DEFAULT_THRESHOLDS) {
  const isKwhAvailable = kwhLeft !== null && kwhLeft !== undefined && !isNaN(Number(kwhLeft));
  const isPercentAvailable = remainingPercentage !== null && remainingPercentage !== undefined && !isNaN(Number(remainingPercentage));

  if (!isKwhAvailable || !isPercentAvailable) {
    return {
      status: null,
      isAvailable: false,
      color: colors.outlineVariant,
      label: 'Unavailable',
      accessibilityLabel: 'Electricity status unavailable',
      clampedPercentage: 0,
    };
  }

  const clampedPercentage = Math.min(100, Math.max(0, Number(remainingPercentage)));

  // GREEN: remaining percentage > 50%
  if (clampedPercentage > thresholds.healthyMinPercent) {
    return {
      status: 'healthy',
      isAvailable: true,
      color: colors.secondary, // Green
      label: 'Healthy',
      accessibilityLabel: `Healthy: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh)`,
      clampedPercentage,
    };
  }

  // YELLOW: remaining percentage > 20% AND <= 50%
  if (clampedPercentage > thresholds.mediumMinPercent && clampedPercentage <= thresholds.healthyMinPercent) {
    return {
      status: 'medium',
      isAvailable: true,
      color: '#eab308', // Amber / Warning yellow
      label: 'Medium',
      accessibilityLabel: `Caution: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh)`,
      clampedPercentage,
    };
  }

  // RED: remaining percentage <= 20%
  return {
    status: 'low',
    isAvailable: true,
    color: colors.error || '#ef4444', // Red
    label: 'Low',
    accessibilityLabel: `Low: ${Math.round(clampedPercentage)}% remaining (${Math.round(Number(kwhLeft))} kWh)`,
    clampedPercentage,
  };
}

function getTransitionNotification(fromStatus, toStatus) {
  if (!fromStatus || !toStatus || fromStatus === toStatus) {
    return null;
  }

  // GREEN -> YELLOW
  if (fromStatus === 'healthy' && toStatus === 'medium') {
    return {
      type: 'info',
      title: 'Electricity Level Decreasing ⚡',
      body: 'Your electricity level is getting lower. Consider planning your next recharge.',
      fromStatus,
      toStatus,
    };
  }

  // YELLOW -> RED
  if (fromStatus === 'medium' && toStatus === 'low') {
    return {
      type: 'alert',
      title: 'Low Electricity Warning ⚠️',
      body: 'Your electricity is running low. Consider recharging soon to avoid running out.',
      fromStatus,
      toStatus,
    };
  }

  // RED -> GREEN
  if (fromStatus === 'low' && toStatus === 'healthy') {
    return {
      type: 'purchase',
      title: 'Meter Recharged Successfully ⚡',
      body: 'Your electricity has been recharged. Your meter is back to a healthy level.',
      fromStatus,
      toStatus,
    };
  }

  // GREEN -> RED (Rapid drop / high load)
  if (fromStatus === 'healthy' && toStatus === 'low') {
    return {
      type: 'alert',
      title: 'Low Electricity Warning ⚠️',
      body: 'Your electricity level is low. Consider recharging soon.',
      fromStatus,
      toStatus,
    };
  }

  // RED -> MEDIUM
  if (fromStatus === 'low' && toStatus === 'medium') {
    return {
      type: 'info',
      title: 'Electricity Partially Recharged',
      body: 'Your meter balance is in the caution range. Consider recharging further for a full buffer.',
      fromStatus,
      toStatus,
    };
  }

  return null;
}

// In-memory mock AsyncStorage for transition testing
const mockStorage = new Map();

async function handleMeterStatusTransition(meterId, currentStatus, notifyFn) {
  if (!meterId || !currentStatus) return null;

  const storageKey = `@paypawa_meter_status_${meterId}`;
  const prevStored = mockStorage.get(storageKey);

  if (!prevStored) {
    // Initial mount - record without spam
    mockStorage.set(storageKey, currentStatus);
    return null;
  }

  const prevStatus = prevStored;

  if (prevStatus === currentStatus) {
    return null;
  }

  const transitionNotif = getTransitionNotification(prevStatus, currentStatus);
  mockStorage.set(storageKey, currentStatus);

  if (transitionNotif) {
    notifyFn(transitionNotif);
  }

  return transitionNotif;
}

async function runTests() {
  console.log('====================================================');
  console.log('⚡ PAYPAWA: CURRENT STATUS METER COLOR UX TESTS');
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

  console.log('--- 1. Testing Threshold Calculations & Color Mapping ---');

  test('100% → GREEN (healthy)', () => {
    const res = getEnergyStatus(100, 100);
    assert.strictEqual(res.status, 'healthy');
    assert.strictEqual(res.color, mockColors.secondary);
    assert.strictEqual(res.label, 'Healthy');
  });

  test('75% → GREEN (healthy)', () => {
    const res = getEnergyStatus(75, 75);
    assert.strictEqual(res.status, 'healthy');
    assert.strictEqual(res.color, mockColors.secondary);
  });

  test('50% → YELLOW (medium)', () => {
    const res = getEnergyStatus(50, 50);
    assert.strictEqual(res.status, 'medium');
    assert.strictEqual(res.color, '#eab308');
    assert.strictEqual(res.label, 'Medium');
  });

  test('35% → YELLOW (medium)', () => {
    const res = getEnergyStatus(35, 35);
    assert.strictEqual(res.status, 'medium');
    assert.strictEqual(res.color, '#eab308');
  });

  test('20% → RED (low)', () => {
    const res = getEnergyStatus(20, 20);
    assert.strictEqual(res.status, 'low');
    assert.strictEqual(res.color, mockColors.error);
    assert.strictEqual(res.label, 'Low');
  });

  test('10% → RED (low)', () => {
    const res = getEnergyStatus(10, 10);
    assert.strictEqual(res.status, 'low');
    assert.strictEqual(res.color, mockColors.error);
  });

  test('0% → RED (low)', () => {
    const res = getEnergyStatus(0, 0);
    assert.strictEqual(res.status, 'low');
    assert.strictEqual(res.color, mockColors.error);
  });

  test('Negative remaining (< 0) clamped → RED (low)', () => {
    const res = getEnergyStatus(-5, 0);
    assert.strictEqual(res.status, 'low');
    assert.strictEqual(res.color, mockColors.error);
    assert.strictEqual(res.clampedPercentage, 0);
  });

  test('Data unavailable (null / undefined) → Neutral (no false battery state)', () => {
    const resNull = getEnergyStatus(null, null);
    assert.strictEqual(resNull.status, null);
    assert.strictEqual(resNull.isAvailable, false);
    assert.strictEqual(resNull.color, mockColors.outlineVariant);
    assert.strictEqual(resNull.label, 'Unavailable');

    const resUndef = getEnergyStatus(undefined, undefined);
    assert.strictEqual(resUndef.status, null);
    assert.strictEqual(resUndef.isAvailable, false);
  });

  console.log('\n--- 2. Testing Transition Notification Rules ---');

  test('GREEN → GREEN = no notification', () => {
    const notif = getTransitionNotification('healthy', 'healthy');
    assert.strictEqual(notif, null);
  });

  test('GREEN → YELLOW = notification (info: planning next recharge)', () => {
    const notif = getTransitionNotification('healthy', 'medium');
    assert.notStrictEqual(notif, null);
    assert.strictEqual(notif.type, 'info');
    assert.strictEqual(notif.title, 'Electricity Level Decreasing ⚡');
  });

  test('YELLOW → RED = notification (alert: low electricity warning)', () => {
    const notif = getTransitionNotification('medium', 'low');
    assert.notStrictEqual(notif, null);
    assert.strictEqual(notif.type, 'alert');
    assert.strictEqual(notif.title, 'Low Electricity Warning ⚠️');
  });

  test('RED → RED = no notification', () => {
    const notif = getTransitionNotification('low', 'low');
    assert.strictEqual(notif, null);
  });

  test('RED → GREEN = notification (purchase/info: recharged successfully)', () => {
    const notif = getTransitionNotification('low', 'healthy');
    assert.notStrictEqual(notif, null);
    assert.strictEqual(notif.type, 'purchase');
    assert.strictEqual(notif.title, 'Meter Recharged Successfully ⚡');
  });

  test('GREEN → RED = notification (alert: rapid drop)', () => {
    const notif = getTransitionNotification('healthy', 'low');
    assert.notStrictEqual(notif, null);
    assert.strictEqual(notif.type, 'alert');
  });

  console.log('\n--- 3. Testing Anti-Spam & Persistence Behavior ---');

  await (async () => {
    mockStorage.clear();
    const meterId = 'meter_test_01';
    let firedNotifications = [];
    const notifyFn = (n) => firedNotifications.push(n);

    // Initial mount: meter starts in healthy state -> should store state, NO spam notification
    await handleMeterStatusTransition(meterId, 'healthy', notifyFn);
    test('Initial mount does NOT fire notification spam', () => {
      assert.strictEqual(firedNotifications.length, 0);
      assert.strictEqual(mockStorage.get(`@paypawa_meter_status_${meterId}`), 'healthy');
    });

    // Re-render / screen refresh (same state healthy -> healthy) -> NO notification
    await handleMeterStatusTransition(meterId, 'healthy', notifyFn);
    test('Dashboard re-render / refresh does NOT trigger duplicate notification', () => {
      assert.strictEqual(firedNotifications.length, 0);
    });

    // Status drops to medium (healthy -> medium) -> exactly 1 notification
    await handleMeterStatusTransition(meterId, 'medium', notifyFn);
    test('Genuine status drop (healthy -> medium) triggers exactly 1 notification', () => {
      assert.strictEqual(firedNotifications.length, 1);
      assert.strictEqual(firedNotifications[0].title, 'Electricity Level Decreasing ⚡');
    });

    // Sub-renders at medium -> NO extra notification
    await handleMeterStatusTransition(meterId, 'medium', notifyFn);
    test('Subsequent renders at medium do not spam', () => {
      assert.strictEqual(firedNotifications.length, 1);
    });

    // Status drops to low (medium -> low) -> triggers high alert notification
    await handleMeterStatusTransition(meterId, 'low', notifyFn);
    test('Critical drop (medium -> low) triggers high alert notification', () => {
      assert.strictEqual(firedNotifications.length, 2);
      assert.strictEqual(firedNotifications[1].title, 'Low Electricity Warning ⚠️');
    });

    // User purchases electricity (low -> healthy) -> triggers recharge success notification
    await handleMeterStatusTransition(meterId, 'healthy', notifyFn);
    test('Electricity recharge (low -> healthy) triggers recovery notification', () => {
      assert.strictEqual(firedNotifications.length, 3);
      assert.strictEqual(firedNotifications[2].title, 'Meter Recharged Successfully ⚡');
    });
  })();

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed}/${total} Tests Passed (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
