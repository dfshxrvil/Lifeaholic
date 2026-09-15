export type FinanceId = string;
export type IsoDate = string;
export type IsoTimestamp = string;
export type Paise = bigint;

export const FINANCE_CATEGORIES = [
  'Food',
  'Online shopping',
  'Investments',
  'Laundry',
  'Drinks',
  'Grocery',
  'Other',
] as const;
export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];
export type FinanceExpenseStatus = 'active' | 'archived' | 'superseded';
export type FinanceMemberRole = 'owner' | 'member';
export type FinanceMemberStatus = 'active' | 'left';
export type FinanceInvitationStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type FinanceSettlementStatus = 'active' | 'reversed';

export interface FinanceGroup {
  id: FinanceId;
  name: string;
  createdBy: FinanceId;
  createdAt: IsoTimestamp;
  role?: FinanceMemberRole;
  memberCount?: number;
}

export interface FinanceInvitation {
  id: FinanceId;
  groupId?: FinanceId;
  groupName?: string;
  invitedBy?: FinanceId;
  inviterUsername?: string | null;
  createdAt?: IsoTimestamp;
  status?: FinanceInvitationStatus;
}

export interface FinanceInviteCandidate {
  userId: FinanceId;
  username: string | null;
  matchLabel: string;
}

export interface FinanceGroupMember {
  userId: FinanceId;
  username: string | null;
  role: FinanceMemberRole;
  status: FinanceMemberStatus;
  joinedAt: IsoTimestamp;
  leftAt: IsoTimestamp | null;
}

export interface FinanceExpenseParticipant {
  userId: FinanceId;
  amountPaidMinor: Paise;
  amountOwedMinor: Paise;
}

export interface FinanceExpense {
  id: FinanceId;
  logicalExpenseId: FinanceId;
  revision: number;
  supersedesExpenseId: FinanceId | null;
  groupId: FinanceId | null;
  description: string;
  totalAmountMinor: Paise;
  currencyCode: 'INR';
  category: FinanceCategory;
  customCategoryNote: string | null;
  expenseDate: IsoDate;
  transactionTimestamp: IsoTimestamp | null;
  createdBy: FinanceId;
  createdAt: IsoTimestamp;
  status: FinanceExpenseStatus;
  participants: FinanceExpenseParticipant[];
}

export interface FinanceExpenseDraft {
  idempotencyKey: FinanceId;
  groupId: FinanceId | null;
  description: string;
  totalAmountMinor: Paise;
  category: FinanceCategory;
  customCategoryNote: string | null;
  expenseDate: IsoDate;
  transactionTimestamp?: IsoTimestamp;
  participants: FinanceExpenseParticipant[];
}

export interface FinanceExpenseCursor {
  expenseDate: IsoDate;
  createdAt: IsoTimestamp;
  id: FinanceId;
}

export interface FinanceExpensePage {
  entries: FinanceExpense[];
  totalAmountMinor: Paise;
  nextCursor: FinanceExpenseCursor | null;
}

export interface FinanceExpenseFilters {
  scope: 'personal' | 'group';
  monthStart: IsoDate;
  groupId?: FinanceId | null;
  search?: string | null;
  cursor?: FinanceExpenseCursor | null;
  limit?: number;
}

export interface FinanceMemberBalance {
  userId: FinanceId;
  netAmountMinor: Paise;
}

export interface FinanceRepayment {
  payerId: FinanceId;
  payeeId: FinanceId;
  amountMinor: Paise;
}

export interface FinanceGroupBalances {
  members: FinanceMemberBalance[];
  repayments: FinanceRepayment[];
  youOweMinor: Paise;
  owedToYouMinor: Paise;
  netAmountMinor: Paise;
}

export interface FinanceSettlement {
  id: FinanceId;
  groupId: FinanceId;
  payerId: FinanceId;
  payeeId: FinanceId;
  amountMinor: Paise;
  currencyCode: 'INR';
  settlementDate: IsoDate;
  note: string | null;
  createdBy: FinanceId;
  createdAt: IsoTimestamp;
  status: FinanceSettlementStatus;
  reversedAt: IsoTimestamp | null;
  reversedBy: FinanceId | null;
  reversalReason: string | null;
}

export interface FinanceSettlementDraft {
  groupId: FinanceId;
  payeeId: FinanceId;
  amountMinor: Paise;
  settlementDate: IsoDate;
  note?: string | null;
  idempotencyKey: FinanceId;
}

export interface FinanceInvitationDecision {
  invitationId: FinanceId;
  status: 'accepted' | 'declined';
}

export interface FinanceArchiveResult {
  id: FinanceId;
  archived: true;
}

export interface FinanceMemberRemoval {
  groupId: FinanceId;
  userId: FinanceId;
  status: 'left';
}
