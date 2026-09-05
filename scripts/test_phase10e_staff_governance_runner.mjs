/**
 * ==============================================================================
 * PAYPAWA — PHASE 10E STAFF MANAGEMENT, RBAC & GOVERNANCE TEST RUNNER
 * ==============================================================================
 * Tests:
 * 1. Staff Directory & Staff Creation (Super Admin only, required fields)
 * 2. Staff Status Transition (ACTIVE, SUSPENDED, DISABLED) & Access Revocation
 * 3. Modular Role & Permission Configuration
 * 4. Self-Escalation Protection (Strict rejection of self-role / self-permission edits)
 * 5. Self-Status Modification Protection (No self-unbanning / self-deactivation)
 * 6. Dual Control / Four-Eyes Principle (Super Admin elevation requires 2nd admin)
 * 7. Privilege Escalation & Direct Unauthorized API Call Prevention
 * 8. Sanitized Staff Activity Audit Logging (Zero credential leakage)
 * ==============================================================================
 */

class MockStaffGovernanceEngine {
  constructor() {
    this.profiles = new Map();
    this.roles = new Map();
    this.permissions = new Map();
    this.rolePermissions = new Map();
    this.staffMembers = new Map();
    this.governanceApprovals = new Map();
    this.auditLogs = [];
  }

  seedData() {
    // 1. Seed Permissions
    const permList = [
      { id: 'p1', key: 'users.view', module: 'users', description: 'View customer accounts' },
      { id: 'p2', key: 'users.manage', module: 'users', description: 'Manage customer accounts' },
      { id: 'p3', key: 'meters.view', module: 'meters', description: 'View meter registrations' },
      { id: 'p4', key: 'meters.manage', module: 'meters', description: 'Manage meters' },
      { id: 'p5', key: 'transactions.view', module: 'transactions', description: 'View transactions' },
      { id: 'p6', key: 'transactions.reconcile', module: 'transactions', description: 'Reconcile vending' },
      { id: 'p7', key: 'wallets.view', module: 'wallets', description: 'View wallet balances' },
      { id: 'p8', key: 'wallets.adjust', module: 'wallets', description: 'Adjust wallet balance' },
      { id: 'p9', key: 'support.view', module: 'support', description: 'View support cases' },
      { id: 'p10', key: 'support.manage', module: 'support', description: 'Manage support cases' },
      { id: 'p11', key: 'staff.view', module: 'staff', description: 'View staff directory' },
      { id: 'p12', key: 'staff.manage', module: 'staff', description: 'Manage staff and roles' },
      { id: 'p13', key: 'audit_logs.view', module: 'audit_logs', description: 'View audit trail' },
      { id: 'p14', key: 'settings.manage', module: 'settings', description: 'Modify platform settings' },
    ];
    permList.forEach(p => this.permissions.set(p.key, p));

    // 2. Seed Roles
    const roleList = [
      { id: 'role-super-admin', name: 'SUPER_ADMIN', display_name: 'Super Administrator', description: 'Full unrestricted platform access' },
      { id: 'role-ops-mgr', name: 'OPERATIONS_MANAGER', display_name: 'Operations Manager', description: 'Supervises meters and vending operations' },
      { id: 'role-fin-mgr', name: 'FINANCE_MANAGER', display_name: 'Finance Manager', description: 'Financial reconciliation and adjustments' },
      { id: 'role-support', name: 'CUSTOMER_SUPPORT', display_name: 'Customer Support', description: 'Handles inquiries and support tickets' },
      { id: 'role-analyst', name: 'ANALYST', display_name: 'Data Analyst', description: 'Read-only operational analytics' },
    ];
    roleList.forEach(r => this.roles.set(r.id, r));

    // 3. Map Initial Role Permissions
    this.rolePermissions.set('role-super-admin', new Set(permList.map(p => p.key)));
    this.rolePermissions.set('role-ops-mgr', new Set(['users.view', 'meters.view', 'meters.manage', 'transactions.view', 'transactions.reconcile', 'support.view', 'support.manage', 'staff.view']));
    this.rolePermissions.set('role-fin-mgr', new Set(['users.view', 'transactions.view', 'wallets.view', 'wallets.adjust', 'support.view', 'staff.view']));
    this.rolePermissions.set('role-support', new Set(['users.view', 'meters.view', 'transactions.view', 'wallets.view', 'support.view', 'support.manage']));
    this.rolePermissions.set('role-analyst', new Set(['users.view', 'meters.view', 'transactions.view', 'wallets.view', 'audit_logs.view']));

    // 4. Seed Profiles
    const users = [
      { id: 'usr-admin-1', full_name: 'Primary SuperAdmin', email: 'superadmin1@paypawa.ng', account_type: 'STAFF' },
      { id: 'usr-admin-2', full_name: 'Secondary SuperAdmin', email: 'superadmin2@paypawa.ng', account_type: 'STAFF' },
      { id: 'usr-support-1', full_name: 'Sam Support', email: 'sam.support@paypawa.ng', account_type: 'STAFF' },
      { id: 'usr-ops-1', full_name: 'Olivia Ops', email: 'olivia.ops@paypawa.ng', account_type: 'STAFF' },
    ];
    users.forEach(u => this.profiles.set(u.id, u));

    // 5. Seed Staff Members
    const staff = [
      { id: 'staff-admin-1', user_id: 'usr-admin-1', role_id: 'role-super-admin', status: 'ACTIVE', created_at: '2026-08-01T10:00:00Z', last_login_at: '2026-08-25T14:00:00Z' },
      { id: 'staff-admin-2', user_id: 'usr-admin-2', role_id: 'role-super-admin', status: 'ACTIVE', created_at: '2026-08-01T10:00:00Z', last_login_at: '2026-08-26T15:00:00Z' },
      { id: 'staff-support-1', user_id: 'usr-support-1', role_id: 'role-support', status: 'ACTIVE', created_at: '2026-08-05T12:00:00Z', last_login_at: '2026-08-28T09:00:00Z' },
      { id: 'staff-ops-1', user_id: 'usr-ops-1', role_id: 'role-ops-mgr', status: 'ACTIVE', created_at: '2026-08-10T08:00:00Z', last_login_at: '2026-08-29T11:00:00Z' },
    ];
    staff.forEach(s => this.staffMembers.set(s.id, s));
  }

