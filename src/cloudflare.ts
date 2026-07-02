import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface Env {
  DESPEZZAS_API_BASE_URL?: string;
  DESPEZZAS_EMAIL?: string;
  DESPEZZAS_FIREBASE_API_KEY?: string;
  DESPEZZAS_PASSWORD?: string;
  DESPEZZAS_SESSION_FILE?: string;
  DESPEZZAS_TOKEN?: string;
  MCP_ALLOWED_HOSTS?: string;
  MCP_HTTP_BEARER_TOKEN?: string;
  MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS?: string;
  MCP_OAUTH_TOKEN_SECRET?: string;
  MCP_OWNER_AUTH_CODE?: string;
  MCP_PUBLIC_BASE_URL?: string;
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
  const auth = await authManager.getStatus();
  return c.json({
    ok: true,
    name: "despezzas-mcp",
    transport: "cloudflare-workers",
    authConfigured: auth.hasManualToken || auth.hasEnvCredentials || auth.hasSession,
    auth,
    notes: [
      "Cloudflare Workers should run with DESPEZZAS_SESSION_FILE=none.",
      process.env.MCP_OAUTH_TOKEN_SECRET
        ? "MCP_OAUTH_TOKEN_SECRET is configured."
        : "Set MCP_OAUTH_TOKEN_SECRET as a Wrangler secret before connecting ChatGPT.",
      process.env.MCP_OWNER_AUTH_CODE
        ? "MCP_OWNER_AUTH_CODE is configured."
        : "Set MCP_OWNER_AUTH_CODE as a Wrangler secret so only you can authorize ChatGPT.",
    ],
  });
});

app.get("/auth/status", async (c) => {
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
  const { renderLoginPage } = await import("./loginPage.js");

  try {
    const query = c.req.query();
    const params = validateAuthorizeParams(query);
    return c.html(
      renderLoginPage({
        status: await authManager.getStatus(),
        error: ownerAuthCodeConfigured() ? undefined : "Configure MCP_OWNER_AUTH_CODE before authorizing ChatGPT.",
        email: String(query.login_hint ?? ""),
        action: "/oauth/authorize",
        ownerCodeRequired: true,
        credentialsOptional: Boolean(config.email && config.password),
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
  const { completeAuthorization, mcpResource } = await import("./oauth.js");
  const { requireOwnerAuthCode } = await import("./ownerAuth.js");
  const { renderLoginPage } = await import("./loginPage.js");

  try {
    requireOwnerAuthCode(body.owner_code);
    const redirect = await completeAuthorization({
      email: body.email || config.email || "",
      password: body.password || config.password || "",
      clientId: body.client_id ?? "",
      redirectUri: body.redirect_uri ?? "",
      codeChallenge: body.code_challenge ?? "",
      codeChallengeMethod: "S256",
      scope: body.scope ?? "despezzas:read despezzas:write",
      resource: body.resource || mcpResource(requestLike(c.req.raw)),
      state: body.state,
    });
    return c.redirect(redirect, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authorization failed.";
    return c.html(
      renderLoginPage({
        error: message,
        email: body.email ?? "",
        action: "/oauth/authorize",
        ownerCodeRequired: true,
        credentialsOptional: Boolean(config.email && config.password),
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
  const { ownerAuthCodeConfigured } = await import("./ownerAuth.js");
  const { renderLoginPage } = await import("./loginPage.js");
  return c.html(
    renderLoginPage({
      status: await authManager.getStatus(),
      error: ownerAuthCodeConfigured() ? undefined : "Configure MCP_OWNER_AUTH_CODE before using this public login page.",
      email: String(c.req.query("email") ?? ""),
      ownerCodeRequired: true,
      credentialsOptional: Boolean(config.email && config.password),
    }),
  );
});

app.post("/login", async (c) => {
  const body = await formBody(c.req.raw);
  const { authManager } = await import("./auth.js");
  const { config } = await import("./config.js");
  const { requireOwnerAuthCode } = await import("./ownerAuth.js");
  const { renderLoginPage, renderLoginSuccessPage } = await import("./loginPage.js");

  try {
    requireOwnerAuthCode(body.owner_code);
    await authManager.loginWithPassword(body.email || config.email || "", body.password || config.password || "");
    return c.html(renderLoginSuccessPage(await authManager.getStatus()));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    return c.html(
      renderLoginPage({
        status: await authManager.getStatus(),
        email: body.email ?? "",
        error: message,
        ownerCodeRequired: true,
        credentialsOptional: Boolean(config.email && config.password),
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

  const unauthorized = await unauthorizedMcpResponse(c.req.raw);
  if (unauthorized) {
    return unauthorized;
  }

  const { createServer } = await import("./server.js");
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createServer();

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw);
    c.executionCtx.waitUntil(closeMcp(server, transport));
    return response;
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

async function unauthorizedMcpResponse(request: Request): Promise<Response | undefined> {
  const { config } = await import("./config.js");
  const { oauthStore, wwwAuthenticate } = await import("./oauth.js");
  const token = bearerToken(request);

  if (config.httpBearerToken && request.headers.get("authorization") === `Bearer ${config.httpBearerToken}`) {
    return undefined;
  }

  if (oauthStore.verifyAccessToken(token)) {
    return undefined;
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

async function closeMcp(
  server: { close(): Promise<void> },
  transport: { close(): Promise<void> },
) {
  await Promise.allSettled([transport.close(), server.close()]);
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
