import { assertPaise, assertParticipantLedger, assertSignedPaise } from '@/domain/finance';
import { supabase } from '@/services/supabase';
import { FINANCE_CATEGORIES } from '@/types/finance';
import type {
  FinanceArchiveResult,
  FinanceExpense,
  FinanceExpenseCursor,
  FinanceExpenseDraft,
  FinanceExpenseFilters,
  FinanceExpensePage,
  FinanceExpenseParticipant,
  FinanceExpenseStatus,
  FinanceGroup,
  FinanceGroupBalances,
  FinanceGroupMember,
  FinanceId,
  FinanceInvitation,
  FinanceInvitationDecision,
  FinanceInvitationStatus,
  FinanceInviteCandidate,
  FinanceMemberRemoval,
  FinanceMemberRole,
  FinanceMemberStatus,
  FinanceSettlement,
  FinanceSettlementDraft,
  FinanceSettlementStatus,
  IsoDate,
  IsoTimestamp,
} from '@/types/finance';

type RpcError = { code?: string; message: string; details?: string; hint?: string };
type RpcResult = { data: unknown; error: RpcError | null };
type FinanceRpcClient = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const categories = new Set<string>(FINANCE_CATEGORIES);

export class FinanceRepositoryError extends Error {
  readonly operation?: string;
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
  readonly retryable: boolean;

  constructor(message: string, options: { operation?: string; code?: string; details?: string; hint?: string; retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = 'FinanceRepositoryError';
    this.operation = options.operation;
    this.code = options.code;
    this.details = options.details;
    this.hint = options.hint;
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) (this as Error & { cause?: unknown }).cause = options.cause;
  }
}

export interface FinanceErrorDetails {
  message: string;
  operation?: string;
  code?: string;
  details?: string;
  hint?: string;
  retryable: boolean;
}

export function getFinanceErrorDetails(cause: unknown, fallback = 'The finance request failed.'): FinanceErrorDetails {
  if (cause instanceof FinanceRepositoryError) {
    return {
      message: cause.message,
      operation: cause.operation,
      code: cause.code,
      details: cause.details,
      hint: cause.hint,
      retryable: cause.retryable,
    };
  }
  return { message: cause instanceof Error ? cause.message : fallback, retryable: false };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw contractError(`${label} must be an array.`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.length) throw contractError(`${label} must be a non-empty string.`);
  return value;
}

function integerText(value: unknown, label: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw contractError(`${label} must be a decimal string or safe integer.`);
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return string(value, label);
}

function id(value: unknown, label: string): FinanceId {
  const result = string(value, label);
  if (!UUID.test(result)) throw contractError(`${label} must be a UUID.`);
  return result;
}

function date(value: unknown, label: string): IsoDate {
  const result = string(value, label);
  if (!DATE.test(result) || Number.isNaN(new Date(`${result}T00:00:00Z`).valueOf())) throw contractError(`${label} must be an ISO date.`);
  return result;
}

function timestamp(value: unknown, label: string): IsoTimestamp {
  const result = string(value, label);
  if (Number.isNaN(Date.parse(result))) throw contractError(`${label} must be an ISO timestamp.`);
  return result;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw contractError(`${label} must be a safe integer.`);
  return value;
}

function literal<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw contractError(`${label} is invalid.`);
  return value as T;
}

function contractError(message: string): FinanceRepositoryError {
  return new FinanceRepositoryError(`Invalid finance server response: ${message}`, { code: 'FINANCE_CONTRACT' });
}

function parseParticipant(value: unknown): FinanceExpenseParticipant {
  const row = record(value, 'participant');
  return {
    userId: id(row.userId, 'participant.userId'),
    amountPaidMinor: assertPaise(integerText(row.amountPaidMinor, 'participant.amountPaidMinor'), { allowZero: true }),
    amountOwedMinor: assertPaise(integerText(row.amountOwedMinor, 'participant.amountOwedMinor'), { allowZero: true }),
  };
}

