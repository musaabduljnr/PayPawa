import { supabase } from './supabase';

export type ActivityFilterType = 'all' | 'funding' | 'purchase' | 'refund';

export interface ActivityItem {
  id: string;
  title: string;
  type: 'funding' | 'purchase' | 'refund' | 'adjustment';
  amountNaira: number;
  amountKobo: number;
  balanceAfterNaira?: number;
  dateFormatted: string;
  createdAt: string;
  status: 'Completed' | 'Pending' | 'Failed';
  reference: string;
  description: string;
  meterNumber?: string;
  discoName?: string;
  unitsKwh?: number;
  token?: string;
}

export class LedgerService {
  /**
   * Fetches unified, paginated, and filtered financial activity for a user.
   */
  static async getUnifiedActivity(
    userId: string,
    filter: ActivityFilterType = 'all',
    limit: number = 20,
    offset: number = 0,
    client = supabase
  ): Promise<{ items: ActivityItem[]; totalCount: number; hasMore: boolean }> {
    // 1. Fetch wallet ledger transactions (authoritative movements)
    let ledgerQuery = client
      .from('wallet_transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filter === 'funding') {
      ledgerQuery = ledgerQuery.eq('type', 'funding');
    } else if (filter === 'purchase') {
      ledgerQuery = ledgerQuery.eq('type', 'purchase_debit');
    } else if (filter === 'refund') {
      ledgerQuery = ledgerQuery.eq('type', 'refund_credit');
    }

    ledgerQuery = ledgerQuery.range(offset, offset + limit - 1);

    const { data: ledgerRows, count, error } = await ledgerQuery;

    if (error || !ledgerRows) {
      return { items: [], totalCount: 0, hasMore: false };
    }

    // 2. Fetch associated electricity transactions to enrich token, units, and meter details
    const { data: userElecRows } = await client
      .from('electricity_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const elecTxMap = new Map<string, any>();
    const elecTxRefMap = new Map<string, any>();
    if (userElecRows && userElecRows.length > 0) {
      for (const row of userElecRows) {
        elecTxMap.set(row.id, row);
        if (row.reference) elecTxRefMap.set(row.reference, row);
        if (row.idempotency_key) elecTxRefMap.set(row.idempotency_key, row);
      }
    }

    // Collect all electricity transactions that were refunded/reversed
    const refundedElecTxIds = new Set<string>();
    for (const r of ledgerRows) {
      if (r.type === 'refund_credit' && r.related_electricity_tx_id) {
        refundedElecTxIds.add(r.related_electricity_tx_id);
      }
    }

    // 3. Map to unified ActivityItem format
    const items: ActivityItem[] = ledgerRows.map((row) => {
      const isFunding = row.type === 'funding';
      const isRefund = row.type === 'refund_credit';
      const isPurchase = row.type === 'purchase_debit';

      const elecTx =
        (row.related_electricity_tx_id ? elecTxMap.get(row.related_electricity_tx_id) : undefined) ||
        (row.reference ? elecTxRefMap.get(row.reference) : undefined) ||
        (userElecRows && userElecRows.find((e: any) => Math.abs(Number(e.amount_kobo)) === Math.abs(Number(row.amount_kobo))));

      const isReversedOrFailed =
        (elecTx && (elecTx.status === 'reversed' || elecTx.status === 'failed')) ||
        Boolean(row.related_electricity_tx_id && refundedElecTxIds.has(row.related_electricity_tx_id));

      let title = 'Transaction';
      let type: ActivityItem['type'] = 'adjustment';
      if (isFunding) {
        title = 'Wallet Top-Up';
        type = 'funding';
      } else if (isPurchase) {
        title = isReversedOrFailed
          ? `${elecTx?.disco_code ? elecTx.disco_code.toUpperCase() + ' ' : ''}Token (Failed)`
          : (elecTx?.disco_code ? `${elecTx.disco_code.toUpperCase()} Token` : 'Electricity Token');
        type = 'purchase';
      } else if (isRefund) {
        title = 'Wallet Refund';
        type = 'refund';
      }

      const dateObj = new Date(row.created_at);
      const isToday = dateObj.toDateString() === new Date().toDateString();
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateFormatted = isToday
        ? `Today, ${timeStr}`
        : dateObj.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      const amountNaira = Math.abs(Number(row.amount_kobo)) / 100;
      const estimatedUnits = Math.round((amountNaira / 206.8) * 10) / 10;
      // CRITICAL: NEVER assign units to failed or reversed purchases
      const unitsKwh = isReversedOrFailed
        ? undefined
        : elecTx?.units_kwh
        ? Number(elecTx.units_kwh)
        : (isPurchase ? estimatedUnits : undefined);

      const status: ActivityItem['status'] = isReversedOrFailed ? 'Failed' : 'Completed';

      return {
        id: row.id,
        title,
        type,
        amountNaira,
        amountKobo: Number(row.amount_kobo),
        balanceAfterNaira: Number(row.balance_after_kobo) / 100,
        dateFormatted,
        createdAt: row.created_at,
        status,
        reference: row.reference,
        description: isReversedOrFailed
          ? (elecTx?.failure_message || row.description || 'Transaction refunded')
          : (row.description || ''),
        meterNumber: elecTx?.meter_number,
        discoName: elecTx?.disco_code?.toUpperCase(),
        unitsKwh,
        token: isReversedOrFailed ? undefined : elecTx?.token || undefined,
      };
    });

    // 4. Extract failed electricity transactions that did not generate a wallet ledger row
    const failedElecItems: ActivityItem[] = [];
    if (userElecRows && userElecRows.length > 0 && filter !== 'funding' && filter !== 'refund') {
      const recordedElecIds = new Set(ledgerRows.map((r) => r.related_electricity_tx_id).filter(Boolean));
      const failedElec = userElecRows.filter(
        (e) => (e.status as string) !== 'successful' && !recordedElecIds.has(e.id)
      );

      for (const row of failedElec) {
        const dateObj = new Date(row.created_at);
        const isToday = dateObj.toDateString() === new Date().toDateString();
        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateFormatted = isToday
          ? `Today, ${timeStr}`
          : dateObj.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        failedElecItems.push({
          id: row.id,
          title: row.disco_code ? `${row.disco_code.toUpperCase()} Token (Failed)` : 'Electricity Token (Failed)',
          type: 'purchase',
          amountNaira: Math.abs(Number(row.amount_kobo)) / 100,
          amountKobo: Number(row.amount_kobo),
          dateFormatted,
          createdAt: row.created_at,
          status: 'Failed',
          reference: row.reference || `REF-${row.id.slice(0, 8)}`,
          description: row.failure_message || row.error_message || 'Transaction could not be completed by provider',
          meterNumber: row.meter_number,
          discoName: row.disco_code?.toUpperCase(),
          unitsKwh: undefined,
        });
      }
    }

    const mergedItems = [...items, ...failedElecItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const totalCount = count ? count + failedElecItems.length : mergedItems.length;
    const hasMore = offset + mergedItems.length < totalCount;

    return { items: mergedItems, totalCount, hasMore };
  }
}
