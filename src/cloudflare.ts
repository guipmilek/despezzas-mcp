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
  MCP_OAUTH_TOKEN_SECRET?: string;
  MCP_OWNER_AUTH_CODE?: string;
  MCP_PUBLIC_BASE_URL?: string;
  SESSION_ENCRYPTION_KEY?: string;
}

type FormBody = Record<string, string | undefined>;

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
      "Cloudflare Workers should run with DESPEZZAS_SESSION_FILE=none.",
      process.env.MCP_OAUTH_TOKEN_SECRET
        ? "MCP_OAUTH_TOKEN_SECRET is configured."
        : "Set MCP_OAUTH_TOKEN_SECRET as a Wrangler secret before connecting ChatGPT.",
      multiUserConfigured
        ? "DESPEZZAS_SESSIONS KV and SESSION_ENCRYPTION_KEY are configured for per-user sessions."
        : "Set DESPEZZAS_SESSIONS KV and SESSION_ENCRYPTION_KEY for multi-user ChatGPT connections.",
      multiUserConfigured
        ? "Each ChatGPT OAuth login stores an encrypted Despezzas session for that user."
        : process.env.MCP_OWNER_AUTH_CODE
          ? "MCP_OWNER_AUTH_CODE is configured for single-account mode."
          : "Set MCP_OWNER_AUTH_CODE if you keep using single-account mode.",
    ],
  });
});

app.get("/auth/status", async (c) => {
  const { cloudflareSessionsConfigured } = await import("./cloudflareSessions.js");
  if (cloudflareSessionsConfigured(c.env)) {
    return c.json({
      authMode: "multi-user",
      hasSessionStorage: true,
      note: "Per-user auth status is available only inside an authorized MCP tool call.",
    });
  }

  const { authManager } = await import("./auth.js");
  return c.json(await authManager.getStatus());
});

app.get("/docs/oauth", async (c) => {
  const { mcpResource } = await import("./oauth.js");
  return c.html(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Despezzas MCP OAuth</title></head>
  <body>
    <h1>Despezzas MCP OAuth</h1>
    <p>This Cloudflare Worker uses OAuth 2.1 authorization code with PKCE to authorize ChatGPT access to the MCP endpoint.</p>
    <p>Resource: <code>${escapeHtml(mcpResource(requestLike(c.req.raw)))}</code></p>
    <p>Scopes: <code>despezzas:read despezzas:write</code></p>
    <p>ChatGPT receives an opaque MCP access token. Despezzas credentials and Firebase session tokens remain server-side.</p>
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
  return c.json(registerOAuthClient(await jsonOrForm(c.req.raw)), 201);
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
            : "Configure DESPEZZAS_SESSIONS and SESSION_ENCRYPTION_KEY for multi-user mode, or MCP_OWNER_AUTH_CODE for private single-account mode.",
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
    const message = error instanceof Error ? error.message : "Invalid authorization request.";
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
    const message = error instanceof Error ? error.message : "Authorization failed.";
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
  const { exchangeAuthorizationCode } = await import("./oauth.js");
  try {
    return c.json(exchangeAuthorizationCode(await jsonOrForm(c.req.raw), requestLike(c.req.raw)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Token request failed.";
    return c.json({ error: "invalid_grant", error_description: message }, 400);
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
          : "Configure DESPEZZAS_SESSIONS and SESSION_ENCRYPTION_KEY for multi-user mode, or MCP_OWNER_AUTH_CODE for private single-account mode.",
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
    const message = error instanceof Error ? error.message : "Login failed.";
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
  return c.html(renderLoginPage({ status: await authManager.getStatus(), success: "Sessao MCP removida." }));
});

app.all("/mcp", async (c) => {
  if (c.req.method !== "POST") {
    return methodNotAllowed();
  }

  const authorized = await authorizeMcpRequest(c.req.raw);
  if (authorized instanceof Response) {
    return authorized;
  }

  const { createServer } = await import("./server.js");
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createServer(await clientForAccess(c.env, authorized));

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw);

    if (!response.body) {
      c.executionCtx.waitUntil(closeMcp(server, transport));
      return response;
    }

    // The MCP SDK's SSE response streams the JSON-RPC result asynchronously
    // after handleRequest() returns; the body is not fully written yet at
    // this point. Closing the transport/server here (even via waitUntil)
    // races with that write and truncates the response to an empty body.
    // Tee the stream: one branch goes to the client, the other is drained
    // in the background so we only close once the response is fully sent.
    const [clientStream, monitorStream] = response.body.tee();
    c.executionCtx.waitUntil(drainThenClose(monitorStream, server, transport));
    return new Response(clientStream, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    console.error("Error handling Cloudflare MCP request:", error);
    c.executionCtx.waitUntil(closeMcp(server, transport));
    return c.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      },
      500,
    );
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
      error: { code: -32001, message: "Unauthorized" },
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

async function closeMcp(
  server: { close(): Promise<void> },
  transport: { close(): Promise<void> },
) {
  await Promise.allSettled([transport.close(), server.close()]);
}

async function drainThenClose(
  stream: ReadableStream<Uint8Array>,
  server: { close(): Promise<void> },
  transport: { close(): Promise<void> },
) {
  const reader = stream.getReader();
  try {
    // Consume the tee'd copy of the SSE stream so the transport can finish
    // writing the JSON-RPC response before we close it below. The other
    // branch of the tee (returned to the client) is unaffected by this.
    while (!(await reader.read()).done) {
      // no-op: draining only
    }
  } catch (error) {
    console.error("Error draining Cloudflare MCP stream before close:", error);
  } finally {
    reader.releaseLock();
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
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function methodNotAllowed() {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null,
    }),
    {
      status: 405,
      headers: { "Content-Type": "application/json" },
    },
  );
}
