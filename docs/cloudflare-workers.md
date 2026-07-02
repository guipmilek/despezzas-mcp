# Cloudflare Workers Deployment

Cloudflare Workers is the preferred free remote host for this MCP right now. The repo includes a Worker-native entrypoint at `src/cloudflare.ts` and `wrangler.jsonc`.

This implementation follows Cloudflare's remote MCP guidance by using Streamable HTTP at `/mcp`. It uses the raw `WebStandardStreamableHTTPServerTransport` path rather than `McpAgent`, because the Despezzas tools are stateless per MCP request and the OAuth client/code/access-token state is signed with `MCP_OAUTH_TOKEN_SECRET`. That avoids a Durable Object requirement while keeping the door open for an `McpAgent` migration later if we need per-session durable state.

## Why This Fits

- Free Workers usage is enough for a personal finance MCP in normal use.
- No sleep/cold container boot like Koyeb Free or Render Free.
- HTTPS and `workers.dev` URL are built in.
- ChatGPT can connect directly to `https://<worker>.<account>.workers.dev/mcp`.
- Secrets are kept in Cloudflare bindings; ChatGPT receives only an opaque MCP OAuth access token.

Cloudflare Workers Free has daily limits, and Durable Objects are also available on Workers Free with the SQLite storage backend. This repo does not require Durable Objects yet.

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

Add Despezzas credentials as secrets:

```powershell
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
- For reliability, keep `DESPEZZAS_EMAIL` and `DESPEZZAS_PASSWORD` configured as secrets so the Worker can re-login after isolate restarts.
- The `/login` page still works, but without durable storage it should be treated as a test/manual authorization path.
- If a future version needs durable per-user sessions, migrate `src/cloudflare.ts` to Cloudflare `McpAgent` plus Durable Objects or store sessions in KV/D1 with encryption.
