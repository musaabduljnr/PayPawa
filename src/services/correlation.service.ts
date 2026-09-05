/**
 * ============================================================================
 * PAYPAWA: REQUEST CORRELATION SERVICE
 * ============================================================================
 * Generates and threads non-sensitive correlation identifiers across:
 * User Action -> Mobile Service -> SquadCo -> Supabase DB -> Ledger -> Notification
 */

export class CorrelationService {
  private static currentCorrelationId: string | null = null;

  /**
   * Generates a collision-resistant safe correlation ID format: REQ-YYYYMMDD-XXXXXXXX
   */
  static generateId(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let rand = '';
    for (let i = 0; i < 8; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `REQ-${dateStr}-${rand}`;
  }

  /**
   * Sets the active ambient correlation ID for the current async operation context.
   */
  static setActiveId(id: string) {
    this.currentCorrelationId = id;
  }

  /**
   * Gets the active correlation ID or generates a fresh one if none is active.
   */
  static getActiveId(): string {
    if (!this.currentCorrelationId) {
      this.currentCorrelationId = this.generateId();
    }
    return this.currentCorrelationId;
  }

  /**
   * Clears the active correlation ID context.
   */
  static clear() {
    this.currentCorrelationId = null;
  }
}
