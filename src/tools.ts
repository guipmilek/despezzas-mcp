import type { McpServer, RegisteredTool, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnySchema, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato YYYY-MM-DD.");
const idSchema = z.string().min(1);
const idsSchema = z.array(idSchema).optional();
const amountCentsSchema = z.number().int().positive().describe("Valor em centavos. Exemplo: 12345 = R$123.45.");
const frequencySchema = z
  .enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"])
  .optional();
const transactionTypeSchema = z.enum(["unique", "recurring", "parcelled"]).optional();
const scopeSchema = z.enum(["THIS", "THIS_AND_NEXT", "ALL"]).default("THIS");
const rawJsonSchema: z.ZodType<JsonObject> = z.record(z.unknown());
const toolOutputSchema = z.object({}).passthrough();
const profileSummaryOutputSchema = z
  .object({
    id: z.string().nullable(),
    name: z.string().optional(),
    type: z.string().optional(),
    role: z.string().nullable().optional(),
    is_active: z.boolean(),
  })
  .passthrough();
const profileContextOutputSchema = z.union([
  z
    .object({
      active_profile: profileSummaryOutputSchema.extend({ is_personal_profile: z.boolean() }),
      available_profiles: z.array(profileSummaryOutputSchema),
      owner_profile_count: z.number().int().nonnegative(),
      member_profile_count: z.number().int().nonnegative(),
      hint: z.string(),
    })
    .passthrough(),
  z.object({ error: z.string() }).passthrough(),
]);
const transactionFiltersOutputSchema = z
  .object({
    account_type: z.enum(["bank_account", "credit_card"]).optional(),
    account_ids: z.array(z.string()).optional(),
    credit_card_ids: z.array(z.string()).optional(),
    category_ids: z.array(z.string()).optional(),
    subcategory_ids: z.array(z.string()).optional(),
    date_start: z.string().optional(),
    date_end: z.string().optional(),
    is_paid: z.boolean().optional(),
    is_expense: z.boolean().optional(),
    value: z.number().optional(),
    search: z.string().optional(),
    order_by: z.enum(["date", "title", "amount"]).optional(),
    order: z.enum(["asc", "desc"]).optional(),
  })
  .passthrough();
const compactTransactionOutputSchema = z
  .object({
    id: z.string().optional(),
    date: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    amount_cents: z.number(),
    kind: z.enum(["expense", "income"]),
    paid: z.boolean().optional(),
    type: z.string().optional(),
    installments: z.number().optional(),
    installment_number: z.number().optional(),
    account_id: z.string().optional(),
    account_name: z.string().optional(),
    credit_card_id: z.string().optional(),
    credit_card_name: z.string().optional(),
    category_id: z.string().optional(),
    category_name: z.string().optional(),
    subcategory_id: z.string().optional(),
    subcategory_name: z.string().optional(),
    profile_id: z.string().nullable().optional(),
  })
  .passthrough();
const transactionSearchDiagnosticsOutputSchema = z
  .object({
    requested_limit: z.number().int().positive(),
    api_returned_count: z.number().int().nonnegative(),
    returned_count_after_limit: z.number().int().nonnegative(),
    truncated_by_mcp_limit: z.boolean(),
    sort_check: z
      .object({
        field: z.enum(["date", "title", "amount"]),
        order: z.enum(["asc", "desc"]),
        ok: z.boolean(),
        checked_pairs: z.number().int().nonnegative(),
        first_mismatch_index: z.number().int().nonnegative().optional(),
      })
      .passthrough(),
    note: z.string(),
  })
  .passthrough();
const transactionPayloadOutputSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    amount: z.number().int().positive(),
    date: dateSchema,
    is_expense: z.boolean(),
    type: z.enum(["FIXED", "RECURRENT", "PARCELLED"]).optional(),
    frequency: z
      .enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"])
      .optional(),
    installments: z.number().int().positive().optional(),
    is_full_amount: z.boolean().optional(),
    category_id: z.string().optional(),
    subcategory_id: z.string().optional(),
    account_id: z.string().optional(),
    credit_card_id: z.string().optional(),
    paid: z.boolean().optional(),
  })
  .passthrough();
const transactionUpdatePayloadOutputSchema = transactionPayloadOutputSchema
  .partial()
  .extend({
    amount: z.number().int().positive().optional(),
    edition_type: z.enum(["THIS", "THIS_AND_NEXT", "ALL"]).optional(),
    edition_date: dateSchema.optional(),
  })
  .passthrough();
const preparedCreateTransactionOutputSchema = z
  .object({
    ready: z.boolean(),
    issues: z.array(z.string()),
    payload: transactionPayloadOutputSchema,
    endpoint: z.literal("/v1/transactions"),
    method: z.literal("POST"),
    note: z.string(),
  })
  .passthrough();