  hasPermission(userId, perm) {
    const staff = Array.from(this.staffMembers.values()).find(s => s.user_id === userId);
    if (!staff || staff.status !== 'ACTIVE') return false;
    const perms = this.rolePermissions.get(staff.role_id);
    if (!perms) return false;
    const roleObj = this.roles.get(staff.role_id);
    if (roleObj && roleObj.name === 'SUPER_ADMIN') return true;
    return perms.has(perm);
  }

  logAudit(actorUserId, action, targetType, targetId, metadata = {}) {
    const staff = Array.from(this.staffMembers.values()).find(s => s.user_id === actorUserId);
    this.auditLogs.push({
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      staff_id: staff?.id,
      actor_user_id: actorUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
      created_at: new Date().toISOString()
    });
  }

  // 1. Create Staff
  createStaff({ actorUserId, name, email, roleId, initialStatus = 'ACTIVE' }) {
    if (!this.hasPermission(actorUserId, 'staff.manage')) {
      return { success: false, error: 'UNAUTHORIZED: Lacks staff.manage permission' };
    }

    if (!name || !email || !roleId) {
      return { success: false, error: 'MISSING_REQUIRED_FIELDS' };
    }

    const role = this.roles.get(roleId);
    if (!role) {
      return { success: false, error: 'ROLE_NOT_FOUND' };
    }

    const userId = `usr-gen-${Date.now()}`;
    this.profiles.set(userId, { id: userId, full_name: name, email, account_type: 'STAFF', created_at: new Date().toISOString() });

    const staffId = `staff-${Date.now()}`;
    const staffObj = {
      id: staffId,
      user_id: userId,
      role_id: roleId,
      status: initialStatus,
      created_at: new Date().toISOString(),
      last_login_at: null
    };
    this.staffMembers.set(staffId, staffObj);

    this.logAudit(actorUserId, 'STAFF_MEMBER_CREATED', 'STAFF_MEMBER', staffId, { name, email, role: role.name, status: initialStatus });

    return { success: true, staff_id: staffId, staff: staffObj };
  }

