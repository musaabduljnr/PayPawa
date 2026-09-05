/**
 * ==============================================================================
 * PAYPAWA — PHASE 10F AUDIT LOGGING, SYSTEM ACTIVITY & GOVERNANCE TEST RUNNER
 * ==============================================================================
 * Tests:
 * 1. Sensitive Action Audit Event Generation (Wallets, Payments, Retries, Staff, Roles, Settings)
 * 2. Append-Only Immutability (Rejection of UPDATE & DELETE on audit logs)
 * 3. Sensitive Credential Sanitization & Secret Redaction (Zero password/token/key leaks)
 * 4. Multi-Step Correlation ID Tracing & Chain Retrieval
 * 5. Multi-Dimensional Filtering (Actor, Action, Target, Result, Date, Correlation ID)
 * 6. RBAC Permission Gate (Unauthorized staff blocked from audit streams)
 * ==============================================================================
 */

class MockAuditGovernanceEngine {
  constructor() {
    this.profiles = new Map();
    this.staffMembers = new Map();
    this.rolePermissions = new Map();
    this.auditLogs = [];
    this.immutableLocked = true; // Simulates PostgreSQL DO INSTEAD NOTHING rules
  }

  seedData() {
    // 1. Roles & Permissions
    this.rolePermissions.set('SUPER_ADMIN', new Set(['*']));
    this.rolePermissions.set('OPERATIONS_MANAGER', new Set(['users.view', 'transactions.view', 'transactions.retry', 'transactions.reconcile', 'audit_logs.view']));
    this.rolePermissions.set('FINANCE_MANAGER', new Set(['users.view', 'wallets.view', 'wallets.adjust', 'payments.view', 'payments.reconcile', 'audit_logs.view']));
    this.rolePermissions.set('CUSTOMER_SUPPORT', new Set(['users.view', 'meters.view', 'transactions.view', 'wallets.view', 'support.view', 'support.manage']));

    // 2. Profiles & Staff
    const staffData = [
      { userId: 'usr-admin-1', staffId: 'sm-admin-1', name: 'Alice Admin', email: 'alice@paypawa.ng', role: 'SUPER_ADMIN' },
      { userId: 'usr-ops-1', staffId: 'sm-ops-1', name: 'Bob Ops', email: 'bob@paypawa.ng', role: 'OPERATIONS_MANAGER' },
      { userId: 'usr-fin-1', staffId: 'sm-fin-1', name: 'Charlie Finance', email: 'charlie@paypawa.ng', role: 'FINANCE_MANAGER' },
      { userId: 'usr-support-1', staffId: 'sm-support-1', name: 'David Support', email: 'david@paypawa.ng', role: 'CUSTOMER_SUPPORT' },
    ];

    staffData.forEach(s => {
      this.profiles.set(s.userId, { id: s.userId, full_name: s.name, email: s.email });
      this.staffMembers.set(s.staffId, { id: s.staffId, user_id: s.userId, role: s.role, status: 'ACTIVE' });
    });
  }

  hasPermission(userId, perm) {
    const staff = Array.from(this.staffMembers.values()).find(s => s.user_id === userId);
    if (!staff || staff.status !== 'ACTIVE') return false;
    const perms = this.rolePermissions.get(staff.role);
    if (!perms) return false;
    if (perms.has('*')) return true;
    return perms.has(perm);
  }

