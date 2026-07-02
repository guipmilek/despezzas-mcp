import { config } from "./config.js";

interface DespezzasAuthResponse {
  firebase_token?: string;
  user?: unknown;
  [key: string]: unknown;
}

interface FirebaseCustomTokenResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId?: string;
  email?: string;
}

interface FirebaseRefreshResponse {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id?: string;
  project_id?: string;
}

export interface AuthSession {
  idToken: string;
  refreshToken?: string;
  expiresAt?: number;
  user?: unknown;
  email?: string;
  updatedAt: string;
}

export interface AuthStatus {
  hasManualToken: boolean;
  hasEnvCredentials: boolean;
  hasSession: boolean;
  canRefresh: boolean;
  expiresAt?: string;
  sessionFile?: string;
}

export interface DespezzasAuthProvider {
  getToken(options?: { forceRefresh?: boolean }): Promise<string>;
  getStatus(): Promise<AuthStatus>;
}

export class AuthRequiredError extends Error {
  constructor(
    message = "Autenticação obrigatória. Abra a página de login do MCP ou configure DESPEZZAS_TOKEN ou DESPEZZAS_EMAIL/DESPEZZAS_PASSWORD/DESPEZZAS_FIREBASE_API_KEY.",
  ) {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class DespezzasAuthManager {
  private session: AuthSession | undefined;
  private loaded = false;
  private loginInFlight: Promise<string> | undefined;

  async getToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    const manualToken = config.token?.trim();
    if (manualToken && !options.forceRefresh && !isJwtExpiringSoon(manualToken)) {
      return manualToken;
    }

    await this.loadSession();

    if (this.session?.refreshToken && (options.forceRefresh || isExpiringSoon(this.session.expiresAt))) {
      return this.refreshWithSession(this.session.refreshToken);
    }

    if (this.session?.idToken && !isExpiringSoon(this.session.expiresAt)) {
      return this.session.idToken;
    }

    if (config.email && config.password) {
      return this.loginWithPassword(config.email, config.password);
    }

    if (manualToken && !options.forceRefresh) {
      return manualToken;
    }

    throw new AuthRequiredError();
  }

  async loginWithPassword(email: string, password: string): Promise<string> {
    if (!email || !password) {
      throw new AuthRequiredError("E-mail e senha são obrigatórios.");
    }

    if (this.loginInFlight) {
      return this.loginInFlight;
    }

    this.loginInFlight = this.doLoginWithPassword(email, password);
    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = undefined;
    }
  }

  async clearSession(): Promise<void> {
    this.session = undefined;
    this.loaded = true;

    if (config.sessionFile) {
      const fs = await import("node:fs/promises");
      await fs.rm(config.sessionFile, { force: true }).catch(() => undefined);
    }
  }

  async getStatus(): Promise<AuthStatus> {
    await this.loadSession();
    return {
      hasManualToken: Boolean(config.token),
      hasEnvCredentials: Boolean(config.email && config.password),
      hasSession: Boolean(this.session?.idToken),
      canRefresh: Boolean(config.firebaseApiKey && (this.session?.refreshToken || (config.email && config.password))),
      expiresAt: this.session?.expiresAt
        ? new Date(this.session.expiresAt).toISOString()
        : expirationFromJwt(config.token),
      sessionFile: config.sessionFile,
    };
  }

  private async doLoginWithPassword(email: string, password: string): Promise<string> {
    const session = await createDespezzasSessionFromPassword(email, password);
    await this.saveSession(session);
    return session.idToken;
  }

  private async refreshWithSession(refreshToken: string): Promise<string> {
    try {
      const session = await refreshDespezzasSession({ ...this.session, refreshToken } as AuthSession);
      await this.saveSession(session);
      return session.idToken;
    } catch (error) {
      await this.clearSession();
      if (config.email && config.password) {
        return this.loginWithPassword(config.email, config.password);
      }

      if (error instanceof AuthRequiredError) {
        throw error;
      }

      throw new AuthRequiredError("A sessão salva do Despezzas expirou. Abra a página de login do MCP novamente.");
    }
  }

  private async loadSession(): Promise<void> {
    if (this.loaded) {
      return;
    }

    this.loaded = true;
    if (!config.sessionFile) {
      return;
    }

    try {
      const fs = await import("node:fs/promises");
      const raw = await fs.readFile(config.sessionFile, "utf8");
      this.session = JSON.parse(raw) as AuthSession;
    } catch {
      this.session = undefined;
    }
  }