  // 2. Update Status with Self-Modification Protection
  updateStaffStatus({ actorUserId, staffId, status, reason = null }) {
    if (!this.hasPermission(actorUserId, 'staff.manage')) {
      return { success: false, error: 'UNAUTHORIZED: Lacks staff.manage permission' };
    }

    const targetStaff = this.staffMembers.get(staffId);
    if (!targetStaff) return { success: false, error: 'STAFF_NOT_FOUND' };

    // SELF-MODIFICATION PROTECTION
    if (targetStaff.user_id === actorUserId) {
      return { success: false, error: 'SELF_MODIFICATION_FORBIDDEN: You cannot modify your own staff status.' };
    }

    const prevStatus = targetStaff.status;
    targetStaff.status = status;

    this.logAudit(actorUserId, 'STAFF_STATUS_UPDATED', 'STAFF_MEMBER', staffId, {
      from_status: prevStatus,
      to_status: status,
      reason
    });

    return { success: true, staff_id: staffId, status };
  }

  // 3. Update Role with Self-Escalation Protection and Dual Control
  updateStaffRole({ actorUserId, staffId, newRoleId, reason = null }) {
    if (!this.hasPermission(actorUserId, 'staff.manage')) {
      return { success: false, error: 'UNAUTHORIZED: Lacks staff.manage permission' };
    }

    const targetStaff = this.staffMembers.get(staffId);
    if (!targetStaff) return { success: false, error: 'STAFF_NOT_FOUND' };

    const newRole = this.roles.get(newRoleId);
    if (!newRole) return { success: false, error: 'ROLE_NOT_FOUND' };

    // 1. SELF-ESCALATION PROTECTION
    if (targetStaff.user_id === actorUserId) {
      return {
        success: false,
        error: 'SELF_ESCALATION_FORBIDDEN: You cannot modify your own role or elevate your own privileges.'
      };
    }

    // 2. DUAL CONTROL FOR SUPER_ADMIN ELEVATION
    if (newRole.name === 'SUPER_ADMIN') {
      const approvalId = `appr-${Date.now()}`;
      const approvalReq = {
        id: approvalId,
        request_type: 'ROLE_ESCALATION_SUPER_ADMIN',
        target_type: 'STAFF_MEMBER',
        target_id: staffId,
        requested_by_user_id: actorUserId,
        payload: {
          target_staff_id: staffId,
          new_role_id: newRoleId,
          new_role_name: 'SUPER_ADMIN',
          reason
        },
        status: 'PENDING',
        created_at: new Date().toISOString()
      };
      this.governanceApprovals.set(approvalId, approvalReq);

      this.logAudit(actorUserId, 'GOVERNANCE_APPROVAL_REQUESTED', 'GOVERNANCE_REQUEST', approvalId, {
        request_type: 'ROLE_ESCALATION_SUPER_ADMIN',
        target_staff_id: staffId
      });

      return {
        success: true,
        requires_dual_control: true,
        approval_id: approvalId,
        message: 'Super Admin elevation requires Dual-Control (Four-Eyes) approval from a second administrator.'
      };
    }

    // Standard role update
    const prevRoleId = targetStaff.role_id;
    targetStaff.role_id = newRoleId;

    this.logAudit(actorUserId, 'STAFF_ROLE_UPDATED', 'STAFF_MEMBER', staffId, {
      from_role_id: prevRoleId,
      to_role_id: newRoleId,
      new_role_name: newRole.name,
      reason
    });

    return { success: true, requires_dual_control: false, staff_id: staffId, new_role: newRole.name };
  }