  // Procedure: admin_record_audit_log (with sensitive key scrubbing)
  recordAuditLog({
    actorUserId,
    action,
    targetType,
    targetId,
    result = 'SUCCESS',
    correlationId = null,
    metadata = {},
    errorMessage = null
  }) {
    const staff = Array.from(this.staffMembers.values()).find(s => s.user_id === actorUserId);
    const actorProf = this.profiles.get(actorUserId);

    // Scrub sensitive keys (passwords, tokens, API keys, PINs, card numbers)
    const cleanMetadata = { ...metadata };
    const sensitiveKeys = ['password', 'secret', 'api_key', 'token', 'pin', 'card_number', 'authorization'];
    for (const key of sensitiveKeys) {
      if (key in cleanMetadata) {
        cleanMetadata[key] = '***REDACTED***';
      }
    }

    const logId = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const logEntry = {
      id: logId,
      staff_id: staff?.id,
      actor_user_id: actorUserId,
      actor_name: actorProf?.full_name || 'System Process',
      actor_email: actorProf?.email || 'system@paypawa.internal',
      actor_role: staff?.role || 'SYSTEM',
      action,
      target_type: targetType,
      target_id: targetId,
      result,
      correlation_id: correlationId,
      metadata: cleanMetadata,
      error_message: errorMessage,
      created_at: new Date().toISOString()
    };

    this.auditLogs.push(logEntry);
    return { success: true, audit_id: logId, log: logEntry };
  }

  // Attempt to Mutate/Delete Audit Log (Simulating Database Immutability)
  attemptUpdateAuditLog(logId, newMetadata) {
    if (this.immutableLocked) {
      // PostgreSQL Rule: DO INSTEAD NOTHING -> modifications are rejected / discarded
      return { success: false, error: 'IMMUTABLE_TABLE_RULE: UPDATE on audit_logs is strictly forbidden by database rule.' };
    }
    return { success: true };
  }

  attemptDeleteAuditLog(logId) {
    if (this.immutableLocked) {
      // PostgreSQL Rule: DO INSTEAD NOTHING -> deletions are rejected / discarded
      return { success: false, error: 'IMMUTABLE_TABLE_RULE: DELETE on audit_logs is strictly forbidden by database rule.' };
    }
    return { success: true };
  }

  // Procedure: admin_list_audit_logs
  listAuditLogs({
    callerUserId,
    search = '',
    actorId = null,
    action = 'ALL',
    targetType = 'ALL',
    result = 'ALL',
    correlationId = null,
    startDate = null,
    endDate = null,
    limit = 20,
    offset = 0
  }) {
    if (!this.hasPermission(callerUserId, 'audit_logs.view')) {
      return { success: false, error: 'UNAUTHORIZED: Caller lacks audit_logs.view permission.' };
    }

    let list = [...this.auditLogs];

    if (actorId) {
      list = list.filter(l => l.actor_user_id === actorId);
    }
    if (action && action !== 'ALL') {
      list = list.filter(l => l.action === action);
    }
    if (targetType && targetType !== 'ALL') {
      list = list.filter(l => l.target_type === targetType);
    }
    if (result && result !== 'ALL') {
      list = list.filter(l => l.result === result);
    }
    if (correlationId) {
      list = list.filter(l => l.correlation_id && l.correlation_id.toLowerCase().includes(correlationId.toLowerCase()));
    }
    if (startDate) {
      list = list.filter(l => new Date(l.created_at) >= new Date(startDate));
    }
    if (endDate) {
      list = list.filter(l => new Date(l.created_at) <= new Date(endDate));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.action.toLowerCase().includes(q) ||
        (l.target_id && l.target_id.toLowerCase().includes(q)) ||
        (l.correlation_id && l.correlation_id.toLowerCase().includes(q)) ||
        l.actor_name.toLowerCase().includes(q) ||
        l.actor_email.toLowerCase().includes(q)
      );
    }

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return {
      success: true,
      total,
      data: paginated
    };
  }

  // Procedure: admin_get_audit_log_details (with correlated event chain)
  getAuditLogDetails({ callerUserId, auditId }) {
    if (!this.hasPermission(callerUserId, 'audit_logs.view')) {
      return { success: false, error: 'UNAUTHORIZED: Caller lacks audit_logs.view permission.' };
    }

    const log = this.auditLogs.find(l => l.id === auditId);
    if (!log) return { success: false, error: 'AUDIT_LOG_NOT_FOUND' };

    let correlatedEvents = [];
    if (log.correlation_id) {
      correlatedEvents = this.auditLogs
        .filter(l => l.correlation_id === log.correlation_id && l.id !== auditId)
        .map(l => ({
          id: l.id,
          action: l.action,
          target_type: l.target_type,
          target_id: l.target_id,
          result: l.result,
          actor_name: l.actor_name,
          created_at: l.created_at
        }));
    }

    return {
      success: true,
      log,
      correlated_events: correlatedEvents
    };
  }
}