function parseExpense(value: unknown): FinanceExpense {
  const candidate = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const expenseReference = typeof candidate?.id === 'string' ? candidate.id : 'unknown';
  try {
    const row = record(value, 'expense');
    const participants = array(row.participants, 'expense.participants').map(parseParticipant);
    const totalAmountMinor = assertPaise(integerText(row.totalAmountMinor, 'expense.totalAmountMinor'));
    assertParticipantLedger(totalAmountMinor, participants);
    return {
      id: id(row.id, 'expense.id'),
      logicalExpenseId: id(row.logicalExpenseId, 'expense.logicalExpenseId'),
      revision: integer(row.revision, 'expense.revision'),
      supersedesExpenseId: row.supersedesExpenseId === null ? null : id(row.supersedesExpenseId, 'expense.supersedesExpenseId'),
      groupId: row.groupId === null ? null : id(row.groupId, 'expense.groupId'),
      description: string(row.description, 'expense.description'),
      totalAmountMinor,
      currencyCode: literal(row.currencyCode, ['INR'], 'expense.currencyCode'),
      category: literal(row.category, FINANCE_CATEGORIES, 'expense.category'),
      customCategoryNote: nullableString(row.customCategoryNote, 'expense.customCategoryNote'),
      expenseDate: date(row.expenseDate, 'expense.expenseDate'),
      transactionTimestamp: row.transactionTimestamp == null ? null : timestamp(row.transactionTimestamp, 'expense.transactionTimestamp'),
      createdBy: id(row.createdBy, 'expense.createdBy'),
      createdAt: timestamp(row.createdAt, 'expense.createdAt'),
      status: literal<FinanceExpenseStatus>(row.status, ['active', 'archived', 'superseded'], 'expense.status'),
      participants,
    };
  } catch (cause) {
    if (cause instanceof FinanceRepositoryError && cause.code === 'FINANCE_CONTRACT') {
      throw new FinanceRepositoryError(`${cause.message} Expense: ${expenseReference}.`, {
        code: cause.code,
        retryable: false,
        cause,
      });
    }
    throw new FinanceRepositoryError(`Invalid finance server response: expense ${expenseReference} failed ledger validation.`, {
      code: 'FINANCE_CONTRACT',
      retryable: false,
      cause,
    });
  }
}

function parseGroup(value: unknown): FinanceGroup {
  const row = record(value, 'group');
  return {
    id: id(row.id, 'group.id'),
    name: string(row.name, 'group.name'),
    createdBy: id(row.createdBy, 'group.createdBy'),
    createdAt: timestamp(row.createdAt, 'group.createdAt'),
    ...(row.role === undefined ? {} : { role: literal<FinanceMemberRole>(row.role, ['owner', 'member'], 'group.role') }),
    ...(row.memberCount === undefined ? {} : { memberCount: integer(row.memberCount, 'group.memberCount') }),
  };
}

function parseInvitation(value: unknown): FinanceInvitation {
  const row = record(value, 'invitation');
  return {
    id: id(row.id, 'invitation.id'),
    ...(row.groupId === undefined ? {} : { groupId: id(row.groupId, 'invitation.groupId') }),
    ...(row.groupName === undefined ? {} : { groupName: string(row.groupName, 'invitation.groupName') }),
    ...(row.invitedBy === undefined ? {} : { invitedBy: id(row.invitedBy, 'invitation.invitedBy') }),
    ...(row.inviterUsername === undefined ? {} : { inviterUsername: nullableString(row.inviterUsername, 'invitation.inviterUsername') }),
    ...(row.createdAt === undefined ? {} : { createdAt: timestamp(row.createdAt, 'invitation.createdAt') }),
    ...(row.status === undefined ? {} : { status: literal<FinanceInvitationStatus>(row.status, ['pending', 'accepted', 'declined', 'cancelled'], 'invitation.status') }),
  };
}

function parseMember(value: unknown): FinanceGroupMember {
  const row = record(value, 'member');
  return {
    userId: id(row.userId, 'member.userId'),
    username: nullableString(row.username, 'member.username'),
    role: literal<FinanceMemberRole>(row.role, ['owner', 'member'], 'member.role'),
    status: literal<FinanceMemberStatus>(row.status, ['active', 'left'], 'member.status'),
    joinedAt: timestamp(row.joinedAt, 'member.joinedAt'),
    leftAt: row.leftAt === null ? null : timestamp(row.leftAt, 'member.leftAt'),
  };
}

