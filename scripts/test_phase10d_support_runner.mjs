/**
 * ==============================================================================
 * PAYPAWA — PHASE 10D CUSTOMER SUPPORT & CASE MANAGEMENT TEST RUNNER
 * ==============================================================================
 * Tests:
 * 1. Support Case Creation (All categories, priorities, fields & case numbers)
 * 2. Case Status Lifecycle (OPEN -> IN_PROGRESS -> WAITING -> RESOLVED -> CLOSED)
 * 3. Case Staff Assignment & Reassignment Tracking
 * 4. Internal Staff Notes vs Customer-Visible Information Distinction
 * 5. Live Customer Context Integration (Meters, Transactions, Wallets, Payments)
 * 6. Tiered Escalation Routing (Support -> Operations, Finance, Manager)
 * 7. Security & RBAC Boundary Enforcement (No unauthorized financial mutations)
 * ==============================================================================
 */

class MockSupportOperationsEngine {
  constructor() {
    this.profiles = new Map();
    this.staffMembers = new Map();
    this.staffRoles = new Map();
    this.rolePermissions = new Map();
    this.meters = new Map();
    this.transactions = new Map();
    this.wallets = new Map();
    this.walletLedgers = [];
    this.paymentAttempts = new Map();
    this.cases = new Map();
    this.caseNotes = [];
    this.auditLogs = [];
  }

