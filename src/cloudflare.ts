import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AccessToken } from "./oauth.js";

interface Env {
  DESPEZZAS_API_BASE_URL?: string;
  DESPEZZAS_EMAIL?: string;
  DESPEZZAS_FIREBASE_API_KEY?: string;
  DESPEZZAS_PASSWORD?: string;
  DESPEZZAS_SESSION_FILE?: string;
  DESPEZZAS_SESSIONS?: KVNamespace;
  DESPEZZAS_TOKEN?: string;
  MCP_ALLOWED_HOSTS?: string;
  MCP_HTTP_BEARER_TOKEN?: string;
  MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS?: string;
  MCP_OAUTH_REFRESH_TOKEN_TTL_SECONDS?: string;
  MCP_OAUTH_TOKEN_SECRET?: string;
  MCP_OWNER_AUTH_CODE?: string;
  MCP_PUBLIC_BASE_URL?: string;
  SESSION_ENCRYPTION_KEY?: string;
  VERSION_METADATA?: WorkerVersionMetadata;
}

type FormBody = Record<string, string | undefined>;
type McpRequestInfo = {
  mcp_method?: string | string[];
  tool_name?: string | string[];
  batch_size?: number;
  parse_error?: boolean;
};

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "mcp-session-id", "mcp-protocol-version"],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version", "WWW-Authenticate"],
  }),
);

app.use("*", async (c, next) => {
  applyWorkerEnv(c.env, c.req.raw);
  await next();
});

app.get("/health", async (c) => {
  const { authManager } = await import("./auth.js");
  const { cloudflareSessionsConfigured } = await import("./cloudflareSessions.js");
  const auth = await authManager.getStatus();
  const multiUserConfigured = cloudflareSessionsConfigured(c.env);
  return c.json({
    ok: true,
    name: "despezzas-mcp",
    transport: "cloudflare-workers",
    authMode: multiUserConfigured ? "multi-user" : "single-account",
    authConfigured: multiUserConfigured || auth.hasManualToken || auth.hasEnvCredentials || auth.hasSession,
    multiUserConfigured,
    auth,
    notes: [
      "Cloudflare Workers deve rodar com DESPEZZAS_SESSION_FILE=none.",
      process.env.MCP_OAUTH_TOKEN_SECRET
        ? "MCP_OAUTH_TOKEN_SECRET está configurado."
        : "Defina MCP_OAUTH_TOKEN_SECRET como secret do Wrangler antes de conectar o ChatGPT.",
      multiUserConfigured
        ? "DESPEZZAS_SESSIONS KV e SESSION_ENCRYPTION_KEY estão configurados para sessões por usuário."
        : "Defina DESPEZZAS_SESSIONS KV e SESSION_ENCRYPTION_KEY para conexões multiusuário do ChatGPT.",
      multiUserConfigured
        ? "Cada login OAuth do ChatGPT armazena uma sessão Despezzas criptografada para esse usuário."
        : process.env.MCP_OWNER_AUTH_CODE
          ? "MCP_OWNER_AUTH_CODE está configurado para modo conta única."
          : "Defina MCP_OWNER_AUTH_CODE se continuar usando modo conta única.",
    ],
  });
});

app.get("/auth/status", async (c) => {
  const { cloudflareSessionsConfigured } = await import("./cloudflareSessions.js");
  if (cloudflareSessionsConfigured(c.env)) {
    return c.json({
      authMode: "multi-user",
      hasSessionStorage: true,
      note: "O status de autenticação por usuário está disponível apenas dentro de uma chamada de ferramenta MCP autorizada.",
    });
  }

  const { authManager } = await import("./auth.js");
  return c.json(await authManager.getStatus());
});

app.get("/docs/oauth", async (c) => {
  const { mcpResource } = await import("./oauth.js");
  return c.html(`<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><title>Despezzas MCP OAuth</title></head>
  <body>
    <h1>Despezzas MCP OAuth</h1>
    <p>Este Cloudflare Worker usa código de autorização OAuth 2.1 com PKCE para autorizar o acesso do ChatGPT ao endpoint MCP.</p>
    <p>Recurso: <code>${escapeHtml(mcpResource(requestLike(c.req.raw)))}</code></p>
    <p>Escopos: <code>despezzas:read despezzas:write</code></p>
    <p>O ChatGPT recebe um token de acesso MCP opaco. Credenciais do Despezzas e tokens de sessão Firebase permanecem no lado do servidor.</p>
  </body>
</html>`);
});