const preparedUpdateTransactionOutputSchema = z
  .object({
    ready: z.boolean(),
    issues: z.array(z.string()),
    id: z.string(),
    payload: transactionUpdatePayloadOutputSchema,
    endpoint: z.string(),
    method: z.literal("PUT"),
    note: z.string(),
  })
  .passthrough();
const transactionSearchOutputSchema = z
  .object({
    profile_context: profileContextOutputSchema,
    filters: transactionFiltersOutputSchema,
    count: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    has_more: z.boolean(),
    diagnostics: transactionSearchDiagnosticsOutputSchema,
    transactions: z.array(z.union([compactTransactionOutputSchema, z.record(z.unknown())])),
    warning: z.string().optional(),
  })
  .passthrough();
const createTransactionOutputSchema = z
  .object({
    created: z.literal(true),
    payload: transactionPayloadOutputSchema,
    transaction: z.record(z.unknown()),
  })
  .passthrough();
const updateTransactionOutputSchema = z
  .object({
    updated: z.literal(true),
    id: z.string(),
    payload: transactionUpdatePayloadOutputSchema,
    transaction: z.record(z.unknown()),
  })
  .passthrough();
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
    .describe("Defina como true apenas quando quiser intencionalmente criar uma transação sem category_id."),
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
  scope: scopeSchema.optional().describe("Escopo de edição para transações recorrentes/parceladas."),
  edition_date: dateSchema.optional().describe("Data da ocorrência a editar. Por padrão, usa date quando informado."),
};
const transactionBatchUpdateItemInputSchema = z.object(transactionUpdateInputSchema);
const preparedBatchUpdateTransactionOutputSchema = preparedUpdateTransactionOutputSchema
  .extend({
    index: z.number().int().nonnegative(),
  })
  .passthrough();
const batchUpdateTransactionOutputSchema = z
  .object({
    confirmed: z.boolean(),
    total: z.number().int().nonnegative(),
    ready_count: z.number().int().nonnegative(),
    all_ready: z.boolean(),
    requires_confirm: z.boolean().optional(),
    preview: z.array(preparedBatchUpdateTransactionOutputSchema),
    updated_count: z.number().int().nonnegative().optional(),
    results: z
      .array(
        z.union([
          z
            .object({
              index: z.number().int().nonnegative(),
              id: z.string(),
              ok: z.literal(true),
              payload: transactionUpdatePayloadOutputSchema,
              transaction: z.record(z.unknown()),
            })
            .passthrough(),
          z
            .object({
              index: z.number().int().nonnegative(),
              id: z.string(),
              ok: z.literal(false),
              error: z.string(),
            })
            .passthrough(),
        ]),
      )
      .optional(),
    note: z.string(),
  })
  .passthrough();

type TransactionBatchUpdateInput = z.infer<typeof transactionBatchUpdateItemInputSchema>;

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

type ToolConfig<InputArgs extends undefined | ZodRawShapeCompat | AnySchema> = {
  title?: string;
  description?: string;
  inputSchema?: InputArgs;
  outputSchema?: ZodRawShapeCompat | AnySchema;
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
};

function registerTool<InputArgs extends undefined | ZodRawShapeCompat | AnySchema = undefined>(
  server: McpServer,
  name: string,
  config: ToolConfig<InputArgs>,
  callback: ToolCallback<InputArgs>,
): RegisteredTool {
  return server.registerTool(
    name,
    {
      ...config,
      outputSchema: config.outputSchema ?? toolOutputSchema,
    },
    callback,
  );
}