// RUN TEST SUITE
async function runTests() {
  console.log('============================================================');
  console.log('🚀 PAYPAWA — PHASE 10F AUDIT LOGGING & GOVERNANCE TEST SUITE');
  console.log('============================================================\n');

  const engine = new MockAuditGovernanceEngine();
  engine.seedData();

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  const adminUser = 'usr-admin-1';
  const opsUser = 'usr-ops-1';
  const finUser = 'usr-fin-1';
  const supportUser = 'usr-support-1';

  // TEST 1: SENSITIVE MUTATION AUDITING (ALL DOMAINS)
  console.log('1. Sensitive Mutation Audit Event Logging');

  // A. Wallet Adjustment
  const resWal = engine.recordAuditLog({
    actorUserId: finUser,
    action: 'WALLET_ADJUSTMENT',
    targetType: 'WALLET',
    targetId: 'wal-101',
    result: 'SUCCESS',
    correlationId: 'trace-fin-adj-001',
    metadata: { amount_kobo: 500000, adjustment_type: 'CREDIT', reason: 'Dispute refund' }
  });
  assert(resWal.success === true && resWal.log.action === 'WALLET_ADJUSTMENT', 'Wallet adjustment audited with actor and metadata');

  // B. Payment Reconciliation
  const resPay = engine.recordAuditLog({
    actorUserId: finUser,
    action: 'PAYMENT_RECONCILED',
    targetType: 'PAYMENT_ATTEMPT',
    targetId: 'pay-202',
    result: 'SUCCESS',
    correlationId: 'trace-pay-rec-002',
    metadata: { provider: 'monnify', status: 'successful', amount_kobo: 1000000 }
  });
  assert(resPay.success === true && resPay.log.action === 'PAYMENT_RECONCILED', 'Payment reconciliation audited');

  // C. Transaction Retry
  const resRetry = engine.recordAuditLog({
    actorUserId: opsUser,
    action: 'TRANSACTION_RETRY',
    targetType: 'ELECTRICITY_TRANSACTION',
    targetId: 'tx-303',
    result: 'SUCCESS',
    correlationId: 'trace-tx-retry-003',
    metadata: { meter_number: '45028392101', provider: 'vtpass', attempt: 2 }
  });
  assert(resRetry.success === true && resRetry.log.action === 'TRANSACTION_RETRY', 'Transaction retry audited');

  // D. Meter Management
  const resMeter = engine.recordAuditLog({
    actorUserId: opsUser,
    action: 'METER_UPDATED',
    targetType: 'METER',
    targetId: 'mtr-404',
    result: 'SUCCESS',
    metadata: { disco: 'AEDC', address: 'Plot 10 Maitama' }
  });
  assert(resMeter.success === true && resMeter.log.action === 'METER_UPDATED', 'Meter change audited');

  // E. Staff Creation & Role Updates
  const resStaff = engine.recordAuditLog({
    actorUserId: adminUser,
    action: 'STAFF_MEMBER_CREATED',
    targetType: 'STAFF_MEMBER',
    targetId: 'staff-505',
    result: 'SUCCESS',
    metadata: { role: 'FINANCE_MANAGER', email: 'new.staff@paypawa.ng' }
  });
  assert(resStaff.success === true && resStaff.log.action === 'STAFF_MEMBER_CREATED', 'Staff creation audited');

  // F. Role & Permission Updates
  const resPerm = engine.recordAuditLog({
    actorUserId: adminUser,
    action: 'ROLE_PERMISSIONS_UPDATED',
    targetType: 'ROLE',
    targetId: 'role-support',
    result: 'SUCCESS',
    metadata: { permissions_added: ['audit_logs.view'] }
  });
  assert(resPerm.success === true && resPerm.log.action === 'ROLE_PERMISSIONS_UPDATED', 'Role permission changes audited');

  // G. Settings Changes
  const resSetting = engine.recordAuditLog({
    actorUserId: adminUser,
    action: 'SETTINGS_CHANGED',
    targetType: 'SYSTEM_SETTING',
    targetId: 'cfg-rate-limit',
    result: 'SUCCESS',
    metadata: { key: 'MAX_DAILY_PURCHASE_LIMIT', new_value: 5000000 }
  });
  assert(resSetting.success === true && resSetting.log.action === 'SETTINGS_CHANGED', 'Platform settings change audited');

  // H. Integration Changes
  const resInteg = engine.recordAuditLog({
    actorUserId: adminUser,
    action: 'INTEGRATION_CHANGED',
    targetType: 'INTEGRATION_CONFIG',
    targetId: 'prov-vtpass',
    result: 'SUCCESS',
    metadata: { status: 'ACTIVE', failover_enabled: true }
  });
  assert(resInteg.success === true && resInteg.log.action === 'INTEGRATION_CHANGED', 'Integration config change audited');

  // TEST 2: APPEND-ONLY IMMUTABILITY (STRICT DATABASE RULES)
  console.log('\n2. Append-Only Immutability Enforcement');
  const targetAuditId = resWal.audit_id;

  const resUpdateAttempt = engine.attemptUpdateAuditLog(targetAuditId, { amount_kobo: 0 });
  assert(resUpdateAttempt.success === false && resUpdateAttempt.error.includes('IMMUTABLE_TABLE_RULE'), 'UPDATE attempt on audit record rejected by database immutability rule');

  const resDeleteAttempt = engine.attemptDeleteAuditLog(targetAuditId);
  assert(resDeleteAttempt.success === false && resDeleteAttempt.error.includes('IMMUTABLE_TABLE_RULE'), 'DELETE attempt on audit record rejected by database immutability rule');

  // TEST 3: SENSITIVE CREDENTIAL & SECRET SANITIZATION
  console.log('\n3. Sensitive Credential & Secret Scrubbing');
  const resSecretScrub = engine.recordAuditLog({
    actorUserId: adminUser,
    action: 'INTEGRATION_CREDENTIAL_UPDATED',
    targetType: 'INTEGRATION_CONFIG',
    targetId: 'prov-vtpass',
    result: 'SUCCESS',
    metadata: {
      provider: 'vtpass',
      api_key: 'sk_live_very_secret_key_12345',
      secret: 'secret_hash_98765',
      password: 'super_secure_password',
      token: 'jwt_bearer_token_xyz',
      pin: '1234',
      allowed_ips: ['192.168.1.1']
    }
  });
  assert(resSecretScrub.success === true, 'Audit log recorded with sensitive payload');
  assert(resSecretScrub.log.metadata.api_key === '***REDACTED***', 'API key scrubbed and redacted');
  assert(resSecretScrub.log.metadata.secret === '***REDACTED***', 'Secret scrubbed and redacted');
  assert(resSecretScrub.log.metadata.password === '***REDACTED***', 'Password scrubbed and redacted');
  assert(resSecretScrub.log.metadata.token === '***REDACTED***', 'JWT token scrubbed and redacted');
  assert(resSecretScrub.log.metadata.pin === '***REDACTED***', 'PIN scrubbed and redacted');
  assert(Array.isArray(resSecretScrub.log.metadata.allowed_ips), 'Non-sensitive configuration retained');

  // TEST 4: MULTI-STEP CORRELATION ID TRACING
  console.log('\n4. Multi-Step Correlation ID Tracing & Chain Navigation');
  const commonCorrelationId = 'trace-purchase-lifecycle-777';

  // Step 1: Customer funding payment attempt
  const trace1 = engine.recordAuditLog({
    actorUserId: finUser,
    action: 'PAYMENT_RECEIVED',
    targetType: 'PAYMENT_ATTEMPT',
    targetId: 'pay-777',
    result: 'SUCCESS',
    correlationId: commonCorrelationId,
    metadata: { amount: 5000 }
  });

  // Step 2: Ledger credit
  const trace2 = engine.recordAuditLog({
    actorUserId: finUser,
    action: 'WALLET_CREDITED',
    targetType: 'WALLET',
    targetId: 'wal-777',
    result: 'SUCCESS',
    correlationId: commonCorrelationId,
    metadata: { balance_after: 5000 }
  });

  // Step 3: Vending initiation
  const trace3 = engine.recordAuditLog({
    actorUserId: opsUser,
    action: 'VENDING_DISPATCHED',
    targetType: 'ELECTRICITY_TRANSACTION',
    targetId: 'tx-777',
    result: 'WARNING',
    correlationId: commonCorrelationId,
    metadata: { provider: 'vtpass', status: 'timeout' }
  });

  // Step 4: Admin manual retry
  const trace4 = engine.recordAuditLog({
    actorUserId: opsUser,
    action: 'TRANSACTION_RETRY',
    targetType: 'ELECTRICITY_TRANSACTION',
    targetId: 'tx-777',
    result: 'SUCCESS',
    correlationId: commonCorrelationId,
    metadata: { token: '4829-1029-3849-1029-4829' }
  });

  // Retrieve details for Step 4 and verify all other 3 correlated events are returned
  const resDetail = engine.getAuditLogDetails({ callerUserId: opsUser, auditId: trace4.audit_id });
  assert(resDetail.success === true, 'Retrieved audit event details');
  assert(resDetail.log.correlation_id === commonCorrelationId, 'Correct correlation ID attached to event');
  assert(resDetail.correlated_events.length === 3, 'Correlated trace chain contains all 3 linked operations');
  assert(resDetail.correlated_events.some(c => c.action === 'PAYMENT_RECEIVED'), 'Chain links back to initial payment attempt');
  assert(resDetail.correlated_events.some(c => c.action === 'WALLET_CREDITED'), 'Chain links wallet credit ledger');
  assert(resDetail.correlated_events.some(c => c.action === 'VENDING_DISPATCHED'), 'Chain links intermediate vending dispatch');

  // TEST 5: MULTI-DIMENSIONAL FILTERING
  console.log('\n5. Multi-Dimensional Search & Filtering');
  // Filter by Action
  const resFilterAction = engine.listAuditLogs({ callerUserId: adminUser, action: 'WALLET_ADJUSTMENT' });
  assert(resFilterAction.success === true && resFilterAction.total >= 1, 'Filter by action WALLET_ADJUSTMENT works');

  // Filter by Result
  const resFilterResult = engine.listAuditLogs({ callerUserId: adminUser, result: 'WARNING' });
  assert(resFilterResult.success === true && resFilterResult.total >= 1, 'Filter by result WARNING works');

  // Filter by Correlation ID
  const resFilterCorr = engine.listAuditLogs({ callerUserId: adminUser, correlationId: 'trace-purchase-lifecycle-777' });
  assert(resFilterCorr.success === true && resFilterCorr.total === 4, 'Filter by exact Correlation ID returns complete 4-event trace');

  // TEST 6: RBAC PERMISSION ENFORCEMENT
  console.log('\n6. RBAC Permission Gate (Unauthorized Access Prevention)');
  const resUnauthorized = engine.listAuditLogs({ callerUserId: supportUser });
  assert(resUnauthorized.success === false && resUnauthorized.error.includes('UNAUTHORIZED'), 'Customer Support without audit_logs.view blocked from reading audit logs');

  const resDetailUnauthorized = engine.getAuditLogDetails({ callerUserId: supportUser, auditId: trace1.audit_id });
  assert(resDetailUnauthorized.success === false && resDetailUnauthorized.error.includes('UNAUTHORIZED'), 'Customer Support blocked from viewing audit detail & traces');

  // FINAL RESULTS
  console.log('\n============================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