app.get("/.well-known/oauth-protected-resource", async (c) => {
  const { protectedResourceMetadata } = await import("./oauth.js");
  return c.json(protectedResourceMetadata(requestLike(c.req.raw)));
});

app.get("/.well-known/oauth-protected-resource/mcp", async (c) => {
  const { protectedResourceMetadata } = await import("./oauth.js");
  return c.json(protectedResourceMetadata(requestLike(c.req.raw)));
});

app.get("/.well-known/oauth-authorization-server", async (c) => {
  const { authorizationServerMetadata } = await import("./oauth.js");
  return c.json(authorizationServerMetadata(requestLike(c.req.raw)));
});

app.get("/.well-known/openid-configuration", async (c) => {
  const { authorizationServerMetadata } = await import("./oauth.js");
  return c.json(authorizationServerMetadata(requestLike(c.req.raw)));
});

app.post("/oauth/register", async (c) => {
  const { registerOAuthClient } = await import("./oauth.js");
  try {
    return c.json(registerOAuthClient(await jsonOrForm(c.req.raw)), 201);
  } catch (error) {
    return oauthBadRequest(c, error, "Registro de cliente OAuth falhou.");
  }
});

app.get("/oauth/authorize", async (c) => {
  const { authManager } = await import("./auth.js");
  const { config } = await import("./config.js");
  const { mcpResource, validateAuthorizeParams } = await import("./oauth.js");
  const { ownerAuthCodeConfigured } = await import("./ownerAuth.js");
  const { cloudflareSessionsConfigured } = await import("./cloudflareSessions.js");
  const { renderLoginPage } = await import("./loginPage.js");

  try {
    const query = c.req.query();
    const params = validateAuthorizeParams(query);
    const multiUserConfigured = cloudflareSessionsConfigured(c.env);
    return c.html(
      renderLoginPage({
        status: await authManager.getStatus(),
        error:
          multiUserConfigured || ownerAuthCodeConfigured()
            ? undefined
            : "Configure DESPEZZAS_SESSIONS e SESSION_ENCRYPTION_KEY para modo multiusuário, ou MCP_OWNER_AUTH_CODE para modo privado de conta única.",
        email: String(query.login_hint ?? ""),
        action: "/oauth/authorize",
        ownerCodeRequired: !multiUserConfigured,
        credentialsOptional: !multiUserConfigured && Boolean(config.email && config.password),
        hidden: {
          client_id: params.clientId,
          redirect_uri: params.redirectUri,
          code_challenge: params.codeChallenge,
          code_challenge_method: params.codeChallengeMethod,
          scope: params.scope,
          resource: params.resource || mcpResource(requestLike(c.req.raw)),
          state: params.state,
        },
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Requisição de autorização inválida.";
    return c.html(renderLoginPage({ error: message }), 400);
  }
});

app.post("/oauth/authorize", async (c) => {
  const body = await formBody(c.req.raw);
  const { config } = await import("./config.js");
  const { createAuthorizationRedirect, completeAuthorization, mcpResource } = await import("./oauth.js");
  const { createDespezzasSessionFromPassword } = await import("./auth.js");
  const { cloudflareSessionsConfigured, createCloudflareSessionStore } = await import("./cloudflareSessions.js");
  const { requireOwnerAuthCode } = await import("./ownerAuth.js");
  const { renderLoginPage } = await import("./loginPage.js");
  const multiUserConfigured = cloudflareSessionsConfigured(c.env);

  try {
    const redirect = multiUserConfigured
      ? await completeMultiUserAuthorization(c.env, body, mcpResource(requestLike(c.req.raw)))
      : await completeSingleAccountAuthorization(body, mcpResource(requestLike(c.req.raw)));
    return c.redirect(redirect, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Autorização falhou.";
    return c.html(
      renderLoginPage({
        error: message,
        email: body.email ?? "",
        action: "/oauth/authorize",
        ownerCodeRequired: !multiUserConfigured,
        credentialsOptional: !multiUserConfigured && Boolean(config.email && config.password),
        hidden: {
          client_id: body.client_id,
          redirect_uri: body.redirect_uri,
          code_challenge: body.code_challenge,
          code_challenge_method: body.code_challenge_method ?? "S256",
          scope: body.scope,
          resource: body.resource,
          state: body.state,
        },
      }),
      401,
    );
  }

  async function completeMultiUserAuthorization(env: Env, input: FormBody, fallbackResource: string): Promise<string> {
    const session = await createDespezzasSessionFromPassword(input.email ?? "", input.password ?? "");
    const sessionId = await createCloudflareSessionStore(env).create(session);
    return createAuthorizationRedirect({
      clientId: input.client_id ?? "",
      redirectUri: input.redirect_uri ?? "",
      codeChallenge: input.code_challenge ?? "",
      codeChallengeMethod: "S256",
      scope: input.scope ?? "despezzas:read despezzas:write",
      resource: input.resource || fallbackResource,
      state: input.state,
      sessionId,
    });
  }

  async function completeSingleAccountAuthorization(input: FormBody, fallbackResource: string): Promise<string> {
    requireOwnerAuthCode(input.owner_code);
    return completeAuthorization({
      email: input.email || config.email || "",
      password: input.password || config.password || "",
      clientId: input.client_id ?? "",
      redirectUri: input.redirect_uri ?? "",
      codeChallenge: input.code_challenge ?? "",
      codeChallengeMethod: "S256",
      scope: input.scope ?? "despezzas:read despezzas:write",
      resource: input.resource || fallbackResource,
      state: input.state,
    });
  }
});

app.post("/oauth/token", async (c) => {
  const startedAt = Date.now();
  const { exchangeOAuthToken } = await import("./oauth.js");
  let body: Record<string, unknown> = {};
  try {
    body = await jsonOrForm(c.req.raw);
    const response = c.json(exchangeOAuthToken(body, requestLike(c.req.raw)));
    logOAuthTokenRequest(c.env, c.req.raw, body, response.status, startedAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Requisição de token falhou.";
    const response = c.json({ error: "invalid_grant", error_description: message }, 400);
    logOAuthTokenRequest(c.env, c.req.raw, body, response.status, startedAt, message);
    return response;
  }
});

app.get("/login", async (c) => {
  const { authManager } = await import("./auth.js");
  const { config } = await import("./config.js");
  const { cloudflareSessionsConfigured } = await import("./cloudflareSessions.js");
  const { ownerAuthCodeConfigured } = await import("./ownerAuth.js");
  const { renderLoginPage } = await import("./loginPage.js");
  const multiUserConfigured = cloudflareSessionsConfigured(c.env);
  return c.html(
    renderLoginPage({
      status: await authManager.getStatus(),
      error:
        multiUserConfigured || ownerAuthCodeConfigured()
          ? undefined
          : "Configure DESPEZZAS_SESSIONS e SESSION_ENCRYPTION_KEY para modo multiusuário, ou MCP_OWNER_AUTH_CODE para modo privado de conta única.",
      email: String(c.req.query("email") ?? ""),
      ownerCodeRequired: !multiUserConfigured,
      credentialsOptional: !multiUserConfigured && Boolean(config.email && config.password),
    }),
  );
});

app.post("/login", async (c) => {
  const body = await formBody(c.req.raw);
  const { authManager } = await import("./auth.js");
  const { config } = await import("./config.js");
  const { createDespezzasSessionFromPassword } = await import("./auth.js");
  const { cloudflareSessionsConfigured, createCloudflareSessionStore } = await import("./cloudflareSessions.js");
  const { requireOwnerAuthCode } = await import("./ownerAuth.js");
  const { renderLoginPage, renderLoginSuccessPage } = await import("./loginPage.js");
  const multiUserConfigured = cloudflareSessionsConfigured(c.env);

  try {
    if (multiUserConfigured) {
      const session = await createDespezzasSessionFromPassword(body.email ?? "", body.password ?? "");
      await createCloudflareSessionStore(c.env).create(session);
    } else {
      requireOwnerAuthCode(body.owner_code);
      await authManager.loginWithPassword(body.email || config.email || "", body.password || config.password || "");
    }
    return c.html(renderLoginSuccessPage(await authManager.getStatus()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login falhou.";
    return c.html(
      renderLoginPage({
        status: await authManager.getStatus(),
        email: body.email ?? "",
        error: message,
        ownerCodeRequired: !multiUserConfigured,
        credentialsOptional: !multiUserConfigured && Boolean(config.email && config.password),
      }),
      401,
    );
  }
});

app.get("/logout", async (c) => {
  const { authManager } = await import("./auth.js");
  const { renderLoginPage } = await import("./loginPage.js");
  await authManager.clearSession();
  return c.html(renderLoginPage({ status: await authManager.getStatus(), success: "Sessão MCP removida." }));
});

app.all("/mcp", async (c) => {
  const startedAt = Date.now();
  if (c.req.method !== "POST") {
    const response = methodNotAllowed();
    logMcpRequest(c.env, c.req.raw, {}, response.status, startedAt);
    return response;
  }

  const requestInfo = await mcpRequestInfo(c.req.raw);
  const authorized = await authorizeMcpRequest(c.req.raw);
  if (authorized instanceof Response) {
    logMcpRequest(c.env, c.req.raw, requestInfo, authorized.status, startedAt);
    return authorized;
  }

  const { createServer } = await import("./server.js");
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createServer(await clientForAccess(c.env, authorized));

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw);

    if (!response.body) {
      logMcpRequest(c.env, c.req.raw, requestInfo, response.status, startedAt);
      c.executionCtx.waitUntil(closeMcp(server, transport));
      return response;
    }

    // A resposta SSE do SDK MCP envia o resultado JSON-RPC de forma assíncrona
    // depois que handleRequest() retorna; neste ponto, o body ainda não foi
    // totalmente escrito. Fechar o transport/server aqui (mesmo via waitUntil)
    // disputa com essa escrita e trunca a resposta para um body vazio.
    // Duplicamos o stream: um ramo vai para o cliente, o outro é drenado em
    // segundo plano para fechar tudo apenas depois que a resposta for enviada.
    const [clientStream, monitorStream] = response.body.tee();
    c.executionCtx.waitUntil(
      drainThenClose(monitorStream, server, transport, () =>
        logMcpRequest(c.env, c.req.raw, requestInfo, response.status, startedAt),
      ),
    );
    return new Response(clientStream, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        event: "despezzas_mcp_error",
        path: new URL(c.req.raw.url).pathname,
        error: errorMessage,
        worker_version_id: c.env.VERSION_METADATA?.id,
        worker_version_tag: c.env.VERSION_METADATA?.tag,
      }),
    );
    c.executionCtx.waitUntil(closeMcp(server, transport));
    const response = c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Erro interno do servidor" },
        id: null,
      },
      500,
    );
    logMcpRequest(c.env, c.req.raw, requestInfo, response.status, startedAt, errorMessage);
    return response;
  }
});

export default app;

function applyWorkerEnv(env: Env, request: Request) {
  const origin = new URL(request.url).origin;
  const values: Record<string, string> = {
    MCP_TRANSPORT: "http",
    HOST: "0.0.0.0",
    PORT: "8787",
    DESPEZZAS_SESSION_FILE: env.DESPEZZAS_SESSION_FILE ?? "none",
    MCP_PUBLIC_BASE_URL: env.MCP_PUBLIC_BASE_URL ?? origin,
  };

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      values[key] = value;
    }
  }

  if (!values.MCP_ALLOWED_HOSTS) {
    values.MCP_ALLOWED_HOSTS = new URL(values.MCP_PUBLIC_BASE_URL).hostname;
  }

  Object.assign(process.env, values);
}