export function registerTools(server: McpServer, client = new DespezzasClient()) {
  registerTool(
    server,
    "despezzas_status",
    {
      title: "Status do Despezzas MCP",
      description: "Verifica se o servidor MCP está configurado com um token do Despezzas.",
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
          ? "A autenticação do Despezzas está disponível."
          : "Autenticação ausente. Configure DESPEZZAS_TOKEN ou DESPEZZAS_EMAIL/DESPEZZAS_PASSWORD/DESPEZZAS_FIREBASE_API_KEY, ou execute o modo HTTP e abra /login.",
      });
    },
  );

  registerTool(
    server,
    "despezzas_profile",
    {
      title: "Obter Perfil do Despezzas",
      description: "Busca o perfil autenticado do Despezzas. Campos sensíveis são mascarados.",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResponse(await client.getProfile());
      } catch (error) {
        return errorResponse(error, "obter perfil");
      }
    },
  );

  registerTool(
    server,
    "despezzas_list_profiles",
    {
      title: "Listar Perfis do Despezzas",
      description:
        "Lista perfis Despezzas de proprietário e membro. Use antes de trocar o contexto de perfil ou gerenciar perfis compartilhados.",
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
        return errorResponse(error, "listar perfis");
      }
    },
  );

  registerTool(
    server,
    "despezzas_switch_profile",
    {
      title: "Trocar Perfil Ativo",
      description:
        "Operação de escrita. Troca o perfil Despezzas ativo para chamadas futuras de contas, cartões e transações. Exige confirm: true.",
      inputSchema: {
        profile_id: z
          .string()
          .min(1)
          .nullable()
          .describe("ID do perfil em despezzas_list_profiles. Use null para o perfil pessoal/raiz."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ profile_id, confirm }) => {
      const refusal = requireConfirmation(confirm, "trocar o perfil ativo");
      if (refusal) return refusal;

      try {
        const result = await client.changeProfile(profile_id);
        return jsonResponse({
          switched: true,
          active_profile_id: profile_id,
          result,
          note: "Chamadas futuras à API Despezzas nesta sessão devem usar este contexto de perfil ativo.",
        });
      } catch (error) {
        return errorResponse(error, "trocar perfil ativo");
      }
    },
  );

  registerTool(
    server,
    "despezzas_create_profile",
    {
      title: "Criar Perfil Compartilhado",
      description:
        "Operação de escrita. Cria um dos três perfis extras do Despezzas (PJ, família ou investimentos). Exige confirm: true.",
      inputSchema: {
        name: z.string().min(1).max(60),
        type: extraProfileTypeSchema.describe(
          "Tipo de perfil extra do Despezzas. Normalmente só é permitido um de cada tipo.",
        ),
        invites: profileInvitesSchema.describe("Lista opcional de convites. Os papéis são editor ou viewer."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ name, type, invites, confirm }) => {
      const refusal = requireConfirmation(confirm, "criar um perfil compartilhado");
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
        return errorResponse(error, "criar perfil compartilhado");
      }
    },
  );

  registerTool(
    server,
    "despezzas_update_profile_access",
    {
      title: "Editar Perfil Compartilhado",
      description:
        "Operação de escrita. Edita um perfil compartilhado. Se invites for informado, ele substitui a lista de convites/membros. Exige confirm: true.",
      inputSchema: {
        id: idSchema.describe("ID do perfil compartilhado em despezzas_list_profiles."),
        name: z.string().min(1).max(60).optional(),
        type: extraProfileTypeSchema.optional(),
        invites: z.array(profileInviteSchema).max(5).optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, name, type, invites, confirm }) => {
      const refusal = requireConfirmation(confirm, "editar um perfil compartilhado");
      if (refusal) return refusal;

      const payload: ProfileAccessUpdatePayload = dropUndefined({
        name: name?.trim(),
        type,
        invites: invites ? normalizeInvites(invites) : undefined,
      });

      if (Object.keys(payload).length === 0) {
        return errorResponse(
          new Error("Informe pelo menos um dos campos name, type ou invites."),
          "editar perfil compartilhado",
        );
      }

      try {
        return jsonResponse(await client.updateAccessProfile(id, payload));
      } catch (error) {
        return errorResponse(error, "editar perfil compartilhado");
      }
    },
  );

  registerTool(
    server,
    "despezzas_delete_profile",
    {
      title: "Excluir Perfil Compartilhado",
      description:
        "Operação de escrita destrutiva. Exclui um perfil compartilhado de sua propriedade. Exige confirm: true.",
      inputSchema: {
        id: idSchema.describe("ID do perfil compartilhado em despezzas_list_profiles."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, confirm }) => {
      const refusal = requireConfirmation(confirm, "excluir um perfil compartilhado");
      if (refusal) return refusal;

      try {
        await client.deleteAccessProfile(id);
        return jsonResponse({ deleted: true, id });
      } catch (error) {
        return errorResponse(error, "excluir perfil compartilhado");
      }
    },
  );

  registerTool(
    server,
    "despezzas_leave_profile",
    {
      title: "Sair de Perfil Compartilhado",
      description: "Operação de escrita. Sai de um perfil compartilhado em que você é membro. Exige confirm: true.",
      inputSchema: {
        profile_id: idSchema.describe("ID do perfil de membro em despezzas_list_profiles."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ profile_id, confirm }) => {
      const refusal = requireConfirmation(confirm, "sair de um perfil compartilhado");
      if (refusal) return refusal;

      try {
        return jsonResponse(await client.leaveAccessProfile(profile_id));
      } catch (error) {
        return errorResponse(error, "sair de perfil compartilhado");
      }
    },
  );

  registerTool(
    server,
    "despezzas_personal_config",
    {
      title: "Obter Configuração Pessoal",
      description:
        "Busca preferências de visibilidade financeira, como inclusão de transferências, contas ou investimentos.",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResponse(await client.getPersonalConfig());
      } catch (error) {
        return errorResponse(error, "obter configuração pessoal");
      }
    },
  );

  registerTool(
    server,
    "despezzas_list_accounts",
    {
      title: "Listar Contas",
      description:
        "Lista contas bancárias/dinheiro do Despezzas. Use primeiro para descobrir IDs de conta para filtros de transação.",
      inputSchema: {},
    },
    async () => {
      try {
        const [accounts, profile_context] = await Promise.all([client.getAccounts(), safeProfileContext(client)]);
        return jsonResponse(withProfileAwareCollection("accounts", accounts, profile_context));
      } catch (error) {
        return errorResponse(error, "listar contas");
      }
    },
  );

  registerTool(
    server,
    "despezzas_list_banks",
    {
      title: "Listar Bancos/Logos de Conta",
      description: "Lista opções de bancos/logos usadas ao criar contas manuais no Despezzas.",
      inputSchema: {},
    },
    async () => {
      try {
        return jsonResponse(await client.getBanks());
      } catch (error) {
        return errorResponse(error, "listar bancos");
      }
    },
  );

  registerTool(
    server,
    "despezzas_create_account",
    {
      title: "Criar Conta Manual",
      description: "Operação de escrita. Cria uma conta manual no Despezzas. Exige confirm: true.",
      inputSchema: {
        name: z.string().min(1),
        logo: z
          .string()
          .min(1)
          .describe("URL do logo ou valor de logo de banco do Despezzas vindo de despezzas_list_banks."),
        initial_balance_cents: z.number().int().optional(),
        include_total_balance: z.boolean().default(true),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ name, logo, initial_balance_cents, include_total_balance, confirm }) => {
      const refusal = requireConfirmation(confirm, "criar uma conta");
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
        return errorResponse(error, "criar conta");
      }
    },
  );

  registerTool(
    server,
    "despezzas_update_account",
    {
      title: "Editar Conta",
      description: "Operação de escrita. Edita uma conta manual do Despezzas. Exige confirm: true.",
      inputSchema: {
        id: idSchema.describe("ID da conta em despezzas_list_accounts."),
        name: z.string().min(1).optional(),
        logo: z.string().min(1).optional(),
        balance_cents: z.number().int().optional(),
        include_total_balance: z.boolean().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, balance_cents, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "editar uma conta");
      if (refusal) return refusal;

      try {
        const payload: Partial<AccountPayload> = { ...rest, balance: balance_cents };
        return jsonResponse(await client.updateAccount(id, dropUndefined(payload)));
      } catch (error) {
        return errorResponse(error, "editar conta");
      }
    },
  );

  registerTool(
    server,
    "despezzas_delete_account",
    {
      title: "Excluir Conta",
      description: "Operação de escrita destrutiva. Exclui uma conta do Despezzas. Exige confirm: true.",
      inputSchema: {
        id: idSchema.describe("ID da conta em despezzas_list_accounts."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, confirm }) => {
      const refusal = requireConfirmation(confirm, "excluir uma conta");
      if (refusal) return refusal;

      try {
        await client.deleteAccount(id);
        return jsonResponse({ deleted: true, id });
      } catch (error) {
        return errorResponse(error, "excluir conta");
      }
    },
  );

  registerTool(
    server,
    "despezzas_list_credit_cards",
    {
      title: "Listar Cartões de Crédito",
      description: "Lista cartões de crédito do Despezzas. Use para descobrir IDs de cartão para filtros de transação.",
      inputSchema: {},
    },
    async () => {
      try {
        const [credit_cards, profile_context] = await Promise.all([
          client.getCreditCards(),
          safeProfileContext(client),
        ]);
        return jsonResponse(withProfileAwareCollection("credit_cards", credit_cards, profile_context));
      } catch (error) {
        return errorResponse(error, "listar cartões de crédito");
      }
    },
  );

  registerTool(
    server,
    "despezzas_create_credit_card",
    {
      title: "Criar Cartão de Crédito",
      description: "Operação de escrita. Cria um cartão de crédito manual no Despezzas. Exige confirm: true.",
      inputSchema: {
        name: z.string().min(1),
        logo: z.string().optional(),
        limit_cents: z.number().int().optional(),
        available_limit_cents: z.number().int().optional(),
        is_unlimited: z.boolean().optional(),
        expiring_date: z
          .string()
          .optional()
          .describe("Campo de dia/mês de vencimento como o Despezzas espera, geralmente uma string de dia."),
        closing_date: z.string().optional().describe("String com o dia de fechamento."),
        account_id: idSchema.optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ limit_cents, available_limit_cents, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "criar um cartão de crédito");
      if (refusal) return refusal;

      try {
        const payload: CreditCardPayload = {
          ...rest,
          limit: limit_cents,
          available_limit: available_limit_cents,
        };
        return jsonResponse(await client.createCreditCard(dropUndefined(payload)));
      } catch (error) {
        return errorResponse(error, "criar cartão de crédito");
      }
    },
  );

  registerTool(
    server,
    "despezzas_update_credit_card",
    {
      title: "Editar Cartão de Crédito",
      description: "Operação de escrita. Edita um cartão de crédito manual do Despezzas. Exige confirm: true.",
      inputSchema: {
        id: idSchema.describe("ID do cartão de crédito em despezzas_list_credit_cards."),
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
      const refusal = requireConfirmation(confirm, "editar um cartão de crédito");
      if (refusal) return refusal;

      try {
        const payload: Partial<CreditCardPayload> = {
          ...rest,
          limit: limit_cents,
          available_limit: available_limit_cents,
        };
        return jsonResponse(await client.updateCreditCard(id, dropUndefined(payload)));
      } catch (error) {
        return errorResponse(error, "editar cartão de crédito");
      }
    },
  );

  registerTool(
    server,
    "despezzas_delete_credit_card",
    {
      title: "Excluir Cartão de Crédito",
      description: "Operação de escrita destrutiva. Exclui um cartão de crédito do Despezzas. Exige confirm: true.",
      inputSchema: {
        id: idSchema.describe("ID do cartão de crédito em despezzas_list_credit_cards."),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, confirm }) => {
      const refusal = requireConfirmation(confirm, "excluir um cartão de crédito");
      if (refusal) return refusal;

      try {
        await client.deleteCreditCard(id);
        return jsonResponse({ deleted: true, id });
      } catch (error) {
        return errorResponse(error, "excluir cartão de crédito");
      }
    },
  );

  registerTool(
    server,
    "despezzas_list_categories",
    {
      title: "Listar Categorias",
      description: "Lista categorias padrão e, opcionalmente, categorias criadas pelo usuário no Despezzas.",
      inputSchema: {
        include_user: z.boolean().default(true),
      },
    },
    async ({ include_user }) => {
      try {
        return jsonResponse(await client.getCategories(include_user));
      } catch (error) {
        return errorResponse(error, "listar categorias");
      }
    },
  );

  registerTool(
    server,
    "despezzas_list_subcategories",
    {
      title: "Listar Subcategorias",
      description:
        "Lista subcategorias padrão e, opcionalmente, subcategorias criadas pelo usuário no Despezzas. Use category_id no resultado para vinculá-las às categorias.",
      inputSchema: {
        include_user: z.boolean().default(true),
      },
    },
    async ({ include_user }) => {
      try {
        return jsonResponse(await client.getSubcategories(include_user));
      } catch (error) {
        return errorResponse(error, "listar subcategorias");
      }
    },
  );

  registerTool(
    server,
    "despezzas_search_transactions",
    {
      title: "Buscar Transações",
      description:
        "Lista transações do Despezzas com filtros. Por padrão usa o mês atual e a visão de fluxo de caixa de contas bancárias. Valores retornam em centavos.",
      inputSchema: {
        date_start: dateSchema.optional(),
        date_end: dateSchema.optional(),
        account_type: z.enum(["bank_account", "credit_card"]).optional(),
        account_ids: idsSchema.describe("IDs de conta em despezzas_list_accounts."),
        credit_card_ids: idsSchema.describe("IDs de cartão de crédito em despezzas_list_credit_cards."),
        category_ids: idsSchema.describe("IDs de categoria em despezzas_list_categories."),
        subcategory_ids: idsSchema.describe("IDs de subcategoria em despezzas_list_subcategories."),
        is_paid: z.boolean().optional(),
        is_expense: z.boolean().optional(),
        min_amount_cents: z.number().int().positive().optional(),
        search: z.string().optional(),
        order_by: z.enum(["date", "title", "amount"]).default("date"),
        order: z.enum(["asc", "desc"]).default("desc"),
        limit: z.number().int().min(1).max(500).default(100),
        include_raw: z
          .boolean()
          .default(false)
          .describe("Retorna objetos completos de transação do Despezzas em vez de linhas compactas."),
      },
      outputSchema: transactionSearchOutputSchema,
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
        return errorResponse(error, "buscar transações");
      }
    },
  );

  registerTool(
    server,
    "despezzas_transaction_overview",
    {
      title: "Visão Geral de Transações",
      description: "Obtém totais da visão geral do Despezzas e saldos de conta para uma data. Valores em centavos.",
      inputSchema: {
        date: dateSchema.default(formatDate(new Date())),
      },
    },
    async ({ date }) => {
      try {
        return jsonResponse(await client.getOverview(date));
      } catch (error) {
        return errorResponse(error, "obter visão geral de transações");
      }
    },
  );

  registerTool(
    server,
    "despezzas_finance_summary",
    {
      title: "Resumo Financeiro",
      description:
        "Resume receitas, despesas, totais pagos/não pagos e principais categorias em um intervalo de datas. Por padrão usa o mês atual.",
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
        return errorResponse(error, "resumir finanças");
      }
    },
  );

  registerTool(
    server,
    "despezzas_prepare_create_transaction",
    {
      title: "Preparar Criação de Transação",
      description:
        "Auxiliar de pré-visualização. Monta e valida o payload de uma nova transação sem chamar o Despezzas. Use antes de despezzas_create_transaction.",
      inputSchema: transactionCreateInputSchema,
      outputSchema: preparedCreateTransactionOutputSchema,
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

  registerTool(
    server,
    "despezzas_create_transaction",
    {
      title: "Criar Transação",
      description:
        "Operação de escrita. Cria uma transação real no Despezzas. Exige confirm: true. Use despezzas_prepare_create_transaction primeiro e nunca adivinhe IDs de conta/cartão/categoria.",
      inputSchema: {
        ...transactionCreateInputSchema,
        confirm: z.boolean().optional(),
      },
      outputSchema: createTransactionOutputSchema,
      annotations: { destructiveHint: true },
    },
    async ({ amount_cents, kind, transaction_type, amount_mode, allow_uncategorized, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "criar uma transação");
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
          new Error(`Payload de criação de transação não está pronto: ${prepared.issues.join(" ")}`),
          "criar transação",
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
        return errorResponse(error, "criar transação");
      }
    },
  );

  registerTool(
    server,
    "despezzas_prepare_update_transaction",
    {
      title: "Preparar Edição de Transação",
      description:
        "Auxiliar de pré-visualização. Monta e valida o payload para editar uma transação sem chamar o Despezzas. Use antes de despezzas_update_transaction.",
      inputSchema: transactionUpdateInputSchema,
      outputSchema: preparedUpdateTransactionOutputSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ id, amount_cents, kind, scope, edition_date, ...rest }) => {
      return jsonResponse(prepareUpdateTransaction(id, amount_cents, kind, scope, edition_date, rest));
    },
  );

  registerTool(
    server,
    "despezzas_update_transaction",
    {
      title: "Editar Transação",
      description:
        "Operação de escrita. Edita uma transação real no Despezzas. Exige confirm: true. Use despezzas_prepare_update_transaction primeiro.",
      inputSchema: {
        ...transactionUpdateInputSchema,
        confirm: z.boolean().optional(),
      },
      outputSchema: updateTransactionOutputSchema,
      annotations: { destructiveHint: true },
    },
    async ({ id, amount_cents, kind, scope, edition_date, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "editar uma transação");
      if (refusal) return refusal;

      try {
        const prepared = prepareUpdateTransaction(id, amount_cents, kind, scope, edition_date, rest);
        if (!prepared.ready) {
          return errorResponse(
            new Error(`Payload de edição de transação não está pronto: ${prepared.issues.join(" ")}`),
            "editar transação",
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
        return errorResponse(error, "editar transação");
      }
    },
  );

  registerTool(
    server,
    "despezzas_batch_update_transactions",
    {
      title: "Editar Transações em Lote",
      description:
        "Operação de escrita. Pré-visualiza e depois edita várias transações do Despezzas com uma chamada confirm:true. Exige confirm: true. Chame uma vez sem confirm para inspecionar os payloads; repita com confirm:true apenas depois de verificar cada id e payload.",
      inputSchema: {
        updates: z
          .array(transactionBatchUpdateItemInputSchema)
          .min(1)
          .max(50)
          .describe(
            "Edições de transação. Cada item usa os mesmos campos de despezzas_update_transaction, incluindo id.",
          ),
        confirm: z.boolean().optional(),
        stop_on_error: z
          .boolean()
          .default(true)
          .describe(
            "Para após o primeiro erro de API. A validação sempre roda para todos os itens antes de qualquer escrita.",
          ),
      },
      outputSchema: batchUpdateTransactionOutputSchema,
      annotations: { destructiveHint: true },
    },
    async ({ updates, confirm, stop_on_error }) => {
      const preview = prepareBatchUpdateTransactions(updates);
      const readyCount = preview.filter((item) => item.ready).length;
      const allReady = readyCount === preview.length;

      if (!confirm) {
        return jsonResponse({
          confirmed: false,
          total: preview.length,
          ready_count: readyCount,
          all_ready: allReady,
          requires_confirm: true,
          preview,
          note: "Nenhuma chamada de API foi feita. Se all_ready for true, chame esta ferramenta novamente com as mesmas edições e confirm:true.",
        });
      }

      if (!allReady) {
        return jsonResponse({
          confirmed: false,
          total: preview.length,
          ready_count: readyCount,
          all_ready: false,
          requires_confirm: true,
          preview,
          note: "Nenhuma chamada de API foi feita porque pelo menos uma edição não está pronta. Corrija os problemas e pré-visualize novamente antes de confirmar.",
        });
      }

      const results: Array<
        | { index: number; id: string; ok: true; payload: TransactionUpdatePayload; transaction: JsonObject }
        | { index: number; id: string; ok: false; error: string }
      > = [];

      for (const item of preview) {
        const result = await captureApiResult(() => client.updateTransaction(item.id, item.payload));
        if (result.ok) {
          results.push({
            index: item.index,
            id: item.id,
            ok: true,
            payload: item.payload,
            transaction: result.value,
          });
          continue;
        }

        results.push({
          index: item.index,
          id: item.id,
          ok: false,
          error: result.error,
        });
        if (stop_on_error) {
          break;
        }
      }

      const updatedCount = results.filter((item) => item.ok).length;
      return jsonResponse({
        confirmed: true,
        total: preview.length,
        ready_count: readyCount,
        all_ready: true,
        preview,
        updated_count: updatedCount,
        results,
        note:
          updatedCount === preview.length
            ? "Todas as edições de transação foram concluídas."
            : "Algumas edições de transação não foram concluídas. Revise os resultados antes de tentar novamente apenas os itens com falha.",
      });
    },
  );

  registerTool(
    server,
    "despezzas_prepare_delete_transaction",
    {
      title: "Preparar Exclusão de Transação",
      description:
        "Auxiliar de pré-visualização. Mostra o alvo e o escopo da exclusão sem excluir nada. Use antes de despezzas_delete_transaction.",
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
        note: "Nenhuma chamada de API foi feita. Para excluir esta transação, chame despezzas_delete_transaction com este id, scope e confirm:true.",
      });
    },
  );

  registerTool(
    server,
    "despezzas_delete_transaction",
    {
      title: "Excluir Transação",
      description:
        "Operação de escrita destrutiva. Exclui uma transação. Exige confirm: true. Use despezzas_prepare_delete_transaction primeiro.",
      inputSchema: {
        id: idSchema,
        scope: scopeSchema,
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, scope, confirm }) => {
      const refusal = requireConfirmation(confirm, "excluir uma transação");
      if (refusal) return refusal;

      try {
        await client.deleteTransaction(id, scope);
        return jsonResponse({ deleted: true, id, scope });
      } catch (error) {
        return errorResponse(error, "excluir transação");
      }
    },
  );

  registerTool(
    server,
    "despezzas_duplicate_transaction",
    {
      title: "Duplicar Transação",
      description: "Operação de escrita. Duplica uma transação do Despezzas. Exige confirm: true.",
      inputSchema: {
        id: idSchema,
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, confirm }) => {
      const refusal = requireConfirmation(confirm, "duplicar uma transação");
      if (refusal) return refusal;

      try {
        return jsonResponse(await client.duplicateTransaction(id));
      } catch (error) {
        return errorResponse(error, "duplicar transação");
      }
    },
  );

  registerTool(
    server,
    "despezzas_toggle_transaction_paid",
    {
      title: "Alternar Pagamento da Transação",
      description: "Operação de escrita. Alterna ou marca uma transação como paga em uma data. Exige confirm: true.",
      inputSchema: {
        id: idSchema,
        date: dateSchema.default(formatDate(new Date())),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, date, confirm }) => {
      const refusal = requireConfirmation(confirm, "alternar status de pagamento da transação");
      if (refusal) return refusal;

      try {
        return jsonResponse(await client.togglePaid(id, date));
      } catch (error) {
        return errorResponse(error, "alternar status de pagamento da transação");
      }
    },
  );

  registerTool(
    server,
    "despezzas_create_transfer",
    {
      title: "Criar Transferência",
      description: "Operação de escrita. Cria uma transferência entre duas contas do Despezzas. Exige confirm: true.",
      inputSchema: {
        amount_cents: amountCentsSchema,
        date: dateSchema,
        sent_account_id: idSchema.describe("ID da conta de origem."),
        received_account_id: idSchema.describe("ID da conta de destino."),
        paid: z.boolean().default(true),
        title: z.string().optional(),
        description: z.string().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ amount_cents, confirm, ...rest }) => {
      const refusal = requireConfirmation(confirm, "criar uma transferência");
      if (refusal) return refusal;

      try {
        const payload: TransferPayload = { ...rest, amount: amount_cents };
        return jsonResponse(await client.createTransfer(payload));
      } catch (error) {
        return errorResponse(error, "criar transferência");
      }
    },
  );

  registerTool(
    server,
    "despezzas_export_transactions",
    {
      title: "Exportar Transações",
      description:
        "Inspeciona/exporta transações do Despezzas em um intervalo de datas. Por padrão faz uma contagem segura com resumo de campos; defina count_only:false para chamar o endpoint de exportação.",
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
        return errorResponse(error, "exportar transações");
      }
    },
  );

  registerTool(
    server,
    "despezzas_raw_api",
    {
      title: "Chamada Bruta à API Despezzas",
      description:
        "Saída de emergência para endpoints descobertos depois. Chamadas GET seguras são permitidas. POST/PUT/PATCH/DELETE exigem allow_destructive: true.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
        path: z.string().regex(/^\/v\d+\//, "Use um caminho de API como /v1/transactions."),
        query: rawJsonSchema.optional(),
        body: z.unknown().optional(),
        allow_destructive: z.boolean().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ method, path, query, body, allow_destructive }) => {
      if (method !== "GET" && !allow_destructive) {
        return errorResponse(
          new Error(
            `Recusando ${method} ${path} porque allow_destructive não foi true. Execute esta ferramenta novamente apenas depois de verificar o endpoint e o payload.`,
          ),
          `${method} ${path}`,
        );
      }

      try {
        return jsonResponse(await client.raw(method, path, query, body));
      } catch (error) {
        return errorResponse(error, "chamar API bruta do Despezzas");
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

interface PreparedBatchUpdateTransaction extends PreparedUpdateTransaction {
  index: number;
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
    note: "Nenhuma chamada de API foi feita. Se ready for true, chame despezzas_create_transaction com os mesmos campos e confirm:true.",
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
    issues.push("Informe pelo menos um campo de transação para editar.");
  }

  if (rest.account_id && rest.credit_card_id) {
    issues.push("Informe account_id ou credit_card_id, não ambos.");
  }

  return {
    ready: issues.length === 0,
    issues,
    id,
    payload,
    endpoint: `/v1/transactions/${id}`,
    method: "PUT",
    note: "Nenhuma chamada de API foi feita. Se ready for true, chame despezzas_update_transaction com os mesmos campos e confirm:true.",
  };
}

function prepareBatchUpdateTransactions(updates: TransactionBatchUpdateInput[]): PreparedBatchUpdateTransaction[] {
  return updates.map((update, index) => {
    const { id, amount_cents, kind, scope, edition_date, ...rest } = update;
    return {
      index,
      ...prepareUpdateTransaction(id, amount_cents, kind, scope, edition_date, rest),
    };
  });
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
    issues.push("account_id ou credit_card_id é obrigatório.");
  }

  if (args.account_id && args.credit_card_id) {
    issues.push("Informe account_id ou credit_card_id, não ambos.");
  }

  if (!args.category_id && !args.allow_uncategorized) {
    issues.push("category_id é obrigatório, a menos que allow_uncategorized seja true.");
  }

  if (args.subcategory_id && !args.category_id) {
    issues.push("subcategory_id exige category_id.");
  }

  if (args.transaction_type === "parcelled" && (!args.installments || args.installments < 2)) {
    issues.push("Transações parceladas exigem installments >= 2.");
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

async function captureApiResult<T>(
  operation: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
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
    note: "O Despezzas atualmente retorna uma única lista correspondente para esses filtros; este MCP aplica limit localmente e informa has_more/truncated_by_mcp_limit quando o limite local oculta linhas.",
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

function collectFields(
  value: Record<string, unknown>,
  fields: Map<string, { count: number; types: Set<string> }>,
  prefix = "",
) {
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
    return { error: `Não foi possível carregar o contexto do perfil ativo: ${message}` };
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
        ? "Usando Perfil Principal. Ferramentas de conta, cartão e transação devem retornar dados financeiros pessoais."
        : `Usando perfil compartilhado${active.name ? ` "${active.name}"` : ""}. Resultados vazios de contas/cartões/transações podem indicar que este perfil não tem dados; troque para profile_id:null para consultar o Perfil Principal quando quiser dados financeiros pessoais.`,
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

function emptyProfileWarning(
  resource: string,
  count: number,
  profileContext: ProfileContextResult,
): string | undefined {
  if (count > 0 || !("active_profile" in profileContext) || profileContext.active_profile.id === null) {
    return undefined;
  }

  const name = profileContext.active_profile.name ?? profileContext.active_profile.id;
  return `Nenhum resultado de ${profileResourceLabel(resource)} foi retornado para o perfil ativo "${name}". Use despezzas_switch_profile com profile_id:null e confirm:true se a intenção era consultar dados financeiros pessoais do Perfil Principal.`;
}

function profileResourceLabel(resource: string): string {
  return (
    {
      accounts: "contas",
      credit_cards: "cartões de crédito",
      transactions: "transações",
    }[resource] ?? resource
  );
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
      new Error(
        `O Despezzas permite no máximo ${MAX_EXTRA_PROFILES} perfis extras. Exclua ou edite um perfil existente em vez disso.`,
      ),
      "criar perfil compartilhado",
    );
  }

  if (extraProfiles.some((profile) => profileType(profile) === type)) {
    return errorResponse(
      new Error(`Um perfil ${type} já existe. O Despezzas normalmente permite um perfil extra por tipo.`),
      "criar perfil compartilhado",
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
  return typeof item.category_id === "string" ? item.category_id : "sem categoria";
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

export const __test = {
  buildTransactionPayload,
  buildTransactionUpdatePayload,
  compactTransaction,
  compactTransactions,
  createTransactionIssues,
  emptyProfileWarning,
  prepareBatchUpdateTransactions,
  prepareCreateTransaction,
  prepareUpdateTransaction,
  profileContextFrom,
  summarizeFields,
  summarizeTransactions,
  toTransactionFilters,
  transactionSearchDiagnostics,
};