  // 4. Decide Governance Action (Dual Control / Four-Eyes Principle)
  decideGovernanceAction({ actorUserId, approvalId, decision, notes = null }) {
    if (!this.hasPermission(actorUserId, 'staff.manage')) {
      return { success: false, error: 'UNAUTHORIZED: Lacks staff.manage permission' };
    }

    const req = this.governanceApprovals.get(approvalId);
    if (!req) return { success: false, error: 'APPROVAL_NOT_FOUND' };
    if (req.status !== 'PENDING') return { success: false, error: 'REQUEST_ALREADY_DECIDED' };

    // FOUR-EYES PRINCIPLE: Requester cannot approve own governance request
    if (req.requested_by_user_id === actorUserId) {
      return {
        success: false,
        error: 'DUAL_CONTROL_VIOLATION: Requester cannot approve their own governance action. Second administrator required.'
      };
    }

    if (decision === 'APPROVE') {
      if (req.request_type === 'ROLE_ESCALATION_SUPER_ADMIN') {
        const targetStaff = this.staffMembers.get(req.payload.target_staff_id);
        if (targetStaff) {
          targetStaff.role_id = req.payload.new_role_id;
        }
      }
      req.status = 'APPROVED';
      req.approved_by_user_id = actorUserId;
      req.decision_notes = notes;
      req.decided_at = new Date().toISOString();

      this.logAudit(actorUserId, 'GOVERNANCE_ACTION_APPROVED', 'GOVERNANCE_REQUEST', approvalId, {
        request_type: req.request_type,
        notes
      });

      return { success: true, decision: 'APPROVED', approval_id: approvalId };
    } else {
      req.status = 'REJECTED';
      req.approved_by_user_id = actorUserId;
      req.decision_notes = notes;
      req.decided_at = new Date().toISOString();

      this.logAudit(actorUserId, 'GOVERNANCE_ACTION_REJECTED', 'GOVERNANCE_REQUEST', approvalId, {
        request_type: req.request_type,
        notes
      });

      return { success: true, decision: 'REJECTED', approval_id: approvalId };
    }
  }

  // 5. Update Role Permissions
  updateRolePermissions({ actorUserId, roleId, permissionKeys }) {
    if (!this.hasPermission(actorUserId, 'staff.manage')) {
      return { success: false, error: 'UNAUTHORIZED: Lacks staff.manage permission' };
    }

    const role = this.roles.get(roleId);
    if (!role) return { success: false, error: 'ROLE_NOT_FOUND' };

    if (role.name === 'SUPER_ADMIN') {
      return { success: false, error: 'SUPER_ADMIN_PERMISSIONS_IMMUTABLE' };
    }

    this.rolePermissions.set(roleId, new Set(permissionKeys));

    this.logAudit(actorUserId, 'ROLE_PERMISSIONS_UPDATED', 'ROLE', roleId, {
      role_name: role.name,
      permission_count: permissionKeys.length,
      permission_keys: permissionKeys
    });

    return { success: true, role_id: roleId, updated_permission_keys: permissionKeys };
  }

  // 6. Direct Unauthorized Call Simulation
  attemptUnauthorizedAction(actorUserId, requiredPerm) {
    if (!this.hasPermission(actorUserId, requiredPerm)) {
      return { success: false, error: `FORBIDDEN: Caller lacks ${requiredPerm} permission.` };
    }
    return { success: true, message: 'Action permitted' };
  }
}