async function mcpRequestInfo(request: Request): Promise<McpRequestInfo> {
  try {
    const raw = await request.clone().text();
    if (!raw.trim()) {
      return {};
    }
    return mcpInfoFromJson(JSON.parse(raw));
  } catch {
    return { parse_error: true };
  }
}

function mcpInfoFromJson(value: unknown): McpRequestInfo {
  if (Array.isArray(value)) {
    const methods: string[] = [];
    const tools: string[] = [];
    for (const item of value) {
      const info = mcpInfoFromJson(item);
      if (typeof info.mcp_method === "string") {
        methods.push(info.mcp_method);
      }
      if (typeof info.tool_name === "string") {
        tools.push(info.tool_name);
      }
    }
    return dropUndefined({
      mcp_method: uniqueStrings(methods),
      tool_name: uniqueStrings(tools),
      batch_size: value.length,
    });
  }

  if (!isLogRecord(value)) {
    return {};
  }

  const method = stringValue(value.method);
  const params = isLogRecord(value.params) ? value.params : undefined;
  return dropUndefined({
    mcp_method: method,
    tool_name: method === "tools/call" ? stringValue(params?.name) : undefined,
  });
}

function logMcpRequest(
  env: Env,
  request: Request,
  info: McpRequestInfo,
  status: number,
  startedAt: number,
  error?: string,
) {
  const url = new URL(request.url);
  const entry = dropUndefined({
    event: "despezzas_mcp_request",
    path: url.pathname,
    http_method: request.method,
    mcp_method: info.mcp_method,
    tool_name: info.tool_name,
    batch_size: info.batch_size,
    parse_error: info.parse_error,
    status,
    duration_ms: Date.now() - startedAt,
    worker_version_id: env.VERSION_METADATA?.id,
    worker_version_tag: env.VERSION_METADATA?.tag,
    worker_version_timestamp: env.VERSION_METADATA?.timestamp,
    cf_ray: request.headers.get("cf-ray") ?? undefined,
    error,
  });
  console.log(JSON.stringify(entry));
}