  private async saveSession(session: AuthSession): Promise<void> {
    this.session = session;

    if (!config.sessionFile) {
      return;
    }

    const fs = await import("node:fs/promises");
    await fs.mkdir(dirname(config.sessionFile), { recursive: true });
    await fs.writeFile(config.sessionFile, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }
}

export async function createDespezzasSessionFromPassword(email: string, password: string): Promise<AuthSession> {
  if (!email || !password) {
    throw new AuthRequiredError("E-mail e senha são obrigatórios.");
  }

  const firebaseApiKey = requireFirebaseApiKey();
  const response = await fetch(new URL("/v2/auth", config.apiBaseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: "https://despezzas.com",
      Referer: "https://despezzas.com/",
      lang: "pt-BR",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = (await readResponse(response)) as DespezzasAuthResponse;
  if (!response.ok) {
    throw new Error(apiErrorMessage(response.status, data, "Login no Despezzas falhou."));
  }

  if (!data.firebase_token || typeof data.firebase_token !== "string") {
    throw new Error("O login no Despezzas não retornou firebase_token.");
  }

  return exchangeCustomTokenForSession(firebaseApiKey, data.firebase_token, data.user, email);
}

export async function refreshDespezzasSession(session: AuthSession): Promise<AuthSession> {
  if (!session.refreshToken) {
    throw new AuthRequiredError("A sessão salva do Despezzas não tem refresh token.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: session.refreshToken,
  });
  const firebaseApiKey = requireFirebaseApiKey();

  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  const data = (await readResponse(response)) as FirebaseRefreshResponse;
  if (!response.ok) {
    throw new AuthRequiredError("A sessão salva do Despezzas expirou. Abra a página de login do MCP novamente.");
  }

  return {
    ...session,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in) * 1000,
    updatedAt: new Date().toISOString(),
  };
}

export function authSessionExpiresAt(session: AuthSession): string | undefined {
  return session.expiresAt ? new Date(session.expiresAt).toISOString() : expirationFromJwt(session.idToken);
}

export function isAuthSessionExpiringSoon(session: AuthSession): boolean {
  return isExpiringSoon(session.expiresAt) || isJwtExpiringSoon(session.idToken);
}

async function exchangeCustomTokenForSession(
  firebaseApiKey: string,
  customToken: string,
  user?: unknown,
  email?: string,
): Promise<AuthSession> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(firebaseApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );

  const data = (await readResponse(response)) as FirebaseCustomTokenResponse;
  if (!response.ok) {
    throw new Error(apiErrorMessage(response.status, data, "A troca do custom token do Firebase falhou."));
  }

  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn) * 1000,
    user,
    email: email ?? data.email,
    updatedAt: new Date().toISOString(),
  };
}

function requireFirebaseApiKey(): string {
  if (!config.firebaseApiKey) {
    throw new AuthRequiredError(
      "DESPEZZAS_FIREBASE_API_KEY é obrigatório para login por e-mail/senha e renovação de sessão Firebase.",
    );
  }

  return config.firebaseApiKey;
}

function dirname(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return ".";
  }
  return filePath.slice(0, index);
}

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function apiErrorMessage(status: number, data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    return `HTTP ${status}: ${String((data as { message: unknown }).message)}`;
  }

  if (data && typeof data === "object" && "error" in data) {
    return `HTTP ${status}: ${JSON.stringify((data as { error: unknown }).error)}`;
  }

  return `HTTP ${status}: ${fallback}`;
}

function isExpiringSoon(expiresAt: number | undefined): boolean {
  return !expiresAt || expiresAt - Date.now() < 5 * 60 * 1000;
}

function isJwtExpiringSoon(token: string): boolean {
  const expiresAt = jwtExpirationMs(token);
  return expiresAt ? isExpiringSoon(expiresAt) : false;
}

function expirationFromJwt(token: string | undefined): string | undefined {
  if (!token) return undefined;
  const expiresAt = jwtExpirationMs(token);
  return expiresAt ? new Date(expiresAt).toISOString() : undefined;
}

function jwtExpirationMs(token: string): number | undefined {
  const [, payload] = token.split(".");
  if (!payload) return undefined;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    ) as {
      exp?: unknown;
    };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export const authManager = new DespezzasAuthManager();
