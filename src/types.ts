export type JsonObject = Record<string, unknown>;
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SortField = "date" | "title" | "amount";
export type SortOrder = "asc" | "desc";
export type AccountType = "bank_account" | "credit_card";
export type DeleteScope = "THIS" | "THIS_AND_NEXT" | "ALL";
export type ProfileAccessType = "pf" | "pj" | "family" | "investments";
export type ExtraProfileAccessType = "pj" | "family" | "investments";
export type ProfileInviteRole = "editor" | "viewer";
export type Frequency =
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "BIMONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "YEARLY";
export type TransactionKind = "FIXED" | "RECURRENT" | "PARCELLED";

export interface TransactionFilters {
  [key: string]: unknown;
  account_type?: AccountType;
  account_ids?: string[];
  credit_card_ids?: string[];
  category_ids?: string[];
  subcategory_ids?: string[];
  date_start?: string;
  date_end?: string;
  is_paid?: boolean;
  is_expense?: boolean;
  value?: number;
  search?: string;
  order_by?: SortField;
  order?: SortOrder;
}

export interface TransactionPayload {
  title: string;
  description?: string;
  amount: number;
  date: string;
  is_expense: boolean;
  type?: TransactionKind;
  frequency?: Frequency;
  installments?: number;
  is_full_amount?: boolean;
  category_id?: string;
  subcategory_id?: string;
  account_id?: string;
  credit_card_id?: string;
  paid?: boolean;
}

export interface TransactionUpdatePayload {
  title?: string;
  description?: string;
  amount?: number;
  date?: string;
  is_expense?: boolean;
  category_id?: string;
  subcategory_id?: string;
  account_id?: string;
  credit_card_id?: string;
  paid?: boolean;
  edition_type?: DeleteScope;
  edition_date?: string;
}

export interface TransferPayload {
  amount: number;
  date: string;
  sent_account_id: string;
  received_account_id: string;
  paid?: boolean;
  title?: string;
  description?: string;
}

export interface AccountPayload {
  name: string;
  logo: string;
  balance?: number;
  include_total_balance?: boolean;
}

export interface CreditCardPayload {
  name: string;
  logo?: string;
  limit?: number;
  available_limit?: number;
  is_unlimited?: boolean;
  expiring_date?: string;
  closing_date?: string;
  account_id?: string;
}

export interface ProfileInvitePayload {
  email: string;
  role: ProfileInviteRole;
}

export interface ProfileAccessPayload {
  name: string;
  type: ExtraProfileAccessType;
  invites: ProfileInvitePayload[];
}

export interface ProfileAccessUpdatePayload {
  name?: string;
  type?: ExtraProfileAccessType;
  invites?: ProfileInvitePayload[];
}
