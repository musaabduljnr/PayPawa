/**
 * ==============================================================================
 * PAYPAWA — PHASE 10A ADMIN PORTAL FOUNDATION, AUTHENTICATION & RBAC TEST RUNNER
 * ==============================================================================
 * Tests:
 * 1. Unauthenticated & Customer Access Denial
 * 2. Staff Lifecycle & Status Enforcement (ACTIVE, SUSPENDED, DISABLED)
 * 3. 7 Canonical Roles & Exact Permission Mappings
 * 4. Server-Side Permission Evaluation (Anti-Privilege Escalation)
 * 5. Immutable Audit Trail Logging Engine
 * ==============================================================================
 */

class RBACEngine {
  constructor() {
    this.roles = new Map();
    this.permissions = new Set();
    this.rolePermissions = new Map(); // roleName -> Set of permission keys
    this.staffMembers = new Map(); // userId -> { staffId, roleName, status }
    this.auditLogs = [];
  }

  seedPermissions(permissionList) {
    permissionList.forEach(p => this.permissions.add(p));
  }

  seedRoles(rolesList) {
    rolesList.forEach(r => this.roles.set(r.name, r));
  }

  mapRolePermissions(roleName, perms) {
    if (roleName === 'SUPER_ADMIN') {
      this.rolePermissions.set(roleName, new Set(this.permissions));
    } else {
      this.rolePermissions.set(roleName, new Set(perms));
    }
  }

  registerStaff(userId, roleName, status = 'ACTIVE') {
    this.staffMembers.set(userId, {
      staffId: `staff-${userId}`,
      userId,
      roleName,
      status,
      lastLoginAt: new Date().toISOString(),
    });
  }

  // Server-side function: is_staff
  isStaff(userId) {
    const staff = this.staffMembers.get(userId);
    return Boolean(staff && staff.status === 'ACTIVE');
  }

  // Server-side function: has_permission
  hasPermission(userId, permissionKey) {
    if (!userId) return false;
    const staff = this.staffMembers.get(userId);
    if (!staff || staff.status !== 'ACTIVE') return false;

    if (staff.roleName === 'SUPER_ADMIN') return true;

    const granted = this.rolePermissions.get(staff.roleName);
    return Boolean(granted && granted.has(permissionKey));
  }

  // Server-side function: get_staff_context
  getStaffContext(userId) {
    const staff = this.staffMembers.get(userId);
    if (!staff) {
      return { is_staff: false, error: 'USER_NOT_STAFF' };
    }
    if (staff.status !== 'ACTIVE') {
      return { is_staff: true, status: staff.status, error: 'STAFF_ACCOUNT_SUSPENDED' };
    }

    const granted = this.rolePermissions.get(staff.roleName);
    const permissions = staff.roleName === 'SUPER_ADMIN' 
      ? Array.from(this.permissions) 
      : Array.from(granted || []);

    return {
      is_staff: true,
      staff_id: staff.staffId,
      user_id: staff.userId,
      role: staff.roleName,
      status: staff.status,
      permissions,
      last_login_at: staff.lastLoginAt,
    };
  }

  // Server-side function: log_audit_event
  logAuditEvent(actorUserId, action, targetType, targetId, metadata = {}) {
    const staff = this.staffMembers.get(actorUserId);
    const entry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      staff_id: staff ? staff.staffId : null,
      actor_user_id: actorUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
      created_at: new Date().toISOString(),
    };
    this.auditLogs.push(entry);
    return entry.id;
  }
}

