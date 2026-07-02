import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import app from "../dist/cloudflare.js";
import { config } from "../dist/config.js";
import { oauthStore } from "../dist/oauth.js";

const env = {
  DESPEZZAS_SESSION_FILE: "none",
  MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS: "3600",
  MCP_OAUTH_TOKEN_SECRET: "test-secret",
};

describe("endpoints OAuth do Cloudflare", () => {
  it("retorna invalid_request para JSON malformado no registro dinâmico", async () => {
    const response = await app.request(
      "https://despezzas-mcp.example.test/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad-json",
      },
      env,
    );

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "invalid_request");
    assert.equal(typeof body.error_description, "string");
    assert.ok(body.error_description.length > 0);
  });

  it("registra um cliente OAuth com JSON válido", async () => {
    const response = await app.request(
      "https://despezzas-mcp.example.test/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://chatgpt.com/connector/oauth/test-callback"],
          client_name: "test-client",
        }),
      },
      env,
    );

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.match(body.client_id, /^client_/);
    assert.deepEqual(body.redirect_uris, ["https://chatgpt.com/connector/oauth/test-callback"]);
    assert.equal(body.token_endpoint_auth_method, "none");
    assert.deepEqual(body.grant_types, ["authorization_code", "refresh_token"]);
  });

  it("renova um token de acesso MCP expirado sem novo login de autorização", async () => {
    const previousAccessTtl = config.oauthAccessTokenTtlSeconds;
    const previousRefreshTtl = config.oauthRefreshTokenTtlSeconds;
    config.oauthAccessTokenTtlSeconds = 1;
    config.oauthRefreshTokenTtlSeconds = 3600;

    try {
      const clientId = "client-refresh-test";
      const redirectUri = "https://chatgpt.com/connector/oauth/test-callback";
      const resource = "https://despezzas-mcp.example.test/mcp";
      const codeVerifier = "refresh-test-verifier";
      const sessionId = "stored-session-id";
      const code = oauthStore.createCode({
        clientId,
        redirectUri,
        codeChallenge: crypto.createHash("sha256").update(codeVerifier).digest("base64url"),
        codeChallengeMethod: "S256",
        scope: "despezzas:read despezzas:write",
        resource,
        sessionId,
      });

      const firstResponse = await app.request(
        "https://despezzas-mcp.example.test/oauth/token",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code: code.code,
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: codeVerifier,
            resource,
          }),
        },
        env,
      );

      assert.equal(firstResponse.status, 200);
      const first = await firstResponse.json();
      assert.match(first.access_token, /^mcp_/);
      assert.match(first.refresh_token, /^refresh_/);
      assert.equal(first.expires_in, 1);
      assert.equal(oauthStore.verifyAccessToken(first.access_token)?.sessionId, sessionId);

      await sleep(1300);
      assert.equal(oauthStore.verifyAccessToken(first.access_token), undefined);

      const refreshResponse = await app.request(
        "https://despezzas-mcp.example.test/oauth/token",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: first.refresh_token,
            client_id: clientId,
            resource,
          }),
        },
        env,
      );

      assert.equal(refreshResponse.status, 200);
      const refreshed = await refreshResponse.json();
      assert.match(refreshed.access_token, /^mcp_/);
      assert.match(refreshed.refresh_token, /^refresh_/);
      assert.notEqual(refreshed.access_token, first.access_token);
      assert.equal(oauthStore.verifyAccessToken(refreshed.access_token)?.sessionId, sessionId);

      const publicClientRefreshResponse = await app.request(
        "https://despezzas-mcp.example.test/oauth/token",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: refreshed.refresh_token,
            resource,
          }),
        },
        env,
      );

      assert.equal(publicClientRefreshResponse.status, 200);
      const publicClientRefreshed = await publicClientRefreshResponse.json();
      assert.match(publicClientRefreshed.access_token, /^mcp_/);
      assert.match(publicClientRefreshed.refresh_token, /^refresh_/);
      assert.equal(oauthStore.verifyAccessToken(publicClientRefreshed.access_token)?.sessionId, sessionId);
    } finally {
      config.oauthAccessTokenTtlSeconds = previousAccessTtl;
      config.oauthRefreshTokenTtlSeconds = previousRefreshTtl;
    }
  });
});