function parseBalances(value: unknown): FinanceGroupBalances {
  const row = record(value, 'balances');
  const members = array(row.members, 'balances.members').map((entry) => {
    const member = record(entry, 'member balance');
    return { userId: id(member.userId, 'member balance.userId'), netAmountMinor: assertSignedPaise(string(member.netAmountMinor, 'member balance.netAmountMinor')) };
  });
  const repayments = array(row.repayments, 'balances.repayments').map((entry) => {
    const repayment = record(entry, 'repayment');
    return {
      payerId: id(repayment.payerId, 'repayment.payerId'),
      payeeId: id(repayment.payeeId, 'repayment.payeeId'),
      amountMinor: assertPaise(string(repayment.amountMinor, 'repayment.amountMinor')),
    };
  });
  if (members.reduce((sum, member) => sum + member.netAmountMinor, 0n) !== 0n) throw contractError('group member balances must sum to zero.');
  return {
    members,
    repayments,
    youOweMinor: assertPaise(string(row.youOweMinor, 'balances.youOweMinor'), { allowZero: true }),
    owedToYouMinor: assertPaise(string(row.owedToYouMinor, 'balances.owedToYouMinor'), { allowZero: true }),
    netAmountMinor: assertSignedPaise(string(row.netAmountMinor, 'balances.netAmountMinor')),
  };
}

function parseSettlement(value: unknown): FinanceSettlement {
  const row = record(value, 'settlement');
  return {
    id: id(row.id, 'settlement.id'),
    groupId: id(row.groupId, 'settlement.groupId'),
    payerId: id(row.payerId, 'settlement.payerId'),
    payeeId: id(row.payeeId, 'settlement.payeeId'),
    amountMinor: assertPaise(string(row.amountMinor, 'settlement.amountMinor')),
    currencyCode: literal(row.currencyCode, ['INR'], 'settlement.currencyCode'),
    settlementDate: date(row.settlementDate, 'settlement.settlementDate'),
    note: nullableString(row.note, 'settlement.note'),
    createdBy: id(row.createdBy, 'settlement.createdBy'),
    createdAt: timestamp(row.createdAt, 'settlement.createdAt'),
    status: literal<FinanceSettlementStatus>(row.status, ['active', 'reversed'], 'settlement.status'),
    reversedAt: row.reversedAt === null ? null : timestamp(row.reversedAt, 'settlement.reversedAt'),
    reversedBy: row.reversedBy === null ? null : id(row.reversedBy, 'settlement.reversedBy'),
    reversalReason: nullableString(row.reversalReason, 'settlement.reversalReason'),
  };
}

function serializeExpense(input: FinanceExpenseDraft): Record<string, unknown> {
  assertParticipantLedger(input.totalAmountMinor, input.participants);
  if (!UUID.test(input.idempotencyKey)) throw new FinanceRepositoryError('A valid expense idempotency key is required.', { code: 'FINANCE_INPUT' });
  if (!DATE.test(input.expenseDate)) throw new FinanceRepositoryError('A valid expense date is required.', { code: 'FINANCE_INPUT' });
  if (!categories.has(input.category)) throw new FinanceRepositoryError('A valid expense category is required.', { code: 'FINANCE_INPUT' });
  let transactionTimestamp: string | undefined;
  if (input.transactionTimestamp !== undefined) {
    const value = new Date(input.transactionTimestamp);
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(input.transactionTimestamp) || !Number.isFinite(value.getTime()) || value.getTime() > Date.now()) {
      throw new FinanceRepositoryError('Choose a valid date and time that is not in the future.', { code: 'FINANCE_INPUT' });
    }
    transactionTimestamp = value.toISOString();
  }
  return {
    idempotencyKey: input.idempotencyKey,
    groupId: input.groupId,
    description: input.description.trim(),
    totalAmountMinor: assertPaise(input.totalAmountMinor).toString(),
    category: input.category,
    customCategoryNote: input.customCategoryNote?.trim() || null,
    expenseDate: input.expenseDate,
    ...(transactionTimestamp === undefined ? {} : { transactionTimestamp }),
    participants: input.participants.map((participant) => ({
      userId: participant.userId,
      amountPaidMinor: assertPaise(participant.amountPaidMinor, { allowZero: true }).toString(),
      amountOwedMinor: assertPaise(participant.amountOwedMinor, { allowZero: true }).toString(),
    })),
  };
}

