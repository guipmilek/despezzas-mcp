# Cloudflare Workers Deployment

Cloudflare Workers is the preferred free remote host for this MCP right now. The repo includes a Worker-native entrypoint at `src/cloudflare.ts` and `wrangler.jsonc`.

This implementation follows Cloudflare's remote MCP guidance by using Streamable HTTP at `/mcp`. It uses the raw `WebStandardStreamableHTTPServerTransport` path rather than `McpAgent`, because the Despezzas tools are stateless per MCP request and the OAuth client/code/access-token state is signed with `MCP_OAUTH_TOKEN_SECRET`.

Cloudflare supports two modes:

- Multi-user mode: each ChatGPT user logs in with their own Despezzas account. The Worker stores that user's Firebase refresh session encrypted in Workers KV and binds the ChatGPT OAuth token to that session.
- Single-account mode: the Worker uses one Despezzas account from Worker secrets and protects authorization with `MCP_OWNER_AUTH_CODE`.

## Why This Fits

- Free Workers usage is enough for a personal finance MCP in normal use.
- No sleep/cold container boot like Koyeb Free or Render Free.
- HTTPS and `workers.dev` URL are built in.
- ChatGPT can connect directly to `https://<worker>.<account>.workers.dev/mcp`.
- In multi-user mode, Despezzas passwords are never stored. Only encrypted Firebase session tokens are stored in Workers KV.
- ChatGPT receives only an opaque MCP OAuth access token.

Cloudflare Workers Free has daily limits, and Workers KV is available on the Workers platform. Durable Objects are also available on Workers Free with the SQLite storage backend. This repo uses Workers KV for multi-user sessions.

## Before You Deploy

Rotate the Despezzas password that was pasted into the chat history before putting credentials in any cloud provider.

Install dependencies:

```powershell
npm install
```

Check TypeScript and the Worker bundle:

```powershell
npm run typecheck
npm run check:cloudflare
```

Login to Cloudflare:

```powershell
npx wrangler login
```

If this is the first Worker in the Cloudflare account, open Workers & Pages in the Cloudflare dashboard and register a `workers.dev` subdomain before deploying. Wrangler cannot choose that subdomain in non-interactive CI/CD builds.

## Configure Secrets

Create a stable OAuth signing secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Add it to Cloudflare:

```powershell
npx wrangler secret put MCP_OAUTH_TOKEN_SECRET
```

## Multi-User Mode

Use this mode if more than one person should connect their own Despezzas account to their own ChatGPT.

Create a KV namespace:

```powershell
npx wrangler kv namespace create DESPEZZAS_SESSIONS
```

Wrangler prints a `kv_namespaces` block. Paste the generated `id` into the commented `kv_namespaces` block in `wrangler.jsonc` and keep the binding name exactly:

```jsonc
{
  "binding": "DESPEZZAS_SESSIONS",
  "id": "generated-kv-id"
}
```

Create an encryption key:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Add it to Cloudflare:

```powershell
npx wrangler secret put SESSION_ENCRYPTION_KEY
```

For multi-user mode, do not set global Despezzas credentials. If you already added them for private testing, remove them:

```powershell
npx wrangler secret delete DESPEZZAS_EMAIL
npx wrangler secret delete DESPEZZAS_PASSWORD
```

Users will type their own Despezzas email/password during the ChatGPT OAuth connection. The Worker exchanges that password for Firebase tokens and stores only the encrypted Firebase session in KV.

## Single-Account Mode

Use this mode only when this Worker is for your own ChatGPT account and your own Despezzas account.

Create an owner access code. This is the code you type on the MCP login screen when ChatGPT connects, so only you can authorize ChatGPT to use the Despezzas account stored in the Worker secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

Add it and the Despezzas credentials to Cloudflare:

```powershell
npx wrangler secret put MCP_OWNER_AUTH_CODE
npx wrangler secret put DESPEZZAS_EMAIL
npx wrangler secret put DESPEZZAS_PASSWORD
```

Optional secrets:

```powershell
npx wrangler secret put DESPEZZAS_TOKEN
npx wrangler secret put MCP_HTTP_BEARER_TOKEN
```

Do not put Despezzas credentials in `wrangler.jsonc`. That file is committed to Git.

## Deploy

```powershell
npm run deploy:cloudflare
```

Wrangler will print a URL like:

```text
https://despezzas-mcp.<your-account>.workers.dev
```

Check health:

```powershell
Invoke-RestMethod https://despezzas-mcp.<your-account>.workers.dev/health
```

If deploy fails with `You need to register a workers.dev subdomain before publishing to workers.dev`, finish the Workers onboarding in Cloudflare, then rerun `npm run deploy:cloudflare`.

Open the login page if you want to test the Despezzas auth screen directly:

```text
https://despezzas-mcp.<your-account>.workers.dev/login
```

## Connect ChatGPT

In ChatGPT Apps / Custom Tool:

- Name: `Despezzas`
- Server URL: `https://despezzas-mcp.<your-account>.workers.dev/mcp`
- Authentication: `OAuth`

In multi-user mode, each user will see the Despezzas login form during OAuth and should enter their own Despezzas credentials. Their ChatGPT OAuth access token is bound to their encrypted KV session.

The Worker exposes the discovery endpoints ChatGPT expects:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`

## Custom Domain

The Worker usually infers its public URL from the incoming request. If you attach a custom domain and OAuth discovery returns the wrong base URL, set `MCP_PUBLIC_BASE_URL` in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "MCP_PUBLIC_BASE_URL": "https://mcp.your-domain.com"
  }
}
```

Then redeploy:

```powershell
npm run deploy:cloudflare
```

## Runtime Notes

- `DESPEZZAS_SESSION_FILE=none` is set in `wrangler.jsonc`; Workers do not provide a normal persistent filesystem.
- Multi-user mode requires `DESPEZZAS_SESSIONS` KV plus `SESSION_ENCRYPTION_KEY`.
- Single-account mode requires `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD`, and `MCP_OWNER_AUTH_CODE`.
- `MCP_OWNER_AUTH_CODE` is ignored when multi-user KV storage is configured.
- The `/login` page is mainly a test/manual authorization path. ChatGPT users should connect through ChatGPT OAuth.
- A future version could migrate from KV to `McpAgent` plus Durable Objects if we need richer per-session state.

## Trust Note

Despezzas does not provide official OAuth. In multi-user mode, users enter their Despezzas password into this MCP's login page. Run this only for people who trust the operator of the Worker. The implementation does not store raw passwords, but the Worker does receive them briefly to exchange them for Despezzas/Firebase session tokens.
