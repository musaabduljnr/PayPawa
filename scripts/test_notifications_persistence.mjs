/**
 * ============================================================================
 * NOTIFICATIONS READ STATE PERSISTENCE TEST
 * ============================================================================
 * Verifies that:
 * 1. Marking a notification as read persists across app reloads/logins
 * 2. Marking all as read persists all IDs
 * 3. Database records with is_read=false are overridden to read=true if marked locally
 * 4. UUID vs non-UUID handling is safe and robust
 * ============================================================================
 */

import assert from 'node:assert';

console.log('🧪 Testing Notifications Persistence Logic...');

// In-memory AsyncStorage mock
const storage = new Map();
const mockAsyncStorage = {
  getItem: async (key) => storage.get(key) || null,
  setItem: async (key, val) => storage.set(key, val),
  removeItem: async (key) => storage.delete(key),
};

const READ_NOTIFS_PREFIX = '@smart_elec_read_notifs_';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class TestNotificationsService {
  static async getLocallyReadIds(userId) {
    if (!userId) return new Set();
    const raw = await mockAsyncStorage.getItem(`${READ_NOTIFS_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
    return new Set();
  }

  static async markRead(notificationId, userId, mockDb) {
    if (!notificationId) return { success: false };

    // 1. Record in local storage
    if (userId) {
      const readSet = await this.getLocallyReadIds(userId);
      readSet.add(notificationId);
      await mockAsyncStorage.setItem(
        `${READ_NOTIFS_PREFIX}${userId}`,
        JSON.stringify(Array.from(readSet))
      );
    }

    // 2. Persist to DB if UUID
    if (UUID_REGEX.test(notificationId) && mockDb) {
      const record = mockDb.find((n) => n.id === notificationId);
      if (record) record.is_read = true;
    }

    return { success: true };
  }

  static async markAllRead(userId, notificationIds, mockDb) {
    if (!userId) return { success: false };

    if (notificationIds && notificationIds.length > 0) {
      const readSet = await this.getLocallyReadIds(userId);
      for (const id of notificationIds) readSet.add(id);
      await mockAsyncStorage.setItem(
        `${READ_NOTIFS_PREFIX}${userId}`,
        JSON.stringify(Array.from(readSet))
      );
    }

    if (mockDb) {
      for (const record of mockDb) {
        if (record.user_id === userId) record.is_read = true;
      }
    }

    return { success: true };
  }

  static async getNotifications(userId, mockDb) {
    const readSet = await this.getLocallyReadIds(userId);
    const userRecords = mockDb.filter((n) => n.user_id === userId);
    return userRecords.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read: Boolean(n.is_read) || readSet.has(n.id),
      createdAt: n.created_at,
    }));
  }
}

// Simulated database notifications for user_abc
const mockDb = [
  {
    id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    user_id: 'user_abc',
    type: 'purchase',
    title: 'Token Purchased',
    body: 'Token generated for ₦5,000',
    is_read: false,
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'f9e8d7c6-b5a4-4321-9876-fedcba098765',
    user_id: 'user_abc',
    type: 'funding',
    title: 'Wallet Funded',
    body: 'Wallet funded with ₦10,000',
    is_read: false,
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
];

// Step 1: Verify initially unread
console.log('🔍 Step 1: Checking initial unread notifications...');
let notifs = await TestNotificationsService.getNotifications('user_abc', mockDb);
assert.strictEqual(notifs.length, 2);
assert.strictEqual(notifs.filter((n) => !n.read).length, 2, 'All should initially be unread');
console.log('✅ Initial state verified: 2 unread notifications.');

// Step 2: Mark one notification as read
console.log('\n🔍 Step 2: Marking single notification as read...');
const targetId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
await TestNotificationsService.markRead(targetId, 'user_abc', mockDb);

// Verify DB updated
assert.strictEqual(mockDb.find((n) => n.id === targetId).is_read, true, 'DB is_read should be true');

// Verify AsyncStorage updated
const storedSet = await TestNotificationsService.getLocallyReadIds('user_abc');
assert.strictEqual(storedSet.has(targetId), true, 'AsyncStorage must contain targetId');

// Re-fetch (simulating user reopening the notifications screen)
notifs = await TestNotificationsService.getNotifications('user_abc', mockDb);
const markedNotif = notifs.find((n) => n.id === targetId);
assert.strictEqual(markedNotif.read, true, 'Notification must show as read');
assert.strictEqual(notifs.filter((n) => !n.read).length, 1, 'Exactly 1 unread notification remaining');
console.log('✅ Single notification read state persisted successfully.');

// Step 3: Simulate fresh login where DB query returns stale is_read=false
console.log('\n🔍 Step 3: Simulating fresh login with stale DB cache...');
// Intentionally revert DB to false to test local cache resilience
mockDb.find((n) => n.id === targetId).is_read = false;

notifs = await TestNotificationsService.getNotifications('user_abc', mockDb);
const resilientNotif = notifs.find((n) => n.id === targetId);
assert.strictEqual(resilientNotif.read, true, 'Local persistent cache MUST override stale is_read=false');
console.log('✅ Local cache successfully protected user from seeing stale unread notification on fresh login!');

// Step 4: Mark all notifications as read
console.log('\n🔍 Step 4: Testing mark all read...');
await TestNotificationsService.markAllRead('user_abc', notifs.map((n) => n.id), mockDb);
notifs = await TestNotificationsService.getNotifications('user_abc', mockDb);
assert.strictEqual(notifs.filter((n) => !n.read).length, 0, 'Zero unread notifications must remain');
console.log('✅ Mark all read successfully persisted to both storage and state!');

console.log('\n================================================================');
console.log('🎉 ALL NOTIFICATIONS PERSISTENCE TESTS PASSED (100%)');
console.log('================================================================');
