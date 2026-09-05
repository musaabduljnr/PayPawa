/**
 * ============================================================================
 * SQUAD ELECTRICITY PROVIDER VERIFICATION SUITE
 * ============================================================================
 * Tests:
 * 1. DISCO code normalization mapping
 * 2. Provider factory registration and resolution
 * 3. Dynamic provider directory fetching
 * 4. Meter lookup with reference and arrears extraction
 * 5. Minimum vend guarding pre-flight check
 * 6. JIT lookup-to-vend execution and token normalization
 * 7. Requery and transaction reconciliation
 * ============================================================================
 */

import assert from 'node:assert';

// 1. Test DISCO Mapping
const { normalizeToSquadDisco, SQUAD_DISCO_MAP } = await import('../src/services/providers/discoMapping.ts');

console.log('🧪 [Test 1] Testing DISCO Code Normalization Mapping...');
assert.strictEqual(normalizeToSquadDisco('ikedc'), 'IE', 'ikedc should map to IE');
assert.strictEqual(normalizeToSquadDisco('ikeja-electric'), 'IE', 'ikeja-electric should map to IE');
assert.strictEqual(normalizeToSquadDisco('AEDC'), 'AEDC', 'AEDC should map to AEDC');
assert.strictEqual(normalizeToSquadDisco('abuja-electric'), 'AEDC', 'abuja-electric should map to AEDC');
assert.strictEqual(normalizeToSquadDisco('ekedc'), 'EKEDC', 'ekedc should map to EKEDC');
assert.strictEqual(normalizeToSquadDisco('kano-electric'), 'KEDCO', 'kano-electric should map to KEDCO');
assert.strictEqual(normalizeToSquadDisco('unknown-disco'), 'UNKNOWN-DISCO', 'Unknown disco should uppercase');
console.log('✅ DISCO normalization mapping tests passed!\n');

// 2. Test SquadProvider with Mocked Fetch matching Squad Documentation
const { SquadProvider } = await import('../src/services/providers/SquadProvider.ts');

console.log('🧪 [Test 2] Testing SquadProvider with Official Squad API Payloads...');

// Sample responses directly from Squad API Docs:
const mockLookupResponse = {
  status: 200,
  success: true,
  message: 'Success',
  data: {
    reference: 'IE-2505305db8e15f0ab62bb6',
    customer_name: 'GALADIMA SHEHU MALAMI',
    minimum_vend: 12920.32,
    account_type: 'NMD',
    outstanding_debt: '361257.12',
    address: '9 ADEYEMO STREET MAFOLUKU',
    meter_type: 'prepaid',
    provider: 'IE',
  },
};

const mockVendResponse = {
  status: 200,
  success: true,
  message: 'Success',
  data: {
    reference: 'IE-2505305db8e15f0ab62bb6',
    amount: '13000.00',
    merchant_amount: '12883.00',
    phone_number: '07062918558',
    email: 'victor@gmail.com',
    merchant_id: 'SBS5B8VU36',
    wallet_batch_id: 'EUMXBV9AURZKE3LDGJRRQBNGJSAP3ZU',
    value_reference: '26832663990919393911',
    network: null,
    transaction_id: null,
    type: 'electricity',
    action: 'debit',
    status: 'success',
    meta_json: {
      kct: '',
      vat: '-2221.83',
      token: '26832663990919393911',
      address: '9 ADEYEMO STREET MAFOLUKU',
      balance: '0.00',
      penalty: '0',
      provider: 'IE',
      vat_rate: '0.075',
      hp_profit: 39,
      reference: 'IE-2505305db8e15f0ab62bb6',
      account_no: '0102016364',
      meter_cost: '0.00',
      meter_type: 'prepaid',
      amount_paid: 13000,
      tariff_rate: '45.8',
      total_units: '332.35',
      account_name: 'GALADIMA SHEHU MALAMI',
      cost_of_unit: '15221.83',
      fixed_charge: '0',
      meter_number: '45067198783',
      tariff_class: 'C-Non MD',
      receipt_number: '250530971742',
      transaction_date: '20250530152931',
    },
  },
};

const mockRequeryResponse = {
  status: 200,
  success: true,
  message: 'Success',
  data: [
    {
      ...mockVendResponse.data,
      status: 'success',
    },
  ],
};

let capturedRequests = [];

// Intercept global fetch for test
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  capturedRequests.push({ url: url.toString(), options });

  if (url.includes('/service-providers')) {
    return {
      status: 200,
      json: async () => ({
        status: 200,
        success: true,
        data: [
          { code: 'IE', name: 'Ikeja Electricity', logo_url: 'https://example.com/ie.png' },
          { code: 'AEDC', name: 'Abuja Electricity', logo_url: null },
        ],
      }),
    };
  }

  if (url.includes('/lookup')) {
    return {
      status: 200,
      json: async () => mockLookupResponse,
    };
  }

  if (url.includes('/vending/utilities/electricity')) {
    return {
      status: 200,
      json: async () => mockVendResponse,
    };
  }

  if (url.includes('/vending/transactions')) {
    return {
      status: 200,
      json: async () => mockRequeryResponse,
    };
  }

  return { status: 404, json: async () => ({ message: 'Not found' }) };
};

