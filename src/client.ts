import { AuthRequiredError, authManager, type DespezzasAuthProvider } from "./auth.js";
import { config } from "./config.js";
import type {
  AccountPayload,
  CreditCardPayload,
  DeleteScope,
  JsonObject,
  ProfileAccessPayload,
  ProfileAccessUpdatePayload,
  TransactionFilters,
  TransactionPayload,
  TransactionUpdatePayload,
  TransferPayload,
} from "./types.js";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class DespezzasApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "DespezzasApiError";
  }
}

export interface DespezzasClientOptions {
  baseUrl?: string;
  token?: string;
  auth?: DespezzasAuthProvider;
}

export class DespezzasClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly auth: DespezzasAuthProvider;

  constructor(options: DespezzasClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? config.apiBaseUrl).replace(/\/$/, "");
    this.token = options.token ?? config.token;
    this.auth = options.auth ?? authManager;
  }

  hasToken(): boolean {
    return Boolean(this.token);
  }

  async authStatus() {
    return this.auth.getStatus();
  }

  async getProfile() {
    return this.request<JsonObject>("/v1/profile");
  }

  async updateProfile(payload: JsonObject) {
    return this.request<JsonObject>("/v1/profile", "PUT", payload);
  }

  async listProfileAccess() {
    return this.request<JsonObject>("/v1/profile-access");
  }

  async changeProfile(profileId: string | null) {
    return this.request<JsonObject>("/v1/profile-access/change", "PUT", { profileId });
  }

  async createAccessProfile(payload: ProfileAccessPayload) {
    return this.request<JsonObject>("/v1/profile-access", "POST", payload);
  }

  async updateAccessProfile(id: string, payload: ProfileAccessUpdatePayload) {
    return this.request<JsonObject>(`/v1/profile-access/${encodeURIComponent(id)}`, "PUT", payload);
  }

  async deleteAccessProfile(id: string) {
    return this.request<null>(`/v1/profile-access/${encodeURIComponent(id)}`, "DELETE");
  }

  async leaveAccessProfile(profileId: string) {
    return this.request<JsonObject>("/v1/profile-access/leave", "PUT", { profileId });
  }

  async getPersonalConfig() {
    return this.request<JsonObject>("/v2/personal-config");
  }

  async getNotifications() {
    return this.request<unknown[]>("/v1/notifications");
  }

  async getAccounts() {
    return this.request<unknown[]>("/v1/accounts");
  }

  async createAccount(payload: AccountPayload) {
    return this.request<JsonObject>("/v1/accounts", "POST", payload);
  }

  async updateAccount(id: string, payload: Partial<AccountPayload>) {
    return this.request<JsonObject>(`/v1/accounts/${encodeURIComponent(id)}`, "PUT", payload);
  }

  async deleteAccount(id: string) {
    return this.request<null>(`/v1/accounts/${encodeURIComponent(id)}`, "DELETE");
  }

  async getBanks() {
    return this.request<JsonObject>("/v1/accounts/v3/list-banks");
  }

  async getCreditCards() {
    return this.request<unknown[]>("/v1/credit-card");
  }

  async createCreditCard(payload: CreditCardPayload) {
    return this.request<JsonObject>("/v1/credit-card", "POST", payload);
  }

  async updateCreditCard(id: string, payload: Partial<CreditCardPayload>) {
    return this.request<JsonObject>(`/v1/credit-card/${encodeURIComponent(id)}`, "PUT", payload);
  }

  async deleteCreditCard(id: string) {
    return this.request<null>(`/v1/credit-card/${encodeURIComponent(id)}`, "DELETE");
  }

  async getCategories(includeUser = false) {
    const [defaults, user] = await Promise.all([
      this.request<unknown[]>("/v1/categories"),
      includeUser ? this.request<unknown[]>("/v1/categories/user") : Promise.resolve([]),
    ]);
    return includeUser ? { defaults, user } : defaults;
  }

  async getSubcategories(includeUser = false) {
    const [defaults, user] = await Promise.all([
      this.request<unknown[]>("/v1/subcategories"),
      includeUser ? this.request<unknown[]>("/v1/subcategories/user") : Promise.resolve([]),
    ]);
    return includeUser ? { defaults, user } : defaults;
  }

  async getTransactions(filters: TransactionFilters = {}) {
    return this.request<unknown[]>("/v1/transactions", "GET", undefined, filters);
  }

  async getSubscriptions(filters: TransactionFilters = {}) {
    return this.request<unknown[]>("/v1/transactions/subscriptions", "GET", undefined, filters);
  }

  async createTransaction(payload: TransactionPayload) {
    return this.request<JsonObject>("/v1/transactions", "POST", payload);
  }

  async updateTransaction(id: string, payload: TransactionUpdatePayload) {
    return this.request<JsonObject>(`/v1/transactions/${encodeURIComponent(id)}`, "PUT", payload);
  }

  async deleteTransaction(id: string, type: DeleteScope = "THIS") {
    return this.request<null>(`/v1/transactions/${encodeURIComponent(id)}`, "DELETE", { type });
  }

  async duplicateTransaction(id: string) {
    return this.request<JsonObject>(`/v1/transactions/${encodeURIComponent(id)}/duplicate`, "POST");
  }

  async addInstallments(id: string, quantity: number) {
    return this.request<JsonObject>(`/v1/transactions/${encodeURIComponent(id)}/installments`, "POST", {
      quantity,
    });
  }

  async togglePaid(id: string, date: string) {
    return this.request<JsonObject>(`/v1/transactions/${encodeURIComponent(id)}/paid`, "POST", { date });
  }

  async createTransfer(payload: TransferPayload) {
    return this.request<JsonObject>("/v1/transactions/create-transfer", "POST", payload);
  }

  async getOverview(date: string) {
    return this.request<JsonObject>("/v1/transactions/overview", "GET", undefined, { date });
  }

  async countExportableTransactions(filters: TransactionFilters = {}) {
    return this.request<number>("/v1/export-transactions/count", "GET", undefined, filters);
  }

  async exportTransactions(filters: TransactionFilters = {}) {
    return this.request<JsonObject>("/v1/export-transactions", "GET", undefined, filters);
  }

  async raw(method: HttpMethod, path: string, query?: JsonObject, body?: unknown) {
    return this.request<unknown>(path, method, body, query);
  }

  private async request<T>(path: string, method: HttpMethod = "GET", body?: unknown, query?: JsonObject): Promise<T> {
    const url = new URL(path, this.baseUrl);
    appendQuery(url.searchParams, query);
    const token = await this.getAuthToken();
    let response = await this.fetchWithToken(url, method, token, body);

    if (response.status === 401) {
      const refreshedToken = await this.getAuthToken(true);
      response = await this.fetchWithToken(url, method, refreshedToken, body);
    }

    return readApiResponse<T>(response);
  }

  private async getAuthToken(forceRefresh = false): Promise<string> {
    if (this.token && !forceRefresh) {
      return this.token;
    }

    try {
      return await this.auth.getToken({ forceRefresh });
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        throw new Error(`${error.message} No modo HTTP, abra /login neste servidor MCP.`, { cause: error });
      }
      throw error;
    }
  }

  private async fetchWithToken(url: URL, method: HttpMethod, token: string, body?: unknown): Promise<Response> {
    return fetch(url, {
      method,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Origin: "https://despezzas.com",
        Referer: "https://despezzas.com/",
        lang: "pt-BR",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = parseBody(text);

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String((data as { message: unknown }).message)
        : text || response.statusText;
    throw new DespezzasApiError(`HTTP ${response.status}: ${message}`, response.status, data);
  }

  return data as T;
}

function parseBody(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function appendQuery(params: URLSearchParams, query?: JsonObject) {
  if (!query) {
    return;
  }

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
      continue;
    }

    params.set(key, typeof value === "boolean" ? String(value) : String(value));
  }
}