function mapRpcError(error: RpcError, operation: string): FinanceRepositoryError {
  const friendly = error.code === '42501' ? 'You do not have permission to perform this finance action.'
    : error.code === '23505' ? 'This request conflicts with an operation that was already submitted.'
      : error.code === '23514' || error.code === '22023' ? error.message
        : error.code === 'PGRST202' ? 'The finance database migration is not available on this server.'
          : error.message || 'The finance request failed.';
  return new FinanceRepositoryError(friendly, {
    operation,
    code: error.code,
    details: error.details,
    hint: error.hint,
    retryable: !error.code || error.code.startsWith('08') || error.code === 'PGRST000' || error.code === 'PGRST001',
    cause: error,
  });
}

export class FinanceRepository {
  constructor(private readonly client: FinanceRpcClient = supabase as unknown as FinanceRpcClient) {}

  private async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    let result: RpcResult;
    try {
      result = await this.client.rpc(name, args);
    } catch (cause) {
      throw new FinanceRepositoryError('Unable to reach the finance service.', { operation: name, code: 'FINANCE_NETWORK', retryable: true, cause });
    }
    if (result.error) throw mapRpcError(result.error, name);
    if (result.data === null || result.data === undefined) throw new FinanceRepositoryError(`Invalid finance server response: ${name} returned no data.`, { operation: name, code: 'FINANCE_CONTRACT' });
    return result.data;
  }

  private parse<T>(operation: string, value: unknown, parser: (response: unknown) => T): T {
    try {
      return parser(value);
    } catch (cause) {
      if (cause instanceof FinanceRepositoryError) {
        throw new FinanceRepositoryError(cause.message, {
          operation,
          code: cause.code,
          details: cause.details,
          hint: cause.hint,
          retryable: cause.retryable,
          cause,
        });
      }
      throw new FinanceRepositoryError(`Invalid finance server response from ${operation}.`, {
        operation,
        code: 'FINANCE_CONTRACT',
        retryable: false,
        cause,
      });
    }
  }

  async createGroup(name: string, idempotencyKey: FinanceId): Promise<FinanceGroup> {
    return parseGroup(await this.call('finance_create_group', { p_name: name.trim(), p_idempotency_key: idempotencyKey }));
  }

  async listGroups(): Promise<FinanceGroup[]> {
    return array(await this.call('finance_list_groups'), 'groups').map(parseGroup);
  }

  async archiveGroup(groupId: FinanceId, idempotencyKey: FinanceId): Promise<FinanceArchiveResult> {
    const row = record(await this.call('finance_archive_group', { p_group_id: groupId, p_idempotency_key: idempotencyKey }), 'group archive');
    if (row.archived !== true) throw contractError('group archive acknowledgement is invalid.');
    return { id: id(row.id, 'group archive.id'), archived: true };
  }

  async listInvitations(): Promise<FinanceInvitation[]> {
    return array(await this.call('finance_list_invitations'), 'invitations').map(parseInvitation);
  }

  async searchInviteCandidates(groupId: FinanceId, query: string, limit = 10): Promise<FinanceInviteCandidate[]> {
    return array(await this.call('finance_search_invite_candidates', { p_group_id: groupId, p_query: query.trim(), p_limit: limit }), 'invite candidates').map((entry) => {
      const row = record(entry, 'invite candidate');
      return {
        userId: id(row.user_id, 'invite candidate.user_id'),
        username: nullableString(row.username, 'invite candidate.username'),
        matchLabel: string(row.match_label, 'invite candidate.match_label'),
      };
    });
  }

  async inviteMember(groupId: FinanceId, userId: FinanceId, idempotencyKey: FinanceId): Promise<FinanceInvitation> {
    return parseInvitation(await this.call('finance_invite_member', { p_group_id: groupId, p_invited_user_id: userId, p_idempotency_key: idempotencyKey }));
  }

  async respondToInvitation(invitationId: FinanceId, accept: boolean, idempotencyKey: FinanceId): Promise<FinanceInvitationDecision> {
    const row = record(await this.call('finance_respond_to_invitation', { p_invitation_id: invitationId, p_accept: accept, p_idempotency_key: idempotencyKey }), 'invitation decision');
    return {
      invitationId: id(row.invitationId, 'invitation decision.invitationId'),
      status: literal(row.status, ['accepted', 'declined'], 'invitation decision.status'),
    };
  }

  async getGroupRoster(groupId: FinanceId): Promise<FinanceGroupMember[]> {
    return array(await this.call('finance_get_group_roster', { p_group_id: groupId }), 'group roster').map(parseMember);
  }

  async removeMember(groupId: FinanceId, userId: FinanceId, idempotencyKey: FinanceId): Promise<FinanceMemberRemoval> {
    const row = record(await this.call('finance_remove_member', { p_group_id: groupId, p_user_id: userId, p_idempotency_key: idempotencyKey }), 'member removal');
    if (row.status !== 'left') throw contractError('member removal status is invalid.');
    return { groupId: id(row.groupId, 'member removal.groupId'), userId: id(row.userId, 'member removal.userId'), status: 'left' };
  }

  async createExpense(input: FinanceExpenseDraft): Promise<FinanceExpense> {
    const operation = 'finance_create_expense';
    return this.parse(operation, await this.call(operation, { p_payload: serializeExpense(input) }), parseExpense);
  }

  async editExpense(expenseId: FinanceId, input: FinanceExpenseDraft): Promise<FinanceExpense> {
    const operation = 'finance_edit_expense';
    return this.parse(operation, await this.call(operation, { p_expense_id: expenseId, p_payload: serializeExpense(input) }), parseExpense);
  }

  async archiveExpense(expenseId: FinanceId, idempotencyKey: FinanceId): Promise<FinanceExpense> {
    const operation = 'finance_archive_expense';
    return this.parse(operation, await this.call(operation, { p_expense_id: expenseId, p_idempotency_key: idempotencyKey }), parseExpense);
  }

  async getExpense(expenseId: FinanceId): Promise<FinanceExpense> {
    const operation = 'finance_get_expense';
    return this.parse(operation, await this.call(operation, { p_expense_id: expenseId }), parseExpense);
  }

  async listExpenses(filters: FinanceExpenseFilters): Promise<FinanceExpensePage> {
    const cursor: FinanceExpenseCursor | null = filters.cursor ?? null;
    const operation = 'finance_list_expenses';
    const response = await this.call(operation, {
      p_scope: filters.scope,
      p_month_start: filters.monthStart,
      p_group_id: filters.groupId ?? null,
      p_search: filters.search?.trim() || null,
      p_cursor_date: cursor?.expenseDate ?? null,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_limit: filters.limit ?? 30,
    });
    return this.parse(operation, response, (value) => {
      const row = record(value, 'expense page');
      const next = row.nextCursor === null ? null : record(row.nextCursor, 'expense cursor');
      const entries = array(row.entries, 'expense entries').map((entry, index) => {
        try { return parseExpense(entry); }
        catch (cause) {
          if (cause instanceof FinanceRepositoryError) throw new FinanceRepositoryError(`${cause.message} Page entry: ${index}.`, { code: cause.code, cause });
          throw cause;
        }
      });
      return {
        entries,
        totalAmountMinor: assertPaise(integerText(row.totalAmountMinor, 'expense page.totalAmountMinor'), { allowZero: true }),
        nextCursor: next ? {
          expenseDate: date(next.expenseDate, 'expense cursor.expenseDate'),
          createdAt: timestamp(next.createdAt, 'expense cursor.createdAt'),
          id: id(next.id, 'expense cursor.id'),
        } : null,
      };
    });
  }

  async getGroupBalances(groupId: FinanceId): Promise<FinanceGroupBalances> {
    return parseBalances(await this.call('finance_get_group_balances', { p_group_id: groupId }));
  }

  async recordSettlement(input: FinanceSettlementDraft): Promise<FinanceSettlement> {
    return parseSettlement(await this.call('finance_record_settlement', {
      p_group_id: input.groupId,
      p_payee_id: input.payeeId,
      p_amount_minor: assertPaise(input.amountMinor).toString(),
      p_settlement_date: input.settlementDate,
      p_note: input.note?.trim() || null,
      p_idempotency_key: input.idempotencyKey,
    }));
  }

  async reverseSettlement(settlementId: FinanceId, reason: string, idempotencyKey: FinanceId): Promise<FinanceSettlement> {
    return parseSettlement(await this.call('finance_reverse_settlement', {
      p_settlement_id: settlementId,
      p_reason: reason.trim(),
      p_idempotency_key: idempotencyKey,
    }));
  }
}

export const financeRepository = new FinanceRepository();