function logOAuthTokenRequest(
  env: Env,
  request: Request,
  body: Record<string, unknown>,
  status: number,
  startedAt: number,
  error?: string,
) {
  const url = new URL(request.url);
  const entry = dropUndefined({
    event: "despezzas_oauth_token_request",
    path: url.pathname,
    http_method: request.method,
    grant_type: stringValue(body.grant_type),
    has_client_id: typeof body.client_id === "string" && body.client_id.length > 0,
    has_refresh_token: typeof body.refresh_token === "string" && body.refresh_token.length > 0,
    has_code: typeof body.code === "string" && body.code.length > 0,
    status,
    duration_ms: Date.now() - startedAt,
    worker_version_id: env.VERSION_METADATA?.id,
    worker_version_tag: env.VERSION_METADATA?.tag,
    worker_version_timestamp: env.VERSION_METADATA?.timestamp,
    cf_ray: request.headers.get("cf-ray") ?? undefined,
    error,
  });
  console.log(JSON.stringify(entry));
}

async function authorizeMcpRequest(request: Request): Promise<AccessToken | undefined | Response> {
  const { config } = await import("./config.js");
  const { oauthStore, wwwAuthenticate } = await import("./oauth.js");
  const token = bearerToken(request);

  if (config.httpBearerToken && request.headers.get("authorization") === `Bearer ${config.httpBearerToken}`) {
    return undefined;
  }

  const access = oauthStore.verifyAccessToken(token);
  if (access) {
    return access;
  }

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Não autorizado" },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": wwwAuthenticate(requestLike(request)),
      },
    },
  );
}

