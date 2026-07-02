# Despezzas MCP

Personal MCP server for [Despezzas](https://despezzas.com/) finance data. It exposes tools for ChatGPT-compatible MCP clients to list accounts, cards, categories, search transactions, summarize spending, and perform guarded write operations.

This is an MVP built from observed Despezzas web traffic and frontend bundle inspection. Despezzas does not appear to publish a public API, so keep this as a personal integration and expect endpoint details to change.

## What Is Implemented

- Read tools: profile, profile access, personal config, accounts, banks, credit cards, categories, subcategories, compact transaction search, overview, finance summary, and export/field diagnostics.
- Dry-run transaction tools: prepare create/update/delete payloads without calling Despezzas.
- Write tools: switch/create/update/delete/leave profile, create/update/delete account, credit card, transaction, transfer, duplicate transaction, toggle paid.
- Auth flow: copied bearer token, env email/password login, or local HTTP login page.
- Token refresh: saved Firebase refresh sessions are reused and refreshed automatically.
- Safety gate: every write/destructive tool requires `confirm: true`.
- Transports: local `stdio` and stateless Streamable HTTP at `/mcp`.
- Debugging: HAR inspector and DevTools request monitor for future endpoint captures.

Amounts use Despezzas native integer cents. Example: `12345` means `R$123.45`.

For transaction writes, use the prepare tools first:

1. Search/list the target account, card, category, subcategory, or transaction.
2. Call `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction`, or `despezzas_prepare_delete_transaction`.
3. Review the returned payload and target IDs.
4. Call the real write tool with the same fields and `confirm: true`.

`despezzas_create_transaction` intentionally refuses payloads with no account/card target, both account and card targets, or no `category_id` unless `allow_uncategorized` is explicitly true.

## Setup

```powershell
npm install
npm run build
Copy-Item .env.example .env
```

## Verification

```powershell
npm run typecheck
npm test
npm run smoke:readonly
```

`npm test` covers the local payload guards and diagnostics. `npm run smoke:readonly` builds the project and calls only read-only Despezzas endpoints using the configured token/session.

## Authentication

Preferred options:

1. Run HTTP mode and open `http://127.0.0.1:8787/login`.
2. Set `DESPEZZAS_EMAIL` and `DESPEZZAS_PASSWORD` in `.env`.
3. Set `DESPEZZAS_TOKEN` manually from browser devtools.

The login flow mirrors the Despezzas frontend:

1. `POST https://api.despezzas.com/v2/auth` with email/password.
2. Use the returned `firebase_token` with Firebase `accounts:signInWithCustomToken`.
3. Use Firebase `idToken` as `Authorization: Bearer ...` for `api.despezzas.com`.
4. Save the Firebase refresh token in `%USERPROFILE%\.despezzas-mcp\session.json` by default.

Set `DESPEZZAS_SESSION_FILE=none` to disable session persistence. If all auth methods fail, `despezzas_status` will tell you to open the login page or configure credentials.

Do not pass your password as an MCP tool argument. Tool arguments may be visible to the model/client. Use `.env` or the local `/login` page.

## Local MCP Config

For a local stdio MCP client:

```json
{
  "mcpServers": {
    "despezzas": {
      "command": "node",
      "args": ["C:\\Users\\guipm\\Documents\\despezzas-mcp\\dist\\index.js"],
      "env": {
        "DESPEZZAS_TOKEN": "paste-token-here"
      }
    }
  }
}
```

For development without building:

```powershell
npm run dev
```

## HTTP Mode

```powershell
$env:MCP_TRANSPORT = "http"
$env:PORT = "8787"
npm run dev:http
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Open the local login page:

```powershell
Start-Process http://127.0.0.1:8787/login
```

If you expose HTTP mode beyond localhost, put HTTPS and real access control in front of it. The `/login` page accepts your Despezzas password.

## ChatGPT OAuth Connection

For the ChatGPT Apps & Connectors “New App” screen:

1. Expose the MCP over HTTPS, for example:

   ```powershell
   npm run start:http
   ngrok http 8787
   ```

2. Set the public URL before starting the server:

   ```powershell
   $env:MCP_PUBLIC_BASE_URL = "https://your-ngrok-domain.ngrok.app"
   npm run start:http
   ```

3. In ChatGPT, use:

   - Server URL: `https://your-ngrok-domain.ngrok.app/mcp`
   - Authentication: `OAuth`

The server now exposes the discovery endpoints ChatGPT expects:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`

This OAuth layer protects the MCP connection. During authorization, the login page exchanges Despezzas email/password for a Despezzas/Firebase session server-side. ChatGPT receives only an opaque MCP access token.

`MCP_HTTP_BEARER_TOKEN` is still useful for non-ChatGPT scripts, but when it is omitted the `/mcp` endpoint requires a valid OAuth access token.

ChatGPT custom apps/connectors require a remote HTTPS MCP server endpoint. OpenAI’s Apps SDK docs describe MCP as the server layer required to expose tools to ChatGPT, and the “Connect from ChatGPT” guide uses an HTTPS endpoint for adding an MCP server. See:

- [Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart)
- [Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Authenticate users](https://developers.openai.com/apps-sdk/build/auth)
- [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [Building MCP servers for ChatGPT Apps and API integrations](https://developers.openai.com/api/docs/mcp)
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

## Remote Deployment

See [docs/deployment.md](docs/deployment.md) for the current free-hosting comparison and provider setup notes.

Included deployment files:

- `render.yaml` for Render Blueprints.
- `railway.json` for Railway.
- `vercel.json` and `api/index.js` for Vercel Functions.
- `Dockerfile` for Koyeb, Cloud Run, Fly.io, Northflank, Railway Docker deploys, or a VM.
- `horizon_proxy.py` and `requirements.txt` for Prefect Horizon as a FastMCP proxy in front of a deployed Node backend.

For remote long-running/container hosting, set `MCP_TRANSPORT=http`, `HOST=0.0.0.0`, and a stable `MCP_OAUTH_TOKEN_SECRET`. For Vercel or Cloud Run stateless hosting, set a stable `MCP_OAUTH_TOKEN_SECRET` and use env credentials with `DESPEZZAS_SESSION_FILE=none`. For Horizon, deploy the Node backend elsewhere and point `horizon_proxy.py:mcp` at that backend.

## HAR Inspection

When you capture more frontend actions:

```powershell
npm run inspect:har -- C:\path\to\despezzas.har
```

The script prints only `api.despezzas.com` calls and redacts common secrets. Useful actions to capture next:

- Pay/unpay bills and credit card invoices.
- Goals, spending limits, reports, investments, Open Finance connection management, and AI chat actions.
- Any profile edge case not covered by `despezzas_list_profiles` / `despezzas_switch_profile` / profile management tools.

If exporting a HAR is clunky, paste [scripts/request-monitor-devtools.js](scripts/request-monitor-devtools.js) into DevTools on `despezzas.com`, perform the action, then run:

```js
window.__despezzasMcpMonitor.download()
```

It exports a redacted JSON report of `api.despezzas.com` fetch/XHR calls.

## Reference MCPs

Implementation style was compared against:

- [SamuelMoraesF/mcp-organizze](https://github.com/SamuelMoraesF/mcp-organizze)
- [silviorodrigues/organizze-mcp](https://github.com/silviorodrigues/organizze-mcp)
- [WeslleyNasRocha/organizze-mcp](https://github.com/WeslleyNasRocha/organizze-mcp)

This repo keeps a similar shape but uses Despezzas-native endpoints and UUID IDs.