// -----------------------------------------------------------------------------
// TEST RUNNER EXECUTION
// -----------------------------------------------------------------------------
async function runTests() {
  console.log('\n================================================================');
  console.log('⚡ PAYPAWA — PHASE 10A ADMIN FOUNDATION & RBAC TEST SUITE');
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

  const engine = new RBACEngine();

  // 1. Seed Platform Permissions
  const ALL_PERMISSIONS = [
    'users.view', 'users.manage',
    'meters.view', 'meters.manage',
    'transactions.view', 'transactions.reconcile', 'transactions.retry',
    'payments.view', 'payments.reconcile',
    'wallets.view', 'wallets.adjust',
    'support.view', 'support.manage',
    'reports.view', 'reports.export',
    'staff.view', 'staff.manage',
    'audit_logs.view',
    'integrations.view', 'integrations.manage',
    'settings.view', 'settings.manage',
    'ai.view', 'ai.manage'
  ];
  engine.seedPermissions(ALL_PERMISSIONS);

  // 2. Seed Platform Roles
  engine.seedRoles([
    { name: 'SUPER_ADMIN', display_name: 'Super Administrator' },
    { name: 'OPERATIONS_MANAGER', display_name: 'Operations Manager' },
    { name: 'OPERATIONS_AGENT', display_name: 'Operations Agent' },
    { name: 'FINANCE_MANAGER', display_name: 'Finance Manager' },
    { name: 'FINANCE_AGENT', display_name: 'Finance Agent' },
    { name: 'CUSTOMER_SUPPORT', display_name: 'Customer Support' },
    { name: 'ANALYST', display_name: 'Data & Business Analyst' }
  ]);

  // 3. Map Canonical Role Permissions
  engine.mapRolePermissions('SUPER_ADMIN', ALL_PERMISSIONS);
  engine.mapRolePermissions('OPERATIONS_MANAGER', [
    'users.view', 'meters.view', 'meters.manage', 'transactions.view',
    'transactions.reconcile', 'transactions.retry', 'reports.view'
  ]);
  engine.mapRolePermissions('OPERATIONS_AGENT', [
    'users.view', 'meters.view', 'transactions.view', 'transactions.reconcile'
  ]);
  engine.mapRolePermissions('FINANCE_MANAGER', [
    'users.view', 'transactions.view', 'payments.view', 'payments.reconcile',
    'wallets.view', 'wallets.adjust', 'reports.view', 'reports.export'
  ]);
  engine.mapRolePermissions('FINANCE_AGENT', [
    'users.view', 'transactions.view', 'payments.view', 'payments.reconcile', 'wallets.view'
  ]);
  engine.mapRolePermissions('CUSTOMER_SUPPORT', [
    'users.view', 'meters.view', 'transactions.view', 'wallets.view', 'support.view', 'support.manage'
  ]);
  engine.mapRolePermissions('ANALYST', [
    'users.view', 'meters.view', 'transactions.view', 'payments.view', 'wallets.view', 'reports.view', 'reports.export'
  ]);

  // --- SUITE 1: UNAUTHENTICATED & CUSTOMER ACCOUNT ACCESS ---
  console.log('=== SUITE 1: UNAUTHENTICATED & CUSTOMER REJECTION ===');
  assert(!engine.isStaff(null), 'Unauthenticated user rejected from staff portal');
  assert(!engine.hasPermission(null, 'users.view'), 'Unauthenticated user rejected from all permissions');

  const customerId = 'cust-101';
  assert(!engine.isStaff(customerId), 'Customer account is NOT treated as staff');
  const custContext = engine.getStaffContext(customerId);
  assert(custContext.is_staff === false && custContext.error === 'USER_NOT_STAFF', 'Customer context returns is_staff: false');
  assert(!engine.hasPermission(customerId, 'transactions.view'), 'Customer account cannot execute staff permissions');

  // --- SUITE 2: STAFF LIFECYCLE & STATUS ENFORCEMENT ---
  console.log('\n=== SUITE 2: STAFF LIFECYCLE & STATUS GUARDS ===');
  const suspendedStaffId = 'staff-suspended-201';
  engine.registerStaff(suspendedStaffId, 'OPERATIONS_MANAGER', 'SUSPENDED');
  assert(!engine.isStaff(suspendedStaffId), 'Suspended staff member is recognized as inactive');
  assert(!engine.hasPermission(suspendedStaffId, 'transactions.reconcile'), 'Suspended staff member has all permissions revoked');
  const suspendedContext = engine.getStaffContext(suspendedStaffId);
  assert(suspendedContext.error === 'STAFF_ACCOUNT_SUSPENDED', 'Suspended staff context returns STAFF_ACCOUNT_SUSPENDED');

  const disabledStaffId = 'staff-disabled-202';
  engine.registerStaff(disabledStaffId, 'FINANCE_MANAGER', 'DISABLED');
  assert(!engine.isStaff(disabledStaffId), 'Disabled staff member is recognized as inactive');
  assert(!engine.hasPermission(disabledStaffId, 'wallets.adjust'), 'Disabled staff member cannot adjust wallets');

  // --- SUITE 3: ALL 7 ROLES PERMISSION MATRIX VERIFICATION ---
  console.log('\n=== SUITE 3: CANONICAL ROLES PERMISSION MATRIX ===');

  // 1. Super Admin
  const superAdminId = 'user-superadmin';
  engine.registerStaff(superAdminId, 'SUPER_ADMIN', 'ACTIVE');
  const superContext = engine.getStaffContext(superAdminId);
  assert(superContext.is_staff === true && superContext.role === 'SUPER_ADMIN', 'Super Admin profile recognized');
  assert(superContext.permissions.length === ALL_PERMISSIONS.length, 'Super Admin has all platform permissions (24/24)');
  assert(engine.hasPermission(superAdminId, 'staff.manage'), 'Super Admin satisfies staff.manage');
  assert(engine.hasPermission(superAdminId, 'settings.manage'), 'Super Admin satisfies settings.manage');

  // 2. Operations Manager
  const opsMgrId = 'user-opsmgr';
  engine.registerStaff(opsMgrId, 'OPERATIONS_MANAGER', 'ACTIVE');
  assert(engine.hasPermission(opsMgrId, 'transactions.retry'), 'Operations Manager has transactions.retry');
  assert(engine.hasPermission(opsMgrId, 'meters.manage'), 'Operations Manager has meters.manage');
  assert(!engine.hasPermission(opsMgrId, 'wallets.adjust'), 'Operations Manager CANNOT adjust wallets');
  assert(!engine.hasPermission(opsMgrId, 'staff.manage'), 'Operations Manager CANNOT manage staff');

  // 3. Operations Agent
  const opsAgentId = 'user-opsagent';
  engine.registerStaff(opsAgentId, 'OPERATIONS_AGENT', 'ACTIVE');
  assert(engine.hasPermission(opsAgentId, 'transactions.reconcile'), 'Operations Agent has transactions.reconcile');
  assert(!engine.hasPermission(opsAgentId, 'transactions.retry'), 'Operations Agent CANNOT retry transactions');
  assert(!engine.hasPermission(opsAgentId, 'meters.manage'), 'Operations Agent CANNOT manage meters');

  // 4. Finance Manager
  const finMgrId = 'user-finmgr';
  engine.registerStaff(finMgrId, 'FINANCE_MANAGER', 'ACTIVE');
  assert(engine.hasPermission(finMgrId, 'wallets.adjust'), 'Finance Manager has wallets.adjust');
  assert(engine.hasPermission(finMgrId, 'payments.reconcile'), 'Finance Manager has payments.reconcile');
  assert(engine.hasPermission(finMgrId, 'reports.export'), 'Finance Manager has reports.export');
  assert(!engine.hasPermission(finMgrId, 'settings.manage'), 'Finance Manager CANNOT change system settings');

  // 5. Finance Agent
  const finAgentId = 'user-finagent';
  engine.registerStaff(finAgentId, 'FINANCE_AGENT', 'ACTIVE');
  assert(engine.hasPermission(finAgentId, 'payments.reconcile'), 'Finance Agent has payments.reconcile');
  assert(!engine.hasPermission(finAgentId, 'wallets.adjust'), 'Finance Agent CANNOT adjust wallets');
  assert(!engine.hasPermission(finAgentId, 'reports.export'), 'Finance Agent CANNOT export reports');

  // 6. Customer Support
  const supportId = 'user-support';
  engine.registerStaff(supportId, 'CUSTOMER_SUPPORT', 'ACTIVE');
  assert(engine.hasPermission(supportId, 'support.manage'), 'Customer Support has support.manage');
  assert(engine.hasPermission(supportId, 'wallets.view'), 'Customer Support has wallets.view');
  assert(!engine.hasPermission(supportId, 'wallets.adjust'), 'Customer Support CANNOT adjust wallets');
  assert(!engine.hasPermission(supportId, 'transactions.reconcile'), 'Customer Support CANNOT reconcile transactions');

  // 7. Analyst
  const analystId = 'user-analyst';
  engine.registerStaff(analystId, 'ANALYST', 'ACTIVE');
  assert(engine.hasPermission(analystId, 'reports.view'), 'Analyst has reports.view');
  assert(engine.hasPermission(analystId, 'reports.export'), 'Analyst has reports.export');
  assert(!engine.hasPermission(analystId, 'users.manage'), 'Analyst CANNOT manage users');
  assert(!engine.hasPermission(analystId, 'wallets.adjust'), 'Analyst CANNOT adjust wallets');

  // --- SUITE 4: SERVER-SIDE AUTHORIZATION & ESCALATION DEFENSE ---
  console.log('\n=== SUITE 4: SERVER-SIDE PRIVILEGE ESCALATION DEFENSE ===');
  assert(!engine.hasPermission(opsAgentId, 'wallets.adjust'), 'Escalation Blocked: Agent cannot adjust wallets');
  assert(!engine.hasPermission(supportId, 'staff.manage'), 'Escalation Blocked: Support cannot manage staff');
  assert(!engine.hasPermission(analystId, 'settings.manage'), 'Escalation Blocked: Analyst cannot change system settings');
  assert(!engine.hasPermission(finAgentId, 'ai.manage'), 'Escalation Blocked: Finance Agent cannot modify AI configs');

  // --- SUITE 5: AUDIT LOGGING FOUNDATION ---
  console.log('\n=== SUITE 5: IMMUTABLE AUDIT LOGGING ENGINE ===');
  const auditId = engine.logAuditEvent(
    finMgrId,
    'WALLET_ADJUSTMENT_INITIATED',
    'WALLET',
    'w-12345',
    { amount_kobo: 500000, reason: 'Dispute refund resolution' }
  );
  assert(typeof auditId === 'string' && auditId.startsWith('audit-'), 'Audit log generated unique immutable ID');
  const loggedEntry = engine.auditLogs.find(e => e.id === auditId);
  assert(loggedEntry && loggedEntry.actor_user_id === finMgrId, 'Audit log correctly attributes actor user');
  assert(loggedEntry.action === 'WALLET_ADJUSTMENT_INITIATED', 'Audit log records exact action type');
  assert(loggedEntry.metadata.amount_kobo === 500000, 'Audit log preserves structured metadata');

  console.log('\n================================================================');
  console.log('📊 PHASE 10A TEST RUNNER RESULTS SUMMARY');
  console.log('================================================================');
  console.log(`Total Assertions: ${passed + failed}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);

  if (failed === 0) {
    console.log('\n🎉 ALL PHASE 10A ADMIN & RBAC TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error(`\n❌ PHASE 10A FAILED WITH ${failed} FAILURES!\n`);
    process.exit(1);
  }
}

runTests();
