import { assertPaise } from '@/domain/finance/money';
import type { FinanceExpenseParticipant, FinanceId, Paise } from '@/types/finance';

export class FinanceLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FinanceLedgerError';
  }
}

function uniqueIds(ids: readonly FinanceId[]): FinanceId[] {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new FinanceLedgerError('At least one participant is required.');
  if (unique.length !== ids.length) throw new FinanceLedgerError('A participant cannot appear more than once.');
  return unique;
}

export function allocateEqualShares(total: Paise, participantIds: readonly FinanceId[], primaryPayerId: FinanceId): Map<FinanceId, Paise> {
  const amount = assertPaise(total);
  const ids = uniqueIds(participantIds);
  if (!ids.includes(primaryPayerId)) throw new FinanceLedgerError('The primary payer must be a participant.');
  const count = BigInt(ids.length);
  const base = amount / count;
  let remainder = amount % count;
  const remainderOrder = [primaryPayerId, ...ids.filter((id) => id !== primaryPayerId).sort()];
  const result = new Map(ids.map((id) => [id, base]));
  for (const id of remainderOrder) {
    if (remainder === 0n) break;
    result.set(id, (result.get(id) ?? 0n) + 1n);
    remainder -= 1n;
  }
  return result;
}

export function buildSinglePayerParticipants(total: Paise, payerId: FinanceId, owedShares: ReadonlyMap<FinanceId, Paise>): FinanceExpenseParticipant[] {
  const amount = assertPaise(total);
  const participantIds = new Set([...owedShares.keys(), payerId]);
  const participants = [...participantIds].map((userId) => ({
    userId,
    amountPaidMinor: userId === payerId ? amount : 0n,
    amountOwedMinor: assertPaise(owedShares.get(userId) ?? 0n, { allowZero: true }),
  }));
  assertParticipantLedger(amount, participants);
  return participants;
}

export function assertParticipantLedger(total: Paise, participants: readonly FinanceExpenseParticipant[]): void {
  const amount = assertPaise(total);
  uniqueIds(participants.map((participant) => participant.userId));
  let paid = 0n;
  let owed = 0n;
  for (const participant of participants) {
    const participantPaid = assertPaise(participant.amountPaidMinor, { allowZero: true });
    const participantOwed = assertPaise(participant.amountOwedMinor, { allowZero: true });
    if (participantPaid === 0n && participantOwed === 0n) throw new FinanceLedgerError('Every participant must pay or owe a positive amount.');
    paid += participantPaid;
    owed += participantOwed;
  }
  if (paid !== amount) throw new FinanceLedgerError('Participant payments must equal the expense total.');
  if (owed !== amount) throw new FinanceLedgerError('Participant shares must equal the expense total.');
}
