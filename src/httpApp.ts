import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { authManager } from "./auth.js";
import { config } from "./config.js";
import { renderLoginPage, renderLoginSuccessPage } from "./loginPage.js";
import {
  authorizationServerMetadata,
  completeAuthorization,
  exchangeAuthorizationCode,
  mcpResource,
  oauthStore,
  protectedResourceMetadata,
  registerOAuthClient,
  validateAuthorizeParams,
  wwwAuthenticate,
} from "./oauth.js";
import { ownerAuthCodeConfigured, requireOwnerAuthCode } from "./ownerAuth.js";
import { createServer } from "./server.js";

export function createHttpApp() {
  const app = createMcpExpressApp({ host: config.host, allowedHosts: config.allowedHosts });
  app.set("trust proxy", true);
  app.use(express.urlencoded({ extended: false }));

  app.get("/health", async (_req, res) => {
    const auth = await authManager.getStatus();
    res.json({
      ok: true,
      name: "despezzas-mcp",
      transport: "http",
      authConfigured: auth.hasManualToken || auth.hasEnvCredentials || auth.hasSession,
      auth,
    });
  });

  app.get("/auth/status", async (_req, res) => {
    res.json(await authManager.getStatus());
  });

  app.get("/docs/oauth", (req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Despezzas MCP OAuth</title></head>
  <body>
    <h1>Despezzas MCP OAuth</h1>
    <p>This MCP server uses OAuth 2.1 authorization code with PKCE to authorize ChatGPT access to the MCP endpoint.</p>
    <p>Resource: <code>${escapeHtml(mcpResource(req))}</code></p>
    <p>Scopes: <code>despezzas:read despezzas:write</code></p>
    <p>ChatGPT receives an opaque MCP access token. Despezzas credentials and Firebase session tokens remain server-side.</p>
  </body>
</html>`);
  });

  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    res.json(protectedResourceMetadata(req));
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
    res.json(protectedResourceMetadata(req));
  });

  app.get("/.well-known/oauth-authorization-server", (req, res) => {
    res.json(authorizationServerMetadata(req));
  });

  app.get("/.well-known/openid-configuration", (req, res) => {
    res.json(authorizationServerMetadata(req));
  });

  app.post("/oauth/register", (req, res) => {
    res.status(201).json(registerOAuthClient(req.body as Record<string, unknown>));
  });

  app.get("/oauth/authorize", async (req, res) => {
    try {
      const params = validateAuthorizeParams(req.query as Record<string, unknown>);
      res.type("html").send(
        renderLoginPage({
          status: await authManager.getStatus(),
          email: String(req.query.login_hint ?? config.email ?? ""),
          action: "/oauth/authorize",
          ownerCodeRequired: ownerAuthCodeConfigured(),
          hidden: {
            client_id: params.clientId,
            redirect_uri: params.redirectUri,
            code_challenge: params.codeChallenge,
            code_challenge_method: params.codeChallengeMethod,
            scope: params.scope,
            resource: params.resource || mcpResource(req),
            state: params.state,
          },
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid authorization request.";
      res.status(400).type("html").send(renderLoginPage({ error: message }));
    }
  });

  app.post("/oauth/authorize", async (req, res) => {
    try {
      if (ownerAuthCodeConfigured()) {
        requireOwnerAuthCode(typeof req.body.owner_code === "string" ? req.body.owner_code : undefined);
      }

      const redirect = await completeAuthorization({
        email: String(req.body.email ?? ""),
        password: String(req.body.password ?? ""),
        clientId: String(req.body.client_id ?? ""),
        redirectUri: String(req.body.redirect_uri ?? ""),
        codeChallenge: String(req.body.code_challenge ?? ""),
        codeChallengeMethod: "S256",
        scope: String(req.body.scope ?? "despezzas:read despezzas:write"),
        resource: String(req.body.resource ?? mcpResource(req)),
        state: typeof req.body.state === "string" ? req.body.state : undefined,
      });
      res.redirect(302, redirect);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authorization failed.";
      res.status(401).type("html").send(
        renderLoginPage({
          error: message,
          email: String(req.body.email ?? ""),
          action: "/oauth/authorize",
          ownerCodeRequired: ownerAuthCodeConfigured(),
          hidden: {
            client_id: String(req.body.client_id ?? ""),
            redirect_uri: String(req.body.redirect_uri ?? ""),
            code_challenge: String(req.body.code_challenge ?? ""),
            code_challenge_method: String(req.body.code_challenge_method ?? "S256"),
            scope: String(req.body.scope ?? ""),
            resource: String(req.body.resource ?? ""),
            state: typeof req.body.state === "string" ? req.body.state : undefined,
          },
        }),
      );
    }
  });

  app.post("/oauth/token", (req, res) => {
    try {
      res.json(exchangeAuthorizationCode(req.body as Record<string, unknown>, req));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token request failed.";
      res.status(400).json({ error: "invalid_grant", error_description: message });
    }
  });

  app.get("/login", async (req, res) => {
    const status = await authManager.getStatus();
    res.type("html").send(
      renderLoginPage({
        status,
        email: String(req.query.email ?? config.email ?? ""),
        ownerCodeRequired: ownerAuthCodeConfigured(),
      }),
    );
  });

  app.post("/login", async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    try {
      if (ownerAuthCodeConfigured()) {
        requireOwnerAuthCode(typeof req.body.owner_code === "string" ? req.body.owner_code : undefined);
      }

      await authManager.loginWithPassword(email, password);
      res.type("html").send(renderLoginSuccessPage(await authManager.getStatus()));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed.";
      res.status(401).type("html").send(
        renderLoginPage({
          status: await authManager.getStatus(),
          email,
          error: message,
          ownerCodeRequired: ownerAuthCodeConfigured(),
        }),
      );
    }
  });

  app.get("/logout", async (_req, res) => {
    await authManager.clearSession();
    res.type("html").send(renderLoginPage({ status: await authManager.getStatus(), success: "Sessao MCP removida." }));
  });

  app.use("/mcp", requireHttpBearer);

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    } finally {
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  });

  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  return app;
}

export function listenHttp() {
  const app = createHttpApp();
  app.listen(config.port, config.host, (error?: Error) => {
    if (error) {
      console.error("Failed to start HTTP MCP server:", error);
      process.exit(1);
    }

    console.error(`Despezzas MCP HTTP server listening at http://${config.host}:${config.port}/mcp`);
  });
}

function requireHttpBearer(req: Request, res: Response, next: NextFunction) {
  if (!config.httpBearerToken) {
    const oauthToken = bearerToken(req);
    if (oauthStore.verifyAccessToken(oauthToken)) {
      next();
      return;
    }

    res.setHeader("WWW-Authenticate", wwwAuthenticate(req));
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }

  const expected = `Bearer ${config.httpBearerToken}`;
  if (req.header("authorization") === expected || oauthStore.verifyAccessToken(bearerToken(req))) {
    next();
    return;
  }

  res.setHeader("WWW-Authenticate", wwwAuthenticate(req));
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
}

function bearerToken(req: Request): string | undefined {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function methodNotAllowed(_req: Request, res: Response) {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
    id: null,
  });
}