// RUN TEST SUITE
async function runTests() {
  console.log('============================================================');
  console.log('🚀 PAYPAWA — PHASE 10E STAFF & GOVERNANCE TEST SUITE');
  console.log('============================================================\n');

  const engine = new MockStaffGovernanceEngine();
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

  const superAdmin1 = 'usr-admin-1';
  const superAdmin2 = 'usr-admin-2';
  const supportUser = 'usr-support-1';
  const opsUser = 'usr-ops-1';

  // TEST 1: STAFF DIRECTORY & CREATION
  console.log('1. Staff Creation & Authorization');
  const resCreate1 = engine.createStaff({
    actorUserId: superAdmin1,
    name: 'Tariq Finance',
    email: 'tariq.fin@paypawa.ng',
    roleId: 'role-fin-mgr',
    initialStatus: 'ACTIVE'
  });
  assert(resCreate1.success === true, 'Super Admin can create staff account');
  assert(resCreate1.staff.status === 'ACTIVE', 'Initial status set to ACTIVE');

  // Attempt staff creation by Customer Support (Privilege Escalation)
  const resCreateSupport = engine.createStaff({
    actorUserId: supportUser,
    name: 'Hacker Agent',
    email: 'hacker@paypawa.ng',
    roleId: 'role-super-admin',
    initialStatus: 'ACTIVE'
  });
  assert(resCreateSupport.success === false, 'Non-admin prevented from creating staff accounts');

  // TEST 2: STAFF STATUS TRANSITIONS & PRIVILEGED ACCESS REVOCATION
  console.log('\n2. Staff Status Lifecycle (ACTIVE -> SUSPENDED -> DISABLED)');
  const targetStaffId = resCreate1.staff_id;

  // Suspend staff
  const resSuspend = engine.updateStaffStatus({
    actorUserId: superAdmin1,
    staffId: targetStaffId,
    status: 'SUSPENDED',
    reason: 'Security audit underway'
  });
  assert(resSuspend.success === true && resSuspend.status === 'SUSPENDED', 'Staff status updated to SUSPENDED');

  // Attempt privileged action as suspended staff
  const suspendedUserId = resCreate1.staff.user_id;
  const resSuspendedAction = engine.attemptUnauthorizedAction(suspendedUserId, 'wallets.adjust');
  assert(resSuspendedAction.success === false, 'Suspended staff immediately loses privileged access');

  // Disable staff
  const resDisable = engine.updateStaffStatus({
    actorUserId: superAdmin1,
    staffId: targetStaffId,
    status: 'DISABLED',
    reason: 'Employee offboarded'
  });
  assert(resDisable.success === true && resDisable.status === 'DISABLED', 'Staff status updated to DISABLED');

  // Attempt privileged action as disabled staff
  const resDisabledAction = engine.attemptUnauthorizedAction(suspendedUserId, 'transactions.view');
  assert(resDisabledAction.success === false, 'Disabled staff blocked from all privileged RPCs');

  // TEST 3: SELF-MODIFICATION & SELF-STATUS PROTECTION
  console.log('\n3. Self-Modification Protection (Prevent Self-Unbanning / Self-Editing)');
  const resSelfStatus = engine.updateStaffStatus({
    actorUserId: superAdmin1,
    staffId: 'staff-admin-1', // SuperAdmin1 trying to modify their own status
    status: 'SUSPENDED'
  });
  assert(resSelfStatus.success === false && resSelfStatus.error.includes('SELF_MODIFICATION_FORBIDDEN'), 'Staff blocked from modifying their own account status');

  // TEST 4: SELF-ESCALATION PROTECTION
  console.log('\n4. Self-Escalation Protection (Prevent Self-Role & Privilege Elevation)');
  // Support agent trying to make themselves Super Admin
  const resSelfEscalate = engine.updateStaffRole({
    actorUserId: supportUser,
    staffId: 'staff-support-1',
    newRoleId: 'role-super-admin'
  });
  assert(resSelfEscalate.success === false, 'Self-role escalation strictly forbidden');

  // Super Admin trying to modify their own role
  const resAdminSelfRole = engine.updateStaffRole({
    actorUserId: superAdmin1,
    staffId: 'staff-admin-1',
    newRoleId: 'role-ops-mgr'
  });
  assert(resAdminSelfRole.success === false && resAdminSelfRole.error.includes('SELF_ESCALATION_FORBIDDEN'), 'Super Admin blocked from modifying own role');

  // TEST 5: DUAL CONTROL / FOUR-EYES PRINCIPLE
  console.log('\n5. Dual-Control Governance (Super Admin Elevation Requires 2nd Admin)');
  // Admin 1 requests promoting Olivia Ops to Super Admin
  const resElevateOps = engine.updateStaffRole({
    actorUserId: superAdmin1,
    staffId: 'staff-ops-1',
    newRoleId: 'role-super-admin',
    reason: 'Promotion to Operations Director'
  });
  assert(resElevateOps.success === true, 'Promotion request processed');
  assert(resElevateOps.requires_dual_control === true, 'Super Admin elevation triggers Dual-Control requirement');
  assert(Boolean(resElevateOps.approval_id), 'Governance approval request ID generated');

  const approvalId = resElevateOps.approval_id;

  // Admin 1 attempts to approve their own request (Self-Approval Violation)
  const resSelfApprove = engine.decideGovernanceAction({
    actorUserId: superAdmin1,
    approvalId,
    decision: 'APPROVE',
    notes: 'Self-approval attempt'
  });
  assert(resSelfApprove.success === false && resSelfApprove.error.includes('DUAL_CONTROL_VIOLATION'), 'Requester blocked from self-approving governance action (Four-Eyes Principle enforced)');

  // Admin 2 (Second independent administrator) approves request
  const resSecondAdminApprove = engine.decideGovernanceAction({
    actorUserId: superAdmin2,
    approvalId,
    decision: 'APPROVE',
    notes: 'Verified organizational approval for promotion.'
  });
  assert(resSecondAdminApprove.success === true && resSecondAdminApprove.decision === 'APPROVED', 'Second administrator successfully verifies and approves Super Admin elevation');

  // Verify Olivia Ops is now Super Admin
  const updatedOpsStaff = engine.staffMembers.get('staff-ops-1');
  assert(updatedOpsStaff.role_id === 'role-super-admin', 'Role promotion executed following dual-control sign-off');

  // TEST 6: MODULAR PERMISSION MANAGEMENT
  console.log('\n6. Modular Role & Permission Configuration');
  // Update Customer Support permissions to add audit_logs.view
  const resPermUpdate = engine.updateRolePermissions({
    actorUserId: superAdmin1,
    roleId: 'role-support',
    permissionKeys: ['users.view', 'meters.view', 'transactions.view', 'wallets.view', 'support.view', 'support.manage', 'audit_logs.view']
  });
  assert(resPermUpdate.success === true, 'Support role permissions updated');
  assert(engine.hasPermission(supportUser, 'audit_logs.view'), 'Support agent now possesses granted audit_logs.view permission');

  // Attempt to strip Super Admin permissions (Immutable)
  const resStripSuperAdmin = engine.updateRolePermissions({
    actorUserId: superAdmin1,
    roleId: 'role-super-admin',
    permissionKeys: ['users.view']
  });
  assert(resStripSuperAdmin.success === false && resStripSuperAdmin.error === 'SUPER_ADMIN_PERMISSIONS_IMMUTABLE', 'Super Admin permission set is immutable');

  // TEST 7: DIRECT UNAUTHORIZED API CALL PROTECTION
  console.log('\n7. Direct API / Security Barrier Enforcement');
  assert(engine.attemptUnauthorizedAction(supportUser, 'wallets.adjust').success === false, 'Support agent blocked from wallets.adjust');
  assert(engine.attemptUnauthorizedAction(supportUser, 'settings.manage').success === false, 'Support agent blocked from settings.manage');
  assert(engine.attemptUnauthorizedAction(supportUser, 'staff.manage').success === false, 'Support agent blocked from staff.manage');

  // TEST 8: SANITIZED STAFF ACTIVITY AUDIT LOGGING
  console.log('\n8. Sanitized Staff Activity Audit Logging');
  assert(engine.auditLogs.length >= 6, `Captured ${engine.auditLogs.length} immutable governance audit log records`);
  const anyLeakedSecret = engine.auditLogs.some(log => JSON.stringify(log.metadata).includes('password') || JSON.stringify(log.metadata).includes('secret'));
  assert(anyLeakedSecret === false, 'Audit trails strictly sanitized with zero secret or password leakage');

  // FINAL RESULTS
  console.log('\n============================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