function oauthBadRequest(c: { json(body: unknown, status?: number): Response }, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return c.json({ error: "invalid_request", error_description: message }, 400);
}

async function clientForAccess(env: Env, access: AccessToken | undefined) {
  const { DespezzasClient } = await import("./client.js");
  if (!access?.sessionId) {
    return new DespezzasClient();
  }

  const { CloudflareSessionAuthProvider, createCloudflareSessionStore } = await import("./cloudflareSessions.js");
  return new DespezzasClient({
    auth: new CloudflareSessionAuthProvider(createCloudflareSessionStore(env), access.sessionId),
  });
}

async function closeMcp(server: { close(): Promise<void> }, transport: { close(): Promise<void> }) {
  await Promise.allSettled([transport.close(), server.close()]);
}

async function drainThenClose(
  stream: ReadableStream<Uint8Array>,
  server: { close(): Promise<void> },
  transport: { close(): Promise<void> },
  onDrained?: () => void,
) {
  const reader = stream.getReader();
  try {
    // Consome a cópia duplicada do stream SSE para que o transport termine de
    // escrever a resposta JSON-RPC antes do fechamento abaixo. O outro ramo
    // duplicado (retornado ao cliente) não é afetado por isso.
    while (!(await reader.read()).done) {
      // Sem ação: apenas drenando.
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "despezzas_mcp_stream_drain_error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  } finally {
    reader.releaseLock();
    onDrained?.();
  }

  await closeMcp(server, transport);
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length);
}

function requestLike(request: Request) {
  const url = new URL(request.url);
  return {
    protocol: url.protocol.replace(/:$/, ""),
    get(name: string) {
      if (name.toLowerCase() === "host") {
        return request.headers.get("host") ?? url.host;
      }
      return request.headers.get(name) ?? undefined;
    },
  };
}

function uniqueStrings(values: string[]): string | string[] | undefined {
  const unique = [...new Set(values)].slice(0, 20);
  if (unique.length === 0) {
    return undefined;
  }
  return unique.length === 1 ? unique[0] : unique;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isLogRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) {
      output[key] = child;
    }
  }
  return output as T;
}

async function jsonOrForm(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }
  return formBody(request);
}

async function formBody(request: Request): Promise<FormBody> {
  const form = await request.formData();
  const body: FormBody = {};
  for (const [key, value] of form.entries()) {
    body[key] = typeof value === "string" ? value : undefined;
  }
  return body;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function methodNotAllowed() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Método não permitido" },
      id: null,
    }),
    {
      status: 405,
      headers: { "Content-Type": "application/json" },
    },
  );
}
