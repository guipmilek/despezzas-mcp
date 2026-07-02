import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DespezzasClient } from "./client.js";
import { config } from "./config.js";
import { currentMonthRange, formatDate } from "./dates.js";
import { errorResponse, jsonResponse, requireConfirmation } from "./response.js";
import type {
  AccountPayload,
  AccountType,
  CreditCardPayload,
  DeleteScope,
  ExtraProfileAccessType,
  Frequency,
  JsonObject,
  ProfileAccessPayload,
  ProfileAccessUpdatePayload,
  ProfileInvitePayload,
  SortField,
  SortOrder,
  TransactionFilters,
  TransactionKind,
  TransactionPayload,
  TransactionUpdatePayload,
  TransferPayload,
} from "./types.js";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const idSchema = z.string().min(1);
const idsSchema = z.array(idSchema).optional();
const amountCentsSchema = z.number().int().positive().describe("Amount in cents. Example: 12345 = R$123.45.");
const frequencySchema = z
  .enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"])
  .optional();
const transactionTypeSchema = z.enum(["unique", "recurring", "parcelled"]).optional();
const scopeSchema = z.enum(["THIS", "THIS_AND_NEXT", "ALL"]).default("THIS");
const rawJsonSchema: z.ZodType<JsonObject> = z.record(z.unknown());
const extraProfileTypeSchema = z.enum(["pj", "family", "investments"]);
const profileInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]).default("viewer"),
});
const profileInvitesSchema = z.array(profileInviteSchema).max(5).default([]);
const MAX_EXTRA_PROFILES = 3;
const transactionCreateInputSchema = {
  title: z.string().min(1),
  description: z.string().optional(),
  amount_cents: amountCentsSchema,
  date: dateSchema,
  kind: z.enum(["expense", "income"]).default("expense"),
  account_id: idSchema.optional(),
  credit_card_id: idSchema.optional(),
  category_id: idSchema.optional(),
  subcategory_id: idSchema.optional(),
  paid: z.boolean().default(true),
  transaction_type: transactionTypeSchema.default("unique"),
  frequency: frequencySchema,
  installments: z.number().int().min(1).optional(),
  amount_mode: z.enum(["per_installment", "total"]).default("per_installment"),
  allow_uncategorized: z
    .boolean()
    .default(false)
    .describe("Set true only when you intentionally want to create a transaction without a category_id."),
};
const transactionUpdateInputSchema = {
  id: idSchema,
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  amount_cents: z.number().int().positive().optional(),
  date: dateSchema.optional(),
  kind: z.enum(["expense", "income"]).optional(),
  account_id: idSchema.optional(),
  credit_card_id: idSchema.optional(),
  category_id: idSchema.optional(),
  subcategory_id: idSchema.optional(),
  paid: z.boolean().optional(),
  scope: scopeSchema.optional().describe("Edition scope for recurring/installment transactions."),
  edition_date: dateSchema.optional().describe("The occurrence date to edit. Defaults to date if provided."),
};

interface ProfileSummary {
  id: string | null;
  name?: string;
  type?: string;
  role?: string | null;
  is_active: boolean;
}

interface ProfileContext {
  active_profile: ProfileSummary & { is_personal_profile: boolean };
  available_profiles: ProfileSummary[];
  owner_profile_count: number;
  member_profile_count: number;
  hint: string;
}

type ProfileContextResult = ProfileContext | { error: string };