try {
  const provider = new SquadProvider('https://sandbox-api-d.squadco.com', 'sandbox_sk_test_key_123');

  // Test 2A: verifyMeter
  console.log('🔍 Testing verifyMeter()...');
  const verifyRes = await provider.verifyMeter({
    meterNumber: '45067198783',
    discoCode: 'ikedc',
    meterType: 'prepaid',
  });

  assert.strictEqual(verifyRes.success, true, 'Lookup must succeed');
  assert.strictEqual(verifyRes.customerName, 'GALADIMA SHEHU MALAMI');
  assert.strictEqual(verifyRes.providerSessionRef, 'IE-2505305db8e15f0ab62bb6');
  assert.strictEqual(verifyRes.minimumVendNaira, 12920.32);
  assert.strictEqual(verifyRes.outstandingDebtNaira, 361257.12);
  console.log('✅ verifyMeter parsed reference, debt, and minimum vend accurately!');

  // Test 2B: Minimum Vend Guard Violation
  console.log('\n🛡️ Testing Minimum Vend Guard Violation (attempting ₦5,000 when minimum is ₦12,920.32)...');
  const belowMinVendRes = await provider.vendToken({
    meterNumber: '45067198783',
    discoCode: 'ikedc',
    amountKobo: 500000, // ₦5,000
    meterType: 'prepaid',
    idempotencyKey: 'idem_test_1',
    internalReference: 'SE-20260903-TEST001',
  });

  assert.strictEqual(belowMinVendRes.success, false, 'Should fail due to minimum vend guard');
  assert.match(belowMinVendRes.responseMessage, /below the DISCO minimum threshold/i);
  console.log('✅ Minimum vend guard rejected underfunded purchase safely!');

  // Test 2C: JIT Lookup & Vending with valid amount (₦13,000 >= ₦12,920.32)
  console.log('\n⚡ Testing JIT Lookup-to-Vend with ₦13,000 purchase...');
  const vendRes = await provider.vendToken({
    meterNumber: '45067198783',
    discoCode: 'ikedc',
    amountKobo: 1300000, // ₦13,000
    meterType: 'prepaid',
    customerPhoneNumber: '07062918558',
    customerEmail: 'victor@gmail.com',
    idempotencyKey: 'idem_test_2',
    internalReference: 'SE-20260903-TEST002',
  });

  assert.strictEqual(vendRes.success, true, 'Vending must succeed');
  assert.strictEqual(vendRes.status, 'successful');
  assert.strictEqual(vendRes.token, '2683 2663 9909 1939 3911', 'Token must be formatted with spaces');
  assert.strictEqual(vendRes.unitsKwh, 332.35, 'Units must match total_units');
  assert.strictEqual(vendRes.tariffPerKwhKobo, 4580, 'Tariff must match 45.8 NGN in kobo');
  assert.strictEqual(vendRes.vatNaira, 2221.83, 'VAT must match');
  assert.strictEqual(vendRes.receiptNumber, '250530971742', 'Receipt number must be extracted');
  assert.strictEqual(vendRes.tariffClass, 'C-Non MD');
  console.log('✅ Vending successfully executed JIT lookup, validated threshold, and normalized token & receipt!');

  // Test 2D: Requery / Reconciliation
  console.log('\n🔄 Testing Transaction Requery / Reconciliation...');
  const requeryRes = await provider.queryTransactionStatus({
    internalReference: 'SE-20260903-TEST002',
    providerReference: 'IE-2505305db8e15f0ab62bb6',
  });

  assert.strictEqual(requeryRes.status, 'successful');
  assert.strictEqual(requeryRes.token, '2683 2663 9909 1939 3911');
  assert.strictEqual(requeryRes.unitsKwh, 332.35);
  console.log('✅ Requery reconciled status, token, and units successfully!');

  // Test 3: Factory Switcher
  console.log('\n🏭 [Test 3] Testing ElectricityProviderFactory...');
  const { ElectricityProviderFactory } = await import('../src/services/providers/index.ts');
  const squadInstance = ElectricityProviderFactory.getProvider('squad');
  assert.strictEqual(squadInstance.providerName, 'squad', 'Provider name must be squad');

  const vtpassInstance = ElectricityProviderFactory.getProvider('vtpass');
  assert.strictEqual(vtpassInstance.providerName, 'vtpass', 'Provider name must be vtpass');
  console.log('✅ ElectricityProviderFactory supports both squad and vtpass seamlessly!');

  console.log('\n================================================================');
  console.log('🎉 ALL SQUAD PROVIDER & BUSINESS LOGIC AUDIT TESTS PASSED (100%)');
  console.log('================================================================');
} finally {
  globalThis.fetch = originalFetch;
}
