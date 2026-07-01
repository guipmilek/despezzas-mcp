import crypto from "node:crypto";
import type { Request } from "express";
import { authManager } from "./auth.js";
import { config } from "./config.js";

const SCOPES = ["despezzas:read", "despezzas:write"];

interface RegisteredClient {
  clientId: string;
  redirectUris: string[];
  clientName?: string;
  createdAt: number;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  resource: string;
  expiresAt: number;
}

interface AccessToken {
  token: string;
  clientId: string;
  scope: string;
  resource: string;
  expiresAt: number;
}

interface AccessTokenClaims {
  v: 1;
  clientId: string;
  scope: string;
  resource: string;
  exp: number;
}

interface RegisteredClientClaims {
  v: 1;
  redirectUris: string[];
  clientName?: string;
  iat: number;
}

interface AuthorizationCodeClaims {
  v: 1;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  resource: string;
  exp: number;
}

const tokenSecret = config.oauthTokenSecret ?? randomToken(32);

class OAuthStore {
  private readonly clients = new Map<string, RegisteredClient>();
  private readonly codes = new Map<string, AuthorizationCode>();

  registerClient(input: { redirectUris: string[]; clientName?: string; clientId?: string }) {
    const createdAt = Date.now();
    const clientId =
      input.clientId ??
      signEnvelope("client", {
        v: 1,
        redirectUris: input.redirectUris,
        clientName: input.clientName,
        iat: Math.floor(createdAt / 1000),
      });
    const client: RegisteredClient = {
      clientId,
      redirectUris: input.redirectUris,
      clientName: input.clientName,
      createdAt,
    };
    this.clients.set(clientId, client);
    return client;
  }

  getClient(clientId: string): RegisteredClient | undefined {
    if (this.clients.has(clientId)) {
      return this.clients.get(clientId);
    }

    const signedClient = verifyEnvelope<RegisteredClientClaims>("client", clientId);
    if (
      signedClient?.v === 1 &&
      Array.isArray(signedClient.redirectUris) &&
      typeof signedClient.iat === "number"
    ) {
      return {
        clientId,
        redirectUris: signedClient.redirectUris.filter((value): value is string => typeof value === "string"),
        clientName: typeof signedClient.clientName === "string" ? signedClient.clientName : undefined,
        createdAt: signedClient.iat * 1000,
      };
    }

    if (isClientMetadataUrl(clientId)) {
      const client = this.registerClient({ clientId, redirectUris: [] });
      return client;
    }

    return undefined;
  }

  createCode(input: Omit<AuthorizationCode, "code" | "expiresAt">): AuthorizationCode {
    const expiresAt = Date.now() + 5 * 60 * 1000;
    const code: AuthorizationCode = {
      ...input,
      code: signEnvelope("code", {
        v: 1,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        codeChallengeMethod: input.codeChallengeMethod,
        scope: input.scope,
        resource: input.resource,
        exp: Math.floor(expiresAt / 1000),
      }),
      expiresAt,
    };
    this.codes.set(code.code, code);
    return code;
  }

  consumeCode(code: string): AuthorizationCode | undefined {
    const value = this.codes.get(code);
    this.codes.delete(code);

    if (value) {
      return value.expiresAt < Date.now() ? undefined : value;
    }

    const claims = verifyEnvelope<AuthorizationCodeClaims>("code", code);
    if (!isAuthorizationCodeClaims(claims) || claims.exp * 1000 < Date.now()) {
      return undefined;
    }

    return {
      code,
      clientId: claims.clientId,
      redirectUri: claims.redirectUri,
      codeChallenge: claims.codeChallenge,
      codeChallengeMethod: claims.codeChallengeMethod,
      scope: claims.scope,
      resource: claims.resource,
      expiresAt: claims.exp * 1000,
    };
  }

  issueAccessToken(input: Omit<AccessToken, "token" | "expiresAt">): AccessToken {
    const expiresAt = Date.now() + config.oauthAccessTokenTtlSeconds * 1000;
    const claims: AccessTokenClaims = {
      v: 1,
      clientId: input.clientId,
      scope: input.scope,
      resource: input.resource,
      exp: Math.floor(expiresAt / 1000),
    };

    const token: AccessToken = {
      ...input,
      token: signEnvelope("mcp", claims),
      expiresAt,
    };
    return token;
  }

  verifyAccessToken(token: string | undefined, requiredScopes = SCOPES): AccessToken | undefined {
    if (!token) {
      return undefined;
    }

    const claims = verifyEnvelope<AccessTokenClaims>("mcp", token);
    if (!isAccessTokenClaims(claims) || claims.exp * 1000 < Date.now()) {
      return undefined;
    }

    const granted = new Set(claims.scope.split(/\s+/).filter(Boolean));
    if (!requiredScopes.every((scope) => granted.has(scope))) {
      return undefined;
    }

    return {
      token,
      clientId: claims.clientId,
      scope: claims.scope,
      resource: claims.resource,
      expiresAt: claims.exp * 1000,
    };
  }
}

export const oauthStore = new OAuthStore();

export function publicBaseUrl(req: Request): string {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl;
  }

  const protocol = req.get("x-forwarded-proto") ?? req.protocol;
  return `${protocol}://${req.get("host")}`;
}

export function mcpResource(req: Request): string {
  return `${publicBaseUrl(req)}/mcp`;
}

export function resourceMetadataUrl(req: Request): string {
  return `${publicBaseUrl(req)}/.well-known/oauth-protected-resource`;
}