  seedData() {
    // 1. Roles & Permissions
    this.rolePermissions.set('SUPER_ADMIN', new Set(['*']));
    this.rolePermissions.set('OPERATIONS_MANAGER', new Set([
      'users.view', 'meters.view', 'meters.manage', 'transactions.view',
      'transactions.reconcile', 'transactions.retry', 'support.view', 'support.manage', 'reports.view'
    ]));
    this.rolePermissions.set('FINANCE_MANAGER', new Set([
      'users.view', 'transactions.view', 'payments.view', 'payments.reconcile',
      'wallets.view', 'wallets.adjust', 'support.view', 'support.manage', 'reports.view'
    ]));
    this.rolePermissions.set('CUSTOMER_SUPPORT', new Set([
      'users.view', 'meters.view', 'transactions.view', 'wallets.view',
      'support.view', 'support.manage'
    ]));

    // 2. Profiles (Customers & Staff)
    const users = [
      { id: 'usr-cust-1', full_name: 'Musa Abubakar', email: 'musa@example.com', phone: '+2348011112222', account_type: 'INDIVIDUAL', is_onboarded: true, created_at: '2026-08-01T10:00:00Z' },
      { id: 'usr-cust-2', full_name: 'Fatima Garba', email: 'fatima@example.com', phone: '+2348033334444', account_type: 'BUSINESS', is_onboarded: true, created_at: '2026-08-05T12:00:00Z' },
      { id: 'usr-staff-1', full_name: 'Sarah Support', email: 'sarah.support@paypawa.ng', account_type: 'STAFF' },
      { id: 'usr-staff-2', full_name: 'Olu Operations', email: 'olu.ops@paypawa.ng', account_type: 'STAFF' },
      { id: 'usr-staff-3', full_name: 'Farouk Finance', email: 'farouk.fin@paypawa.ng', account_type: 'STAFF' },
      { id: 'usr-staff-4', full_name: 'Grace Manager', email: 'grace.mgr@paypawa.ng', account_type: 'STAFF' },
    ];
    users.forEach(u => this.profiles.set(u.id, u));

    // 3. Staff Members
    const staff = [
      { id: 'sm-1', user_id: 'usr-staff-1', role: 'CUSTOMER_SUPPORT', role_display_name: 'Customer Support Agent', status: 'ACTIVE' },
      { id: 'sm-2', user_id: 'usr-staff-2', role: 'OPERATIONS_MANAGER', role_display_name: 'Operations Manager', status: 'ACTIVE' },
      { id: 'sm-3', user_id: 'usr-staff-3', role: 'FINANCE_MANAGER', role_display_name: 'Finance Manager', status: 'ACTIVE' },
      { id: 'sm-4', user_id: 'usr-staff-4', role: 'SUPER_ADMIN', role_display_name: 'Platform Manager', status: 'ACTIVE' },
    ];
    staff.forEach(s => this.staffMembers.set(s.id, s));

    // 4. Meters
    const metersList = [
      { id: 'mtr-1', user_id: 'usr-cust-1', meter_number: '45028392101', disco_code: 'AEDC', disco_name: 'Abuja Electricity', meter_type: 'prepaid', customer_name: 'Musa Abubakar', address: '12 Gana Street, Maitama', is_primary: true, created_at: '2026-08-02T10:00:00Z' },
      { id: 'mtr-2', user_id: 'usr-cust-1', meter_number: '45028392102', disco_code: 'EKEDC', disco_name: 'Eko Electricity', meter_type: 'postpaid', customer_name: 'Musa Abubakar', address: 'Plot 4 Victoria Island', is_primary: false, created_at: '2026-08-03T10:00:00Z' },
    ];
    metersList.forEach(m => this.meters.set(m.id, m));

    // 5. Electricity Transactions
    const txList = [
      { id: 'tx-1', user_id: 'usr-cust-1', meter_number: '45028392101', disco_code: 'AEDC', disco_name: 'Abuja Electricity', amount_kobo: 500000, units_kwh: 75.4, token: '4829-1029-3849-1029-4829', status: 'successful', reference: 'PP-20260802-001', created_at: '2026-08-02T10:30:00Z' },
      { id: 'tx-2', user_id: 'usr-cust-1', meter_number: '45028392101', disco_code: 'AEDC', disco_name: 'Abuja Electricity', amount_kobo: 1000000, units_kwh: 150.8, status: 'processing', reference: 'PP-20260820-002', created_at: '2026-08-20T11:00:00Z' },
    ];
    txList.forEach(t => this.transactions.set(t.id, t));

    // 6. Wallets & Ledgers
    this.wallets.set('usr-cust-1', { id: 'wal-1', user_id: 'usr-cust-1', balance_kobo: 2500000, currency: 'NGN', is_locked: false });
    this.walletLedgers.push(
      { id: 'led-1', wallet_id: 'wal-1', type: 'funding_credit', amount_kobo: 3000000, balance_after_kobo: 3000000, reference: 'PAY-1001', description: 'Monnify Direct Funding', created_at: '2026-08-01T10:00:00Z' },
      { id: 'led-2', wallet_id: 'wal-1', type: 'vending_debit', amount_kobo: 500000, balance_after_kobo: 2500000, reference: 'PP-20260802-001', description: 'AEDC Token Purchase', created_at: '2026-08-02T10:30:00Z' }
    );

    // 7. Payment Attempts
    this.paymentAttempts.set('PAY-1001', {
      id: 'pa-1',
      user_id: 'usr-cust-1',
      amount_kobo: 3000000,
      provider: 'monnify',
      status: 'successful',
      reference: 'PAY-1001',
      created_at: '2026-08-01T09:55:00Z',
      verified_at: '2026-08-01T10:00:00Z'
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

  // 1. Create Support Case
  createCase({ actorUserId, customerId, category, priority = 'MEDIUM', subject, description, assignedStaffId = null }) {
    if (!this.hasPermission(actorUserId, 'support.manage')) {
      return { success: false, error: 'UNAUTHORIZED: Lacks support.manage permission' };
    }

    const validCategories = ['WALLET', 'PAYMENT', 'ELECTRICITY_PURCHASE', 'METER', 'ACCOUNT', 'TECHNICAL', 'OTHER'];
    if (!validCategories.includes(category)) {
      return { success: false, error: 'INVALID_CATEGORY' };
    }

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    if (!validPriorities.includes(priority)) {
      return { success: false, error: 'INVALID_PRIORITY' };
    }

    const caseId = `case-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const caseNumber = `CASE-202608-${Math.floor(1000 + Math.random() * 9000)}`;

    const newCase = {
      id: caseId,
      case_number: caseNumber,
      customer_id: customerId,
      category,
      priority,
      status: 'OPEN',
      assigned_staff_id: assignedStaffId,
      escalated_to_department: null,
      subject,
      description,
      resolution_notes: null,
      resolved_at: null,
      closed_at: null,
      created_by_user_id: actorUserId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.cases.set(caseId, newCase);

    if (assignedStaffId) {
      this.caseNotes.push({
        id: `note-${Date.now()}`,
        case_id: caseId,
        author_user_id: actorUserId,
        is_internal: true,
        note: 'Case created and assigned to staff upon opening.',
        created_at: new Date().toISOString()
      });
    }

    this.logAudit(actorUserId, 'SUPPORT_CASE_CREATED', 'SUPPORT_CASE', caseId, {
      case_number: caseNumber,
      customer_id: customerId,
      category,
      priority,
      assigned_staff_id: assignedStaffId
    });

    return { success: true, case_id: caseId, case_number: caseNumber, case: newCase };
  }

  // 2. Update Status
  updateCaseStatus({ actorUserId, caseId, status, resolutionNotes = null }) {
    if (!this.hasPermission(actorUserId, 'support.manage')) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    const validStatuses = ['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return { success: false, error: 'INVALID_STATUS' };
    }

    const existing = this.cases.get(caseId);
    if (!existing) return { success: false, error: 'CASE_NOT_FOUND' };

    const prevStatus = existing.status;
    existing.status = status;
    existing.updated_at = new Date().toISOString();

    if (status === 'RESOLVED' && !existing.resolved_at) {
      existing.resolved_at = new Date().toISOString();
      existing.resolution_notes = resolutionNotes;
    }
    if (status === 'CLOSED' && !existing.closed_at) {
      existing.closed_at = new Date().toISOString();
    }

    // Add status update note (customer-visible)
    this.caseNotes.push({
      id: `note-${Date.now()}`,
      case_id: caseId,
      author_user_id: actorUserId,
      is_internal: false,
      note: `Status updated from ${prevStatus} to ${status}${resolutionNotes ? `\nResolution: ${resolutionNotes}` : ''}`,
      created_at: new Date().toISOString()
    });

    this.logAudit(actorUserId, 'SUPPORT_CASE_STATUS_CHANGED', 'SUPPORT_CASE', caseId, {
      from_status: prevStatus,
      to_status: status,
      resolution_notes: resolutionNotes
    });

    return { success: true, case_id: caseId, status };
  }

  // 3. Assign Staff
  assignCase({ actorUserId, caseId, staffId, assignmentNote = null }) {
    if (!this.hasPermission(actorUserId, 'support.manage')) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    const existing = this.cases.get(caseId);
    if (!existing) return { success: false, error: 'CASE_NOT_FOUND' };

    let staffName = 'Unassigned';
    let staffRole = '';
    if (staffId) {
      const staffObj = this.staffMembers.get(staffId);
      if (!staffObj) return { success: false, error: 'STAFF_NOT_FOUND' };
      const prof = this.profiles.get(staffObj.user_id);
      staffName = prof ? prof.full_name : 'Staff Member';
      staffRole = staffObj.role_display_name;
    }

    existing.assigned_staff_id = staffId;
    existing.updated_at = new Date().toISOString();

    // Add internal assignment note
    this.caseNotes.push({
      id: `note-${Date.now()}`,
      case_id: caseId,
      author_user_id: actorUserId,
      is_internal: true,
      note: `Case assigned to ${staffName}${staffRole ? ` (${staffRole})` : ''}${assignmentNote ? `\nNote: ${assignmentNote}` : ''}`,
      created_at: new Date().toISOString()
    });

    this.logAudit(actorUserId, 'SUPPORT_CASE_ASSIGNED', 'SUPPORT_CASE', caseId, {
      assigned_staff_id: staffId,
      assigned_staff_name: staffName,
      note: assignmentNote
    });

    return { success: true, case_id: caseId, assigned_staff_id: staffId, assigned_staff_name: staffName };
  }

  // 4. Escalate Case
  escalateCase({ actorUserId, caseId, escalateTo, escalationReason }) {
    if (!this.hasPermission(actorUserId, 'support.manage')) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    const validDept = ['OPERATIONS', 'FINANCE', 'MANAGER'];
    if (!validDept.includes(escalateTo)) {
      return { success: false, error: 'INVALID_ESCALATION_DEPARTMENT' };
    }

    const existing = this.cases.get(caseId);
    if (!existing) return { success: false, error: 'CASE_NOT_FOUND' };

    existing.escalated_to_department = escalateTo;
    if (existing.status === 'OPEN') {
      existing.status = 'IN_PROGRESS';
    }
    existing.updated_at = new Date().toISOString();

    // Internal escalation note
    this.caseNotes.push({
      id: `note-${Date.now()}`,
      case_id: caseId,
      author_user_id: actorUserId,
      is_internal: true,
      note: `🚨 Escalated to ${escalateTo} department.\nReason: ${escalationReason}`,
      created_at: new Date().toISOString()
    });

    this.logAudit(actorUserId, 'SUPPORT_CASE_ESCALATED', 'SUPPORT_CASE', caseId, {
      escalated_to_department: escalateTo,
      reason: escalationReason
    });

    return { success: true, case_id: caseId, escalated_to_department: escalateTo };
  }

  // 5. Add Note (Internal vs Customer-Visible)
  addNote({ actorUserId, caseId, note, isInternal = true }) {
    if (!this.hasPermission(actorUserId, 'support.manage')) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    const existing = this.cases.get(caseId);
    if (!existing) return { success: false, error: 'CASE_NOT_FOUND' };

    const noteId = `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newNote = {
      id: noteId,
      case_id: caseId,
      author_user_id: actorUserId,
      is_internal: Boolean(isInternal),
      note,
      created_at: new Date().toISOString()
    };

    this.caseNotes.push(newNote);
    existing.updated_at = new Date().toISOString();

    this.logAudit(actorUserId, 'SUPPORT_CASE_NOTE_ADDED', 'SUPPORT_CASE', caseId, {
      note_id: noteId,
      is_internal: isInternal
    });

    return { success: true, note_id: noteId, is_internal: isInternal };
  }

  // 6. Get Case Details with Live Relational Context
  getCaseDetails({ actorUserId, caseId }) {
    if (!this.hasPermission(actorUserId, 'support.view')) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    const caseObj = this.cases.get(caseId);
    if (!caseObj) return { success: false, error: 'CASE_NOT_FOUND' };

    const customer = this.profiles.get(caseObj.customer_id);
    const meters = Array.from(this.meters.values()).filter(m => m.user_id === caseObj.customer_id);
    const transactions = Array.from(this.transactions.values()).filter(t => t.user_id === caseObj.customer_id);
    const wallet = this.wallets.get(caseObj.customer_id);
    const walletLedger = this.walletLedgers.filter(l => l.wallet_id === wallet?.id);
    const payments = Array.from(this.paymentAttempts.values()).filter(p => p.user_id === caseObj.customer_id);

    const notes = this.caseNotes.filter(n => n.case_id === caseId).map(n => {
      const authorProf = this.profiles.get(n.author_user_id);
      const staff = Array.from(this.staffMembers.values()).find(s => s.user_id === n.author_user_id);
      return {
        ...n,
        author_name: authorProf?.full_name,
        author_email: authorProf?.email,
        author_role: staff?.role_display_name
      };
    });

    return {
      success: true,
      case: caseObj,
      customer,
      meters,
      transactions,
      wallet: {
        ...wallet,
        recent_entries: walletLedger
      },
      payments,
      notes
    };
  }

  // Attempt Financial Mutation (Security Boundary Check)
  attemptFinancialAdjustment(actorUserId, walletId, amountKobo) {
    if (!this.hasPermission(actorUserId, 'wallets.adjust')) {
      return { success: false, error: 'FORBIDDEN: Customer Support cannot perform financial wallet adjustments.' };
    }
    return { success: true, message: 'Adjustment executed' };
  }
}

// RUN TEST SUITE
async function runTests() {
  console.log('============================================================');
  console.log('🚀 PAYPAWA — PHASE 10D SUPPORT & CASE MANAGEMENT TEST SUITE');
  console.log('============================================================\n');

  const engine = new MockSupportOperationsEngine();
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

  // TEST 1: SUPPORT CASE CREATION
  console.log('1. Support Case Creation & Field Validation');
  const supportStaffId = 'usr-staff-1';
  const customerId = 'usr-cust-1';

  const resCreate1 = engine.createCase({
    actorUserId: supportStaffId,
    customerId,
    category: 'ELECTRICITY_PURCHASE',
    priority: 'HIGH',
    subject: 'Token not received for AEDC prepaid meter 45028392101',
    description: 'Customer purchased ₦5,000 electricity token but SMS dispatch timed out.',
    assignedStaffId: 'sm-1'
  });

  assert(resCreate1.success === true, 'Case created successfully');
  assert(resCreate1.case_number.startsWith('CASE-'), 'Case has valid human-readable case number format');
  assert(resCreate1.case.category === 'ELECTRICITY_PURCHASE', 'Category matches ELECTRICITY_PURCHASE');
  assert(resCreate1.case.priority === 'HIGH', 'Priority matches HIGH');
  assert(resCreate1.case.status === 'OPEN', 'Initial status defaults to OPEN');
  assert(resCreate1.case.assigned_staff_id === 'sm-1', 'Initial assigned staff set correctly');

  // TEST 2: ALL SUPPORT CATEGORIES & PRIORITIES
  console.log('\n2. Support Categories & Priority Validation');
  const categories = ['WALLET', 'PAYMENT', 'ELECTRICITY_PURCHASE', 'METER', 'ACCOUNT', 'TECHNICAL', 'OTHER'];
  for (const cat of categories) {
    const res = engine.createCase({
      actorUserId: supportStaffId,
      customerId,
      category: cat,
      priority: 'MEDIUM',
      subject: `Inquiry for ${cat}`,
      description: `Testing category ${cat}`
    });
    assert(res.success === true && res.case.category === cat, `Category ${cat} accepted`);
  }

  const invalidCatRes = engine.createCase({
    actorUserId: supportStaffId,
    customerId,
    category: 'INVALID_CATEGORY_XYZ',
    priority: 'MEDIUM',
    subject: 'Invalid test',
    description: 'Testing invalid category rejection'
  });
  assert(invalidCatRes.success === false, 'Invalid category rejected');

  // TEST 3: CASE STATUS LIFECYCLE
  console.log('\n3. Case Status Transition Lifecycle (OPEN -> IN_PROGRESS -> WAITING -> RESOLVED -> CLOSED)');
  const caseId = resCreate1.case_id;

  const resProgress = engine.updateCaseStatus({ actorUserId: supportStaffId, caseId, status: 'IN_PROGRESS' });
  assert(resProgress.success === true && resProgress.status === 'IN_PROGRESS', 'Status transitioned to IN_PROGRESS');

  const resWaiting = engine.updateCaseStatus({ actorUserId: supportStaffId, caseId, status: 'WAITING' });
  assert(resWaiting.success === true && resWaiting.status === 'WAITING', 'Status transitioned to WAITING');

  const resResolved = engine.updateCaseStatus({
    actorUserId: supportStaffId,
    caseId,
    status: 'RESOLVED',
    resolutionNotes: 'Dispatched token manually to customer phone +2348011112222.'
  });
  assert(resResolved.success === true && resResolved.status === 'RESOLVED', 'Status transitioned to RESOLVED with resolution notes');

  const resClosed = engine.updateCaseStatus({ actorUserId: supportStaffId, caseId, status: 'CLOSED' });
  assert(resClosed.success === true && resClosed.status === 'CLOSED', 'Status transitioned to CLOSED');

  // TEST 4: STAFF ASSIGNMENT & REASSIGNMENT
  console.log('\n4. Staff Assignment & Reassignment');
  const resAssign1 = engine.assignCase({
    actorUserId: supportStaffId,
    caseId,
    staffId: 'sm-2',
    assignmentNote: 'Reassigned to Operations Manager for provider investigation.'
  });
  assert(resAssign1.success === true && resAssign1.assigned_staff_id === 'sm-2', 'Case assigned to Operations Manager');
  assert(resAssign1.assigned_staff_name === 'Olu Operations', 'Assigned staff name resolved');

  const resUnassign = engine.assignCase({
    actorUserId: supportStaffId,
    caseId,
    staffId: null
  });
  assert(resUnassign.success === true && resUnassign.assigned_staff_id === null, 'Case successfully unassigned back to queue');

  // TEST 5: INTERNAL STAFF NOTES VS CUSTOMER-VISIBLE INFORMATION
  console.log('\n5. Internal Staff Notes vs Customer-Visible Information');
  const resInternalNote = engine.addNote({
    actorUserId: supportStaffId,
    caseId,
    note: 'Internal note: DisCo switch AEDC is experiencing 2-minute API timeouts.',
    isInternal: true
  });
  assert(resInternalNote.success === true && resInternalNote.is_internal === true, 'Internal confidential staff note added');

  const resPublicNote = engine.addNote({
    actorUserId: supportStaffId,
    caseId,
    note: 'Dear Musa, your electricity purchase token has been generated: 4829-1029-3849-1029-4829.',
    isInternal: false
  });
  assert(resPublicNote.success === true && resPublicNote.is_internal === false, 'Customer-visible public note added');

  // TEST 6: LIVE NON-DUPLICATED CUSTOMER CONTEXT
  console.log('\n6. Live Non-Duplicated Customer Context Retrieval');
  const details = engine.getCaseDetails({ actorUserId: supportStaffId, caseId });
  assert(details.success === true, 'Case details fetched successfully');
  assert(details.customer.id === customerId, 'Live customer profile context linked');
  assert(details.meters.length === 2, 'Live meters list fetched (2 registered meters)');
  assert(details.transactions.length === 2, 'Live electricity transactions linked');
  assert(details.wallet.balance_kobo === 2500000, 'Authoritative live wallet balance fetched (₦25,000.00)');
  assert(details.wallet.recent_entries.length === 2, 'Double-entry wallet ledgers available');
  assert(details.payments.length === 1, 'Inbound gateway payment attempts linked');
  assert(details.notes.length >= 4, 'Case timeline contains internal notes, status notes, and public replies');

  // TEST 7: TIERED ESCALATION ROUTING
  console.log('\n7. Tiered Escalation Routing (Support -> Operations, Finance, Manager)');
  const resEscalateOps = engine.escalateCase({
    actorUserId: supportStaffId,
    caseId,
    escalateTo: 'OPERATIONS',
    escalationReason: 'Provider gateway returned 504 Gateway Timeout on vending switch.'
  });
  assert(resEscalateOps.success === true && resEscalateOps.escalated_to_department === 'OPERATIONS', 'Escalated to Operations department');

  const resEscalateFin = engine.escalateCase({
    actorUserId: supportStaffId,
    caseId,
    escalateTo: 'FINANCE',
    escalationReason: 'Payment debited at bank switch but funding ledger pending manual credit.'
  });
  assert(resEscalateFin.success === true && resEscalateFin.escalated_to_department === 'FINANCE', 'Escalated to Finance department');

  const resEscalateMgr = engine.escalateCase({
    actorUserId: supportStaffId,
    caseId,
    escalateTo: 'MANAGER',
    escalationReason: 'Customer requested executive review for dispute resolution.'
  });
  assert(resEscalateMgr.success === true && resEscalateMgr.escalated_to_department === 'MANAGER', 'Escalated to Manager');

  // TEST 8: SECURITY & RBAC BARRIERS
  console.log('\n8. Security & RBAC Boundary Enforcement');
  // A. Customer Support attempting unauthorized financial mutation (wallets.adjust)
  const resAdj = engine.attemptFinancialAdjustment(supportStaffId, 'wal-1', 100000);
  assert(resAdj.success === false && resAdj.error.includes('FORBIDDEN'), 'Customer Support blocked from financial wallet adjustments');

  // B. Customer Support attempting unauthorized settings/staff mutations
  assert(!engine.hasPermission(supportStaffId, 'settings.manage'), 'Customer Support lacks settings.manage permission');
  assert(!engine.hasPermission(supportStaffId, 'integrations.manage'), 'Customer Support lacks integrations.manage permission');
  assert(!engine.hasPermission(supportStaffId, 'staff.manage'), 'Customer Support lacks staff.manage permission');

  // C. Audit logs captured
  assert(engine.auditLogs.length >= 6, `Immutable audit trail recorded ${engine.auditLogs.length} support events`);

  // FINAL SUMMARY
  console.log('\n============================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