export function registerTools(server: McpServer, client = new DespezzasClient()) {
  server.registerTool(
    "despezzas_status",
    {
      title: "Despezzas MCP Status",
      description: "Check whether the MCP server is configured with a Despezzas token.",
      inputSchema: {},
    },
    async () => {
      const status = await client.authStatus();
      const configured = status.hasManualToken || status.hasEnvCredentials || status.hasSession;
      const profile_context = configured ? await safeProfileContext(client) : undefined;
      return jsonResponse({
        configured,
        auth: status,
        profile_context,
        login_url: loginUrl(),
        note: configured
          ? "Despezzas authentication is available."
          : "Authentication is missing. Configure DESPEZZAS_TOKEN, DESPEZZAS_EMAIL/DESPEZZAS_PASSWORD, or run HTTP mode and open /login.",
      });
    },
  );

  server.registerTool(
    "despezzas_profile",
    {
      title: "Get Despezzas Profile",
      description: "Fetch the authenticated Despezzas profile. Sensitive fields are redacted.",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResponse(await client.getProfile());
      } catch (error) {
        return errorResponse(error, "get profile");
      }
    },
  );

  server.registerTool(
    "despezzas_list_profiles",
    {
      title: "List Despezzas Profiles",
      description:
        "List owner and member Despezzas profiles. Use this before switching profile context or managing shared profiles.",
      inputSchema: {},
    },
    async () => {
      try {
        const [access, profile] = await Promise.all([client.listProfileAccess(), client.getProfile()]);
        return jsonResponse({
          profile_context: profileContextFrom(profile, access),
          ...withProfileLimits(access),
        });
      } catch (error) {
        return errorResponse(error, "list profiles");
      }
    },
  );

  server.registerTool(
    "despezzas_switch_profile",
    {
      title: "Switch Active Profile",
      description:
        "Write operation. Switch the active Despezzas profile for future account/card/transaction calls. Requires confirm: true.",
      inputSchema: {
        profile_id: z
          .string()
          .min(1)
          .nullable()
          .describe("Profile ID from despezzas_list_profiles. Use null for the personal/root profile."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ profile_id, confirm }) => {
      const refusal = requireConfirmation(confirm, "switch the active profile");
      if (refusal) return refusal;

      try {
        const result = await client.changeProfile(profile_id);
        return jsonResponse({
          switched: true,
          active_profile_id: profile_id,
          result,
          note: "Future Despezzas API calls in this session should use this active profile context.",
        });
      } catch (error) {
        return errorResponse(error, "switch active profile");
      }
    },
  );

  server.registerTool(
    "despezzas_create_profile",
    {
      title: "Create Shared Profile",
      description:
        "Write operation. Create one of the three extra Despezzas profiles (PJ, family, or investments). Requires confirm: true.",
      inputSchema: {
        name: z.string().min(1).max(60),
        type: extraProfileTypeSchema.describe("Despezzas extra profile type. Only one of each type is normally allowed."),
        invites: profileInvitesSchema.describe("Optional invite list. Roles are editor or viewer."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ name, type, invites, confirm }) => {
      const refusal = requireConfirmation(confirm, "create a shared profile");
      if (refusal) return refusal;

      try {
        const access = await client.listProfileAccess();
        const guard = validateCreateProfile(access, type);
        if (guard) return guard;

        const payload: ProfileAccessPayload = {
          name: name.trim(),
          type,
          invites: normalizeInvites(invites),
        };
        return jsonResponse(await client.createAccessProfile(payload));
      } catch (error) {
        return errorResponse(error, "create shared profile");
      }
    },
  );

  server.registerTool(
    "despezzas_update_profile_access",
    {
      title: "Update Shared Profile",
      description:
        "Write operation. Update a shared profile. If invites is provided, it is sent as the replacement invite/member list. Requires confirm: true.",
      inputSchema: {
        id: idSchema.describe("Shared profile ID from despezzas_list_profiles."),
        name: z.string().min(1).max(60).optional(),
        type: extraProfileTypeSchema.optional(),
        invites: z.array(profileInviteSchema).max(5).optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, name, type, invites, confirm }) => {
      const refusal = requireConfirmation(confirm, "update a shared profile");
      if (refusal) return refusal;

      const payload: ProfileAccessUpdatePayload = dropUndefined({
        name: name?.trim(),
        type,
        invites: invites ? normalizeInvites(invites) : undefined,
      });

      if (Object.keys(payload).length === 0) {
        return errorResponse(new Error("Provide at least one of name, type, or invites."), "update shared profile");
      }

      try {
        return jsonResponse(await client.updateAccessProfile(id, payload));
      } catch (error) {
        return errorResponse(error, "update shared profile");
      }
    },
  );

  server.registerTool(
    "despezzas_delete_profile",
    {
      title: "Delete Shared Profile",
      description: "Destructive write operation. Delete a shared profile you own. Requires confirm: true.",
      inputSchema: {
        id: idSchema.describe("Shared profile ID from despezzas_list_profiles."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, confirm }) => {
      const refusal = requireConfirmation(confirm, "delete a shared profile");
      if (refusal) return refusal;

      try {
        await client.deleteAccessProfile(id);
        return jsonResponse({ deleted: true, id });
      } catch (error) {
        return errorResponse(error, "delete shared profile");
      }
    },
  );

  server.registerTool(
    "despezzas_leave_profile",
    {
      title: "Leave Shared Profile",
      description: "Write operation. Leave a shared profile where you are a member. Requires confirm: true.",
      inputSchema: {
        profile_id: idSchema.describe("Member profile ID from despezzas_list_profiles."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ profile_id, confirm }) => {
      const refusal = requireConfirmation(confirm, "leave a shared profile");
      if (refusal) return refusal;

      try {
        return jsonResponse(await client.leaveAccessProfile(profile_id));
      } catch (error) {
        return errorResponse(error, "leave shared profile");
      }
    },
  );

  server.registerTool(
    "despezzas_personal_config",
    {
      title: "Get Personal Config",
      description: "Fetch finance visibility preferences such as whether transfers, bills, or investments are included.",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResponse(await client.getPersonalConfig());
      } catch (error) {
        return errorResponse(error, "get personal config");
      }
    },
  );

  server.registerTool(
    "despezzas_list_accounts",
    {
      title: "List Accounts",
      description: "List Despezzas bank/cash accounts. Use this first to discover account IDs for transaction filters.",
      inputSchema: {},
    },
    async () => {
      try {
        const [accounts, profile_context] = await Promise.all([client.getAccounts(), safeProfileContext(client)]);
        return jsonResponse(withProfileAwareCollection("accounts", accounts, profile_context));
      } catch (error) {
        return errorResponse(error, "list accounts");
      }
    },
  );

  server.registerTool(
    "despezzas_list_banks",
    {
      title: "List Account Logos/Banks",
      description: "List bank/logo options used when creating manual Despezzas accounts.",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResponse(await client.getBanks());
      } catch (error) {
        return errorResponse(error, "list banks");
      }
    },
  );

  server.registerTool(
    "despezzas_create_account",
    {
      title: "Create Manual Account",
      description: "Write operation. Create a manual account in Despezzas. Requires confirm: true.",
      inputSchema: {
        name: z.string().min(1),
        logo: z.string().min(1).describe("Logo URL or Despezzas bank logo value from despezzas_list_banks."),
        initial_balance_cents: z.number().int().optional(),
        include_total_balance: z.boolean().default(true),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ name, logo, initial_balance_cents, include_total_balance, confirm }) => {
      const refusal = requireConfirmation(confirm, "create an account");
      if (refusal) return refusal;

      try {
        const payload: AccountPayload = {
          name,
          logo,
          balance: initial_balance_cents,
          include_total_balance,
        };
        return jsonResponse(await client.createAccount(payload));
      } catch (error) {
        return errorResponse(error, "create account");
      }
    },
  );

  server.registerTool(
    "despezzas_update_account",
    {
      title: "Update Account",
      description: "Write operation. Update a manual Despezzas account. Requires confirm: true.",
      inputSchema: {
        id: idSchema.describe("Account ID from despezzas_list_accounts."),
        name: z.string().min(1).optional(),
        logo: z.string().min(1).optional(),
        balance_cents: z.number().int().optional(),
        include_total_balance: z.boolean().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, balance_cents, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "update an account");
      if (refusal) return refusal;

      try {
        const payload: Partial<AccountPayload> = { ...rest, balance: balance_cents };
        return jsonResponse(await client.updateAccount(id, dropUndefined(payload)));
      } catch (error) {
        return errorResponse(error, "update account");
      }
    },
  );

  server.registerTool(
    "despezzas_delete_account",
    {
      title: "Delete Account",
      description: "Destructive write operation. Delete a Despezzas account. Requires confirm: true.",
      inputSchema: {
        id: idSchema.describe("Account ID from despezzas_list_accounts."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, confirm }) => {
      const refusal = requireConfirmation(confirm, "delete an account");
      if (refusal) return refusal;

      try {
        await client.deleteAccount(id);
        return jsonResponse({ deleted: true, id });
      } catch (error) {
        return errorResponse(error, "delete account");
      }
    },
  );

  server.registerTool(
    "despezzas_list_credit_cards",
    {
      title: "List Credit Cards",
      description: "List Despezzas credit cards. Use this to discover card IDs for transaction filters.",
      inputSchema: {},
    },
    async () => {
      try {
        const [credit_cards, profile_context] = await Promise.all([client.getCreditCards(), safeProfileContext(client)]);
        return jsonResponse(withProfileAwareCollection("credit_cards", credit_cards, profile_context));
      } catch (error) {
        return errorResponse(error, "list credit cards");
      }
    },
  );

  server.registerTool(
    "despezzas_create_credit_card",
    {
      title: "Create Credit Card",
      description: "Write operation. Create a manual Despezzas credit card. Requires confirm: true.",
      inputSchema: {
        name: z.string().min(1),
        logo: z.string().optional(),
        limit_cents: z.number().int().optional(),
        available_limit_cents: z.number().int().optional(),
        is_unlimited: z.boolean().optional(),
        expiring_date: z.string().optional().describe("Due day/month field as Despezzas expects, usually a day string."),
        closing_date: z.string().optional().describe("Closing day string."),
        account_id: idSchema.optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ limit_cents, available_limit_cents, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "create a credit card");
      if (refusal) return refusal;

      try {
        const payload: CreditCardPayload = {
          ...rest,
          limit: limit_cents,
          available_limit: available_limit_cents,
        };
        return jsonResponse(await client.createCreditCard(dropUndefined(payload)));
      } catch (error) {
        return errorResponse(error, "create credit card");
      }
    },
  );

  server.registerTool(
    "despezzas_update_credit_card",
    {
      title: "Update Credit Card",
      description: "Write operation. Update a manual Despezzas credit card. Requires confirm: true.",
      inputSchema: {
        id: idSchema.describe("Credit card ID from despezzas_list_credit_cards."),
        name: z.string().min(1).optional(),
        logo: z.string().optional(),
        limit_cents: z.number().int().optional(),
        available_limit_cents: z.number().int().optional(),
        is_unlimited: z.boolean().optional(),
        expiring_date: z.string().optional(),
        closing_date: z.string().optional(),
        account_id: idSchema.optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, limit_cents, available_limit_cents, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "update a credit card");
      if (refusal) return refusal;

      try {
        const payload: Partial<CreditCardPayload> = {
          ...rest,
          limit: limit_cents,
          available_limit: available_limit_cents,
        };
        return jsonResponse(await client.updateCreditCard(id, dropUndefined(payload)));
      } catch (error) {
        return errorResponse(error, "update credit card");
      }
    },
  );

  server.registerTool(
    "despezzas_delete_credit_card",
    {
      title: "Delete Credit Card",
      description: "Destructive write operation. Delete a Despezzas credit card. Requires confirm: true.",
      inputSchema: {
        id: idSchema.describe("Credit card ID from despezzas_list_credit_cards."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, confirm }) => {
      const refusal = requireConfirmation(confirm, "delete a credit card");
      if (refusal) return refusal;

      try {
        await client.deleteCreditCard(id);
        return jsonResponse({ deleted: true, id });
      } catch (error) {
        return errorResponse(error, "delete credit card");
      }
    },
  );

  server.registerTool(
    "despezzas_list_categories",
    {
      title: "List Categories",
      description: "List default and optionally user-created Despezzas categories.",
      inputSchema: {
        include_user: z.boolean().default(true),
      },
    },
    async ({ include_user }) => {
      try {
        return jsonResponse(await client.getCategories(include_user));
      } catch (error) {
        return errorResponse(error, "list categories");
      }
    },
  );

  server.registerTool(
    "despezzas_list_subcategories",
    {
      title: "List Subcategories",
      description: "List default and optionally user-created Despezzas subcategories. Use category_id in the result to pair them with categories.",
      inputSchema: {
        include_user: z.boolean().default(true),
      },
    },
    async ({ include_user }) => {
      try {
        return jsonResponse(await client.getSubcategories(include_user));
      } catch (error) {
        return errorResponse(error, "list subcategories");
      }
    },
  );

  server.registerTool(
    "despezzas_search_transactions",
    {
      title: "Search Transactions",
      description:
        "List Despezzas transactions with filters. Defaults to the current month and bank-account cash-flow view. Amounts are returned in cents.",
      inputSchema: {
        date_start: dateSchema.optional(),
        date_end: dateSchema.optional(),
        account_type: z.enum(["bank_account", "credit_card"]).optional(),
        account_ids: idsSchema.describe("Account IDs from despezzas_list_accounts."),
        credit_card_ids: idsSchema.describe("Credit card IDs from despezzas_list_credit_cards."),
        category_ids: idsSchema.describe("Category IDs from despezzas_list_categories."),
        subcategory_ids: idsSchema.describe("Subcategory IDs from despezzas_list_subcategories."),
        is_paid: z.boolean().optional(),
        is_expense: z.boolean().optional(),
        min_amount_cents: z.number().int().positive().optional(),
        search: z.string().optional(),
        order_by: z.enum(["date", "title", "amount"]).default("date"),
        order: z.enum(["asc", "desc"]).default("desc"),
        limit: z.number().int().min(1).max(500).default(100),
        include_raw: z.boolean().default(false).describe("Return full Despezzas transaction objects instead of compact rows."),
      },
    },
    async (args) => {
      try {
        const range = currentMonthRange();
        const filters = toTransactionFilters({
          ...args,
          date_start: args.date_start ?? range.date_start,
          date_end: args.date_end ?? range.date_end,
          account_type: args.account_type ?? "bank_account",
        });
        const [transactions, profile_context] = await Promise.all([
          client.getTransactions(filters),
          safeProfileContext(client),
        ]);
        const returnedTransactions = transactions.slice(0, args.limit);
        return jsonResponse({
          profile_context,
          filters,
          count: transactions.length,
          returned: returnedTransactions.length,
          has_more: transactions.length > args.limit,
          diagnostics: transactionSearchDiagnostics(transactions, returnedTransactions, args.limit, filters),
          transactions: args.include_raw ? returnedTransactions : compactTransactions(returnedTransactions),
          warning: emptyProfileWarning("transactions", transactions.length, profile_context),
        });
      } catch (error) {
        return errorResponse(error, "search transactions");
      }
    },
  );

  server.registerTool(
    "despezzas_transaction_overview",
    {
      title: "Transaction Overview",
      description: "Get Despezzas overview totals and account balances for a date. Amounts are in cents.",
      inputSchema: {
        date: dateSchema.default(formatDate(new Date())),
      },
    },
    async ({ date }) => {
      try {
        return jsonResponse(await client.getOverview(date));
      } catch (error) {
        return errorResponse(error, "get transaction overview");
      }
    },
  );

  server.registerTool(
    "despezzas_finance_summary",
    {
      title: "Finance Summary",
      description:
        "Summarize revenue, expenses, paid/unpaid totals, and top categories for a date range. Defaults to the current month.",
      inputSchema: {
        date_start: dateSchema.optional(),
        date_end: dateSchema.optional(),
        account_type: z.enum(["bank_account", "credit_card"]).optional(),
        include_transactions: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(50),
      },
    },
    async (args) => {
      try {
        const range = currentMonthRange();
        const filters = toTransactionFilters({
          date_start: args.date_start ?? range.date_start,
          date_end: args.date_end ?? range.date_end,
          account_type: args.account_type ?? "bank_account",
          order_by: "amount",
          order: "desc",
        });
        const [transactions, profile_context] = await Promise.all([
          client.getTransactions(filters),
          safeProfileContext(client),
        ]);
        const summary = summarizeTransactions(transactions);
        return jsonResponse({
          profile_context,
          filters,
          ...summary,
          transactions: args.include_transactions ? compactTransactions(transactions.slice(0, args.limit)) : undefined,
          warning: emptyProfileWarning("transactions", transactions.length, profile_context),
        });
      } catch (error) {
        return errorResponse(error, "summarize finances");
      }
    },
  );

  server.registerTool(
    "despezzas_prepare_create_transaction",
    {
      title: "Prepare Transaction Create",
      description:
        "Dry-run helper. Build and validate the payload for a new transaction without calling Despezzas. Use this before despezzas_create_transaction.",
      inputSchema: transactionCreateInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ amount_cents, kind, transaction_type, amount_mode, allow_uncategorized, ...rest }) => {
      const prepared = prepareCreateTransaction({
        ...rest,
        amount_cents,
        kind,
        transaction_type,
        amount_mode,
        allow_uncategorized,
      });
      return jsonResponse(prepared);
    },
  );

  server.registerTool(
    "despezzas_create_transaction",
    {
      title: "Create Transaction",
      description:
        "Write operation. Create a real Despezzas transaction. Requires confirm: true. Use despezzas_prepare_create_transaction first, and never guess account/card/category IDs.",
      inputSchema: {
        ...transactionCreateInputSchema,
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ amount_cents, kind, transaction_type, amount_mode, allow_uncategorized, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "create a transaction");
      if (refusal) return refusal;

      const prepared = prepareCreateTransaction({
        ...rest,
        amount_cents,
        kind,
        transaction_type,
        amount_mode,
        allow_uncategorized,
      });
      if (!prepared.ready) {
        return errorResponse(
          new Error(`Transaction create payload is not ready: ${prepared.issues.join(" ")}`),
          "create transaction",
        );
      }

      try {
        const transaction = await client.createTransaction(prepared.payload);
        return jsonResponse({
          created: true,
          payload: prepared.payload,
          transaction,
        });
      } catch (error) {
        return errorResponse(error, "create transaction");
      }
    },
  );

  server.registerTool(
    "despezzas_prepare_update_transaction",
    {
      title: "Prepare Transaction Update",
      description:
        "Dry-run helper. Build and validate the payload for updating a transaction without calling Despezzas. Use before despezzas_update_transaction.",
      inputSchema: transactionUpdateInputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ id, amount_cents, kind, scope, edition_date, ...rest }) => {
      return jsonResponse(prepareUpdateTransaction(id, amount_cents, kind, scope, edition_date, rest));
    },
  );

  server.registerTool(
    "despezzas_update_transaction",
    {
      title: "Update Transaction",
      description:
        "Write operation. Update a real Despezzas transaction. Requires confirm: true. Use despezzas_prepare_update_transaction first.",
      inputSchema: {
        ...transactionUpdateInputSchema,
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, amount_cents, kind, scope, edition_date, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "update a transaction");
      if (refusal) return refusal;

      try {
        const prepared = prepareUpdateTransaction(id, amount_cents, kind, scope, edition_date, rest);
        if (!prepared.ready) {
          return errorResponse(
            new Error(`Transaction update payload is not ready: ${prepared.issues.join(" ")}`),
            "update transaction",
          );
        }

        const transaction = await client.updateTransaction(id, prepared.payload);
        return jsonResponse({
          updated: true,
          id,
          payload: prepared.payload,
          transaction,
        });
      } catch (error) {
        return errorResponse(error, "update transaction");
      }
    },
  );

  server.registerTool(
    "despezzas_prepare_delete_transaction",
    {
      title: "Prepare Transaction Delete",
      description:
        "Dry-run helper. Show the delete target and scope without deleting anything. Use before despezzas_delete_transaction.",
      inputSchema: {
        id: idSchema,
        scope: scopeSchema,
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, scope }) => {
      return jsonResponse({
        ready: true,
        id,
        scope,
        endpoint: `/v1/transactions/${id}`,
        method: "DELETE",
        body: { type: scope },
        note: "No API call was made. To delete this transaction, call despezzas_delete_transaction with this id, scope, and confirm:true.",
      });
    },
  );

  server.registerTool(
    "despezzas_delete_transaction",
    {
      title: "Delete Transaction",
      description:
        "Destructive write operation. Delete a transaction. Requires confirm: true. Use despezzas_prepare_delete_transaction first.",
      inputSchema: {
        id: idSchema,
        scope: scopeSchema,
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, scope, confirm }) => {
      const refusal = requireConfirmation(confirm, "delete a transaction");
      if (refusal) return refusal;

      try {
        await client.deleteTransaction(id, scope);
        return jsonResponse({ deleted: true, id, scope });
      } catch (error) {
        return errorResponse(error, "delete transaction");
      }
    },
  );

  server.registerTool(
    "despezzas_duplicate_transaction",
    {
      title: "Duplicate Transaction",
      description: "Write operation. Duplicate a Despezzas transaction. Requires confirm: true.",
      inputSchema: {
        id: idSchema,
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, confirm }) => {
      const refusal = requireConfirmation(confirm, "duplicate a transaction");
      if (refusal) return refusal;

      try {
        return jsonResponse(await client.duplicateTransaction(id));
      } catch (error) {
        return errorResponse(error, "duplicate transaction");
      }
    },
  );

  server.registerTool(
    "despezzas_toggle_transaction_paid",
    {
      title: "Toggle Transaction Paid",
      description: "Write operation. Toggle or mark transaction paid for a date. Requires confirm: true.",
      inputSchema: {
        id: idSchema,
        date: dateSchema.default(formatDate(new Date())),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, date, confirm }) => {
      const refusal = requireConfirmation(confirm, "toggle transaction paid status");
      if (refusal) return refusal;

      try {
        return jsonResponse(await client.togglePaid(id, date));
      } catch (error) {
        return errorResponse(error, "toggle transaction paid status");
      }
    },
  );

  server.registerTool(
    "despezzas_create_transfer",
    {
      title: "Create Transfer",
      description: "Write operation. Create a transfer between two Despezzas accounts. Requires confirm: true.",
      inputSchema: {
        amount_cents: amountCentsSchema,
        date: dateSchema,
        sent_account_id: idSchema.describe("Source account ID."),
        received_account_id: idSchema.describe("Destination account ID."),
        paid: z.boolean().default(true),
        title: z.string().optional(),
        description: z.string().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ amount_cents, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "create a transfer");
      if (refusal) return refusal;

      try {
        const payload: TransferPayload = { ...rest, amount: amount_cents };
        return jsonResponse(await client.createTransfer(payload));
      } catch (error) {
        return errorResponse(error, "create transfer");
      }
    },
  );

  server.registerTool(
    "despezzas_export_transactions",
    {
      title: "Export Transactions",
      description:
        "Inspect/export Despezzas transactions for a date range. Defaults to a safe count plus field summary; set count_only:false to call the export endpoint.",
      inputSchema: {
        date_start: dateSchema,
        date_end: dateSchema,
        account_ids: idsSchema,
        credit_card_ids: idsSchema,
        count_only: z.boolean().default(true),
        include_field_summary: z.boolean().default(true),
        sample_limit: z.number().int().min(1).max(50).default(10),
      },
    },
    async ({ count_only, include_field_summary, sample_limit, ...filters }) => {
      try {
        const normalized = toTransactionFilters(filters);
        const [profile_context, count_result, sample_transactions] = await Promise.all([
          safeProfileContext(client),
          captureApiResult(() => client.countExportableTransactions(normalized)),
          include_field_summary ? client.getTransactions(normalized) : Promise.resolve([]),
        ]);
        const result: JsonObject = {
          profile_context,
          filters: normalized,
          mode: count_only ? "count_and_field_summary" : "export_endpoint",
          export_count_result: count_result,
          sample_count: sample_transactions.length,
          field_summary: include_field_summary ? summarizeFields(sample_transactions) : undefined,
          sample_transactions: include_field_summary
            ? compactTransactions(sample_transactions.slice(0, sample_limit))
            : undefined,
        };

        if (!count_only) {
          result.export_result = await client.exportTransactions(normalized);
        }

        return jsonResponse(dropUndefined(result));
      } catch (error) {
        return errorResponse(error, "export transactions");
      }
    },
  );

  server.registerTool(
    "despezzas_raw_api",
    {
      title: "Raw Despezzas API Call",
      description:
        "Escape hatch for endpoints discovered later. Safe GET calls are allowed. POST/PUT/PATCH/DELETE require allow_destructive: true.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
        path: z.string().regex(/^\/v\d+\//, "Use an API path such as /v1/transactions."),
        query: rawJsonSchema.optional(),
        body: z.unknown().optional(),
        allow_destructive: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ method, path, query, body, allow_destructive }) => {
      if (method !== "GET" && !allow_destructive) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Refusing to ${method} ${path} because allow_destructive was not true. Re-run this tool only after verifying the endpoint and payload.`,
            },
          ],
          isError: true,
        };
      }

      try {
        return jsonResponse(await client.raw(method, path, query, body));
      } catch (error) {
        return errorResponse(error, "call raw Despezzas API");
      }
    },
  );
}

interface PreparedCreateTransaction {
  ready: boolean;
  issues: string[];
  payload: TransactionPayload;
  endpoint: string;
  method: "POST";
  note: string;
}

interface PreparedUpdateTransaction {
  ready: boolean;
  issues: string[];
  id: string;
  payload: TransactionUpdatePayload;
  endpoint: string;
  method: "PUT";
  note: string;
}

function prepareCreateTransaction(args: {
  title: string;
  description?: string;
  amount_cents: number;
  date: string;
  kind: "expense" | "income";
  account_id?: string;
  credit_card_id?: string;
  category_id?: string;
  subcategory_id?: string;
  paid?: boolean;
  transaction_type?: "unique" | "recurring" | "parcelled";
  frequency?: Frequency;
  installments?: number;
  amount_mode?: "per_installment" | "total";
  allow_uncategorized?: boolean;
}): PreparedCreateTransaction {
  const issues = createTransactionIssues(args);
  const payload = buildTransactionPayload(args);

  return {
    ready: issues.length === 0,
    issues,
    payload,
    endpoint: "/v1/transactions",
    method: "POST",
    note: "No API call was made. If ready is true, call despezzas_create_transaction with the same fields plus confirm:true.",
  };
}

function prepareUpdateTransaction(
  id: string,
  amountCents: number | undefined,
  kind: "expense" | "income" | undefined,
  scope: DeleteScope | undefined,
  editionDate: string | undefined,
  rest: {
    title?: string;
    description?: string;
    date?: string;
    account_id?: string;
    credit_card_id?: string;
    category_id?: string;
    subcategory_id?: string;
    paid?: boolean;
  },
): PreparedUpdateTransaction {
  const payload = buildTransactionUpdatePayload(amountCents, kind, scope, editionDate, rest);
  const issues: string[] = [];

  if (Object.keys(payload).length === 0) {
    issues.push("Provide at least one transaction field to update.");
  }

  if (rest.account_id && rest.credit_card_id) {
    issues.push("Provide either account_id or credit_card_id, not both.");
  }

  return {
    ready: issues.length === 0,
    issues,
    id,
    payload,
    endpoint: `/v1/transactions/${id}`,
    method: "PUT",
    note: "No API call was made. If ready is true, call despezzas_update_transaction with the same fields plus confirm:true.",
  };
}

function createTransactionIssues(args: {
  account_id?: string;
  credit_card_id?: string;
  category_id?: string;
  subcategory_id?: string;
  transaction_type?: "unique" | "recurring" | "parcelled";
  installments?: number;
  allow_uncategorized?: boolean;
}): string[] {
  const issues: string[] = [];

  if (!args.account_id && !args.credit_card_id) {
    issues.push("Either account_id or credit_card_id is required.");
  }

  if (args.account_id && args.credit_card_id) {
    issues.push("Provide either account_id or credit_card_id, not both.");
  }

  if (!args.category_id && !args.allow_uncategorized) {
    issues.push("category_id is required unless allow_uncategorized is true.");
  }

  if (args.subcategory_id && !args.category_id) {
    issues.push("subcategory_id requires category_id.");
  }

  if (args.transaction_type === "parcelled" && (!args.installments || args.installments < 2)) {
    issues.push("Parcelled transactions require installments >= 2.");
  }

  return issues;
}

function buildTransactionUpdatePayload(
  amountCents: number | undefined,
  kind: "expense" | "income" | undefined,
  scope: DeleteScope | undefined,
  editionDate: string | undefined,
  rest: {
    title?: string;
    description?: string;
    date?: string;
    account_id?: string;
    credit_card_id?: string;
    category_id?: string;
    subcategory_id?: string;
    paid?: boolean;
  },
): TransactionUpdatePayload {
  return dropUndefined({
    ...rest,
    amount: amountCents,
    is_expense: kind === undefined ? undefined : kind === "expense",
    edition_type: scope,
    edition_date: editionDate ?? rest.date,
  });
}

async function captureApiResult<T>(operation: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function compactTransactions(transactions: unknown[]) {
  return transactions.map(compactTransaction);
}

function compactTransaction(transaction: unknown): JsonObject {
  if (!isRecord(transaction)) {
    return { value: transaction };
  }

  return dropUndefined({
    id: stringOrUndefined(transaction.id),
    date: normalizeDateForOutput(transaction.date),
    title: stringOrUndefined(transaction.title),
    description: stringOrUndefined(transaction.description),
    amount_cents: numberValue(transaction.amount),
    kind: transaction.is_expense === true ? "expense" : "income",
    paid: typeof transaction.paid === "boolean" ? transaction.paid : undefined,
    type: stringOrUndefined(transaction.type),
    installments: typeof transaction.installments === "number" ? transaction.installments : undefined,
    installment_number: typeof transaction.installment_number === "number" ? transaction.installment_number : undefined,
    account_id: stringOrUndefined(transaction.account_id),
    account_name: nestedString(transaction.account, "name"),
    credit_card_id: stringOrUndefined(transaction.credit_card_id),
    credit_card_name: nestedString(transaction.credit_card, "name"),
    category_id: stringOrUndefined(transaction.category_id),
    category_name: nestedString(transaction.category, "name"),
    subcategory_id: stringOrUndefined(transaction.subcategory_id),
    subcategory_name: nestedString(transaction.subcategory, "name"),
    profile_id: normalizedProfileId(transaction.profile_id),
  });
}

function transactionSearchDiagnostics(
  transactions: unknown[],
  returnedTransactions: unknown[],
  limit: number,
  filters: TransactionFilters,
) {
  return {
    requested_limit: limit,
    api_returned_count: transactions.length,
    returned_count_after_limit: returnedTransactions.length,
    truncated_by_mcp_limit: transactions.length > limit,
    sort_check: verifySort(returnedTransactions, filters.order_by, filters.order),
    note:
      "Despezzas currently returns a single matching list for these filters; this MCP applies limit locally and reports has_more/truncated_by_mcp_limit when the local limit hides rows.",
  };
}

function verifySort(transactions: unknown[], field: SortField | undefined, order: SortOrder | undefined) {
  const sortField = field ?? "date";
  const sortOrder = order ?? "desc";
  let comparablePairs = 0;

  for (let index = 1; index < transactions.length; index += 1) {
    const previous = sortValue(transactions[index - 1], sortField);
    const current = sortValue(transactions[index], sortField);

    if (previous === undefined || current === undefined) {
      continue;
    }

    comparablePairs += 1;
    if (sortOrder === "asc" ? previous > current : previous < current) {
      return {
        field: sortField,
        order: sortOrder,
        ok: false,
        checked_pairs: comparablePairs,
        first_mismatch_index: index - 1,
      };
    }
  }

  return {
    field: sortField,
    order: sortOrder,
    ok: true,
    checked_pairs: comparablePairs,
  };
}

function sortValue(transaction: unknown, field: SortField): number | string | undefined {
  if (!isRecord(transaction)) {
    return undefined;
  }

  if (field === "amount") {
    return numberValue(transaction.amount);
  }

  if (field === "title") {
    return stringOrUndefined(transaction.title)?.toLocaleLowerCase();
  }

  const date = typeof transaction.date === "string" ? Date.parse(transaction.date) : Number.NaN;
  return Number.isFinite(date) ? date : undefined;
}

function summarizeFields(transactions: unknown[]) {
  const fields = new Map<string, { count: number; types: Set<string> }>();

  for (const transaction of transactions) {
    if (!isRecord(transaction)) {
      continue;
    }

    collectFields(transaction, fields);
  }

  return {
    sampled_transactions: transactions.length,
    fields: [...fields.entries()]
      .map(([name, value]) => ({
        name,
        present_count: value.count,
        types: [...value.types].sort(),
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function collectFields(value: Record<string, unknown>, fields: Map<string, { count: number; types: Set<string> }>, prefix = "") {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const existing = fields.get(path) ?? { count: 0, types: new Set<string>() };
    existing.count += 1;
    existing.types.add(valueType(child));
    fields.set(path, existing);

    if (isRecord(child) && prefix === "") {
      collectFields(child, fields, path);
    }
  }
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function nestedString(value: unknown, key: string): string | undefined {
  return isRecord(value) ? stringOrUndefined(value[key]) : undefined;
}

function normalizeDateForOutput(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function toTransactionFilters(args: {
  account_type?: AccountType;
  account_ids?: string[];
  credit_card_ids?: string[];
  category_ids?: string[];
  subcategory_ids?: string[];
  date_start?: string;
  date_end?: string;
  is_paid?: boolean;
  is_expense?: boolean;
  min_amount_cents?: number;
  value?: number;
  search?: string;
  order_by?: SortField;
  order?: SortOrder;
}): TransactionFilters {
  return dropUndefined({
    account_type: args.account_type,
    account_ids: args.account_ids,
    credit_card_ids: args.credit_card_ids,
    category_ids: args.category_ids,
    subcategory_ids: args.subcategory_ids,
    date_start: args.date_start,
    date_end: args.date_end,
    is_paid: args.is_paid,
    is_expense: args.is_expense,
    value: args.min_amount_cents ?? args.value,
    search: args.search?.trim() || undefined,
    order_by: args.order_by,
    order: args.order,
  });
}

function withProfileLimits(access: JsonObject) {
  return {
    max_extra_profiles: MAX_EXTRA_PROFILES,
    extra_profile_types: ["pj", "family", "investments"],
    ...access,
  };
}

async function safeProfileContext(client: DespezzasClient): Promise<ProfileContextResult> {
  try {
    const [profile, access] = await Promise.all([client.getProfile(), client.listProfileAccess()]);
    return profileContextFrom(profile, access);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `Unable to load active profile context: ${message}` };
  }
}

function profileContextFrom(profileValue: unknown, access: JsonObject): ProfileContext {
  const profile = isRecord(profileValue) ? profileValue : {};
  const activeId = normalizedProfileId(profile.current_profile_access_id);
  const activeRole = stringOrNull(profile.current_profile_role);
  const ownerProfiles = profileObjects(access.owner_profiles);
  const memberProfiles = profileObjects(access.member_profiles);
  const availableProfiles = [...ownerProfiles, ...memberProfiles].map((item) => profileSummary(item, activeId));
  const active =
    availableProfiles.find((item) => sameProfileId(item.id, activeId)) ??
    ({
      id: activeId,
      name: activeId === null ? "Perfil Principal" : undefined,
      type: activeId === null ? "pf" : undefined,
      role: activeRole,
      is_active: true,
    } satisfies ProfileSummary);

  return {
    active_profile: {
      ...active,
      role: active.role ?? activeRole,
      is_personal_profile: active.id === null,
    },
    available_profiles: availableProfiles,
    owner_profile_count: ownerProfiles.length,
    member_profile_count: memberProfiles.length,
    hint:
      active.id === null
        ? "Using Perfil Principal. Account, card, and transaction tools should return personal finance data."
        : `Using shared profile${active.name ? ` "${active.name}"` : ""}. Empty account/card/transaction results can mean this profile has no data; switch to profile_id:null for Perfil Principal when you want personal finance data.`,
  };
}

function profileSummary(profile: Record<string, unknown>, activeId: string | null): ProfileSummary {
  const id = normalizedProfileId(profile.id);
  return {
    id,
    name: stringOrUndefined(profile.name),
    type: stringOrUndefined(profile.type),
    role: stringOrNull(profile.role),
    is_active: sameProfileId(id, activeId),
  };
}

function withProfileAwareCollection(
  key: "accounts" | "credit_cards",
  items: unknown[],
  profileContext: ProfileContextResult,
) {
  return {
    profile_context: profileContext,
    count: items.length,
    [key]: items,
    warning: emptyProfileWarning(key, items.length, profileContext),
  };
}

function emptyProfileWarning(resource: string, count: number, profileContext: ProfileContextResult): string | undefined {
  if (count > 0 || !("active_profile" in profileContext) || profileContext.active_profile.id === null) {
    return undefined;
  }

  const name = profileContext.active_profile.name ?? profileContext.active_profile.id;
  return `No ${resource} were returned for active profile "${name}". Use despezzas_switch_profile with profile_id:null and confirm:true if you intended to query Perfil Principal personal finance data.`;
}

function normalizedProfileId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sameProfileId(left: string | null, right: string | null): boolean {
  return left === right;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function validateCreateProfile(access: JsonObject, type: ExtraProfileAccessType) {
  const ownerProfiles = profileObjects(access.owner_profiles);
  const extraProfiles = ownerProfiles.filter((profile) => profile.id !== null && profile.id !== undefined);

  if (extraProfiles.length >= MAX_EXTRA_PROFILES) {
    return errorResponse(
      new Error(`Despezzas allows at most ${MAX_EXTRA_PROFILES} extra profiles. Delete or edit an existing profile instead.`),
      "create shared profile",
    );
  }

  if (extraProfiles.some((profile) => profileType(profile) === type)) {
    return errorResponse(
      new Error(`A ${type} profile already exists. Despezzas normally allows one extra profile per type.`),
      "create shared profile",
    );
  }

  return undefined;
}

function normalizeInvites(invites: Array<{ email: string; role?: "editor" | "viewer" }>): ProfileInvitePayload[] {
  return invites.map((invite) => ({
    email: invite.email.trim().toLowerCase(),
    role: invite.role ?? "viewer",
  }));
}

function profileObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function profileType(profile: Record<string, unknown>): ExtraProfileAccessType | undefined {
  const type = profile.type;
  return type === "pj" || type === "family" || type === "investments" ? type : undefined;
}

function buildTransactionPayload(args: {
  title: string;
  description?: string;
  amount_cents: number;
  date: string;
  kind: "expense" | "income";
  account_id?: string;
  credit_card_id?: string;
  category_id?: string;
  subcategory_id?: string;
  paid?: boolean;
  transaction_type?: "unique" | "recurring" | "parcelled";
  frequency?: Frequency;
  installments?: number;
  amount_mode?: "per_installment" | "total";
}): TransactionPayload {
  let type: TransactionKind = "FIXED";
  let frequency: Frequency | undefined;

  if (args.transaction_type === "recurring") {
    type = "RECURRENT";
    frequency = args.frequency ?? "MONTHLY";
  } else if (args.transaction_type === "parcelled" && (args.installments ?? 1) > 1) {
    type = "PARCELLED";
  }

  return dropUndefined({
    title: args.title,
    description: args.description ?? args.title,
    amount: args.amount_cents,
    date: args.date,
    is_expense: args.kind === "expense",
    type,
    frequency: frequency ?? "MONTHLY",
    installments: type === "PARCELLED" ? args.installments : 1,
    is_full_amount: type === "PARCELLED" ? args.amount_mode !== "total" : true,
    account_id: args.account_id,
    credit_card_id: args.credit_card_id,
    category_id: args.category_id,
    subcategory_id: args.subcategory_id,
    paid: args.credit_card_id ? true : args.paid,
  });
}

function summarizeTransactions(transactions: unknown[]) {
  let expenses = 0;
  let revenues = 0;
  let paid = 0;
  let unpaid = 0;
  const byCategory = new Map<string, { amount_cents: number; count: number }>();

  for (const transaction of transactions) {
    if (!transaction || typeof transaction !== "object") {
      continue;
    }

    const item = transaction as Record<string, unknown>;
    const amount = numberValue(item.amount);
    const isExpense = item.is_expense === true;
    const isPaid = item.paid === true;

    if (isExpense) {
      expenses += amount;
    } else {
      revenues += amount;
    }

    if (isPaid) {
      paid += amount;
    } else {
      unpaid += amount;
    }

    const category = categoryName(item);
    const previous = byCategory.get(category) ?? { amount_cents: 0, count: 0 };
    previous.amount_cents += amount;
    previous.count += 1;
    byCategory.set(category, previous);
  }

  const categories = [...byCategory.entries()]
    .map(([category, value]) => ({ category, ...value }))
    .sort((a, b) => b.amount_cents - a.amount_cents);

  return {
    count: transactions.length,
    totals: {
      expenses_cents: expenses,
      revenues_cents: revenues,
      net_cents: revenues - expenses,
      paid_cents: paid,
      unpaid_cents: unpaid,
    },
    top_categories: categories.slice(0, 10),
  };
}

function categoryName(item: Record<string, unknown>): string {
  const category = item.category;
  if (category && typeof category === "object" && "name" in category) {
    return String((category as { name: unknown }).name);
  }
  return typeof item.category_id === "string" ? item.category_id : "uncategorized";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function loginUrl(): string | undefined {
  if (config.transport !== "http") {
    return undefined;
  }

  return `${config.publicBaseUrl ?? `http://${config.host}:${config.port}`}/login`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dropUndefined<T extends object>(value: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child !== undefined) {
      cleaned[key] = child;
    }
  }
  return cleaned as T;
}