export function wwwAuthenticate(req: Request, scopes = SCOPES): string {
  return `Bearer resource_metadata="${resourceMetadataUrl(req)}", scope="${scopes.join(" ")}"`;
}

export function protectedResourceMetadata(req: Request) {
  const base = publicBaseUrl(req);
  return {
    resource: mcpResource(req),
    authorization_servers: [base],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/docs/oauth`,
  };
}

export function authorizationServerMetadata(req: Request) {
  const base = publicBaseUrl(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: SCOPES,
  };
}

export function registerOAuthClient(body: Record<string, unknown>) {
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((value): value is string => typeof value === "string")
    : [];

  const client = oauthStore.registerClient({
    redirectUris,
    clientName: typeof body.client_name === "string" ? body.client_name : undefined,
  });

  return {
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt / 1000),
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  };
}

export function validateAuthorizeParams(query: Record<string, unknown>) {
  const responseType = stringParam(query.response_type);
  const clientId = stringParam(query.client_id);
  const redirectUri = stringParam(query.redirect_uri);
  const codeChallenge = stringParam(query.code_challenge);
  const codeChallengeMethod = stringParam(query.code_challenge_method);
  const scope = normalizeScope(stringParam(query.scope));
  const state = stringParam(query.state);
  const resource = stringParam(query.resource);

  if (responseType !== "code") throw new Error("Unsupported response_type.");
  if (!clientId) throw new Error("Missing client_id.");
  if (!redirectUri) throw new Error("Missing redirect_uri.");
  if (!codeChallenge) throw new Error("Missing code_challenge.");
  if (codeChallengeMethod !== "S256") throw new Error("Only S256 PKCE is supported.");

  const client = oauthStore.getClient(clientId);
  if (!client) throw new Error("Unknown OAuth client.");
  if (client.redirectUris.length > 0 && !client.redirectUris.includes(redirectUri)) {
    throw new Error("redirect_uri is not registered for this client.");
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new Error("redirect_uri is not allowed.");
  }

  return {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    state,
    resource,
  };
}

export async function completeAuthorization(input: {
  email: string;
  password: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  resource: string;
  state?: string;
}) {
  await authManager.loginWithPassword(input.email, input.password);

  const code = oauthStore.createCode({
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scope: input.scope,
    resource: input.resource,
  });

  const redirect = new URL(input.redirectUri);
  redirect.searchParams.set("code", code.code);
  if (input.state) redirect.searchParams.set("state", input.state);
  return redirect.toString();
}

export function exchangeAuthorizationCode(body: Record<string, unknown>, req: Request) {
  const grantType = stringParam(body.grant_type);
  const code = stringParam(body.code);
  const redirectUri = stringParam(body.redirect_uri);
  const clientId = stringParam(body.client_id);
  const codeVerifier = stringParam(body.code_verifier);
  const resource = stringParam(body.resource) || mcpResource(req);

  if (grantType !== "authorization_code") throw new Error("Unsupported grant_type.");
  if (!code || !redirectUri || !clientId || !codeVerifier) throw new Error("Missing token request parameter.");

  const stored = oauthStore.consumeCode(code);
  if (!stored) throw new Error("Authorization code is invalid or expired.");
  if (stored.clientId !== clientId) throw new Error("client_id mismatch.");
  if (stored.redirectUri !== redirectUri) throw new Error("redirect_uri mismatch.");
  if (stored.resource && stored.resource !== resource) throw new Error("resource mismatch.");
  if (pkceChallenge(codeVerifier) !== stored.codeChallenge) throw new Error("PKCE verification failed.");

  const token = oauthStore.issueAccessToken({
    clientId,
    scope: stored.scope,
    resource,
  });

  return {
    access_token: token.token,
    token_type: "Bearer",
    expires_in: config.oauthAccessTokenTtlSeconds,
    scope: token.scope,
  };
}

function normalizeScope(scope: string | undefined): string {
  const requested = scope?.split(/\s+/).filter(Boolean) ?? SCOPES;
  const allowed = requested.filter((value) => SCOPES.includes(value));
  return (allowed.length > 0 ? allowed : SCOPES).join(" ");
}

function isAccessTokenClaims(value: AccessTokenClaims | undefined): value is AccessTokenClaims {
  return (
    value?.v === 1 &&
    typeof value.clientId === "string" &&
    typeof value.scope === "string" &&
    typeof value.resource === "string" &&
    typeof value.exp === "number"
  );
}

function isAuthorizationCodeClaims(value: AuthorizationCodeClaims | undefined): value is AuthorizationCodeClaims {
  return (
    value?.v === 1 &&
    typeof value.clientId === "string" &&
    typeof value.redirectUri === "string" &&
    typeof value.codeChallenge === "string" &&
    value.codeChallengeMethod === "S256" &&
    typeof value.scope === "string" &&
    typeof value.resource === "string" &&
    typeof value.exp === "number"
  );
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function randomToken(bytes: number): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function signEnvelope(prefix: string, claims: unknown): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  return `${prefix}_${payload}.${signature}`;
}

function verifyEnvelope<T>(prefix: string, token: string): T | undefined {
  if (!token.startsWith(`${prefix}_`)) {
    return undefined;
  }

  const [payload, signature] = token.slice(prefix.length + 1).split(".");
  if (!payload || !signature) {
    return undefined;
  }

  const expected = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  if (!timingSafeEqual(signature, expected)) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return undefined;
  }
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isClientMetadataUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
