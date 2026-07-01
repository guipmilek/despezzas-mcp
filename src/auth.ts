import fs from "node:fs/promises";
import path from "node:path";
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

interface AuthSession {
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

export class AuthRequiredError extends Error {
  constructor(message = "Authentication is required. Open the MCP login page or configure DESPEZZAS_TOKEN/DESPEZZAS_EMAIL.") {
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
      throw new AuthRequiredError("Email and password are required.");
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
      await fs.rm(config.sessionFile, { force: true }).catch(() => undefined);
    }
  }

  async getStatus(): Promise<AuthStatus> {
    await this.loadSession();
    return {
      hasManualToken: Boolean(config.token),
      hasEnvCredentials: Boolean(config.email && config.password),
      hasSession: Boolean(this.session?.idToken),
      canRefresh: Boolean(this.session?.refreshToken || (config.email && config.password)),
      expiresAt: this.session?.expiresAt ? new Date(this.session.expiresAt).toISOString() : expirationFromJwt(config.token),
      sessionFile: config.sessionFile,
    };
  }

  private async doLoginWithPassword(email: string, password: string): Promise<string> {
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
      throw new Error(apiErrorMessage(response.status, data, "Despezzas login failed."));
    }

    if (!data.firebase_token || typeof data.firebase_token !== "string") {
      throw new Error("Despezzas login did not return firebase_token.");
    }

    return this.exchangeCustomToken(data.firebase_token, data.user, email);
  }

  private async exchangeCustomToken(customToken: string, user?: unknown, email?: string): Promise<string> {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(config.firebaseApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );

    const data = (await readResponse(response)) as FirebaseCustomTokenResponse;
    if (!response.ok) {
      throw new Error(apiErrorMessage(response.status, data, "Firebase custom token exchange failed."));
    }

    const session: AuthSession = {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn) * 1000,
      user,
      email: email ?? data.email,
      updatedAt: new Date().toISOString(),
    };

    await this.saveSession(session);
    return data.idToken;
  }

  private async refreshWithSession(refreshToken: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.firebaseApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );

    const data = (await readResponse(response)) as FirebaseRefreshResponse;
    if (!response.ok) {
      await this.clearSession();
      if (config.email && config.password) {
        return this.loginWithPassword(config.email, config.password);
      }
      throw new AuthRequiredError("Saved Despezzas session expired. Open the MCP login page again.");
    }

    const session: AuthSession = {
      ...this.session,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Number(data.expires_in) * 1000,
      updatedAt: new Date().toISOString(),
    };

    await this.saveSession(session);
    return data.id_token;
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

    await fs.mkdir(path.dirname(config.sessionFile), { recursive: true });
    await fs.writeFile(config.sessionFile, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  }
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
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export const authManager = new DespezzasAuthManager();

