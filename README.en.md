<!-- ===== HEADER ===== -->
<p align="right">
  <img
    src="https://img.shields.io/badge/lang-en-green?style=flat-square&amp;labelColor=202024"
    alt="lang-en"
  />
  <a href="./README.md" title="Ler o README em português brasileiro"><img src="https://img.shields.io/badge/lang-pt--br-gray?style=flat-square&amp;labelColor=202024" alt="lang-pt-br" /></a>
</p>

<p align="center">
  <img
    src="./assets/despezzas-mcp.png"
    alt="Despezzas MCP logo"
    width="120"
  />
</p>

<h1 id="top" align="center">Despezzas MCP</h1>

<p align="center">
  <img
    src="https://img.shields.io/badge/languages-4-04D361?style=flat-square&amp;labelColor=202024"
    alt="Repository language count"
  />
  <img
    src="https://img.shields.io/badge/repo%20size-207%20KiB-007ec6?style=flat-square&amp;labelColor=202024"
    alt="Repository size"
  />
  <img
    src="https://img.shields.io/github/commit-activity/m/guipmilek/despezzas-mcp?style=flat-square&amp;color=black&amp;labelColor=202024"
    alt="Commit activity"
  />
  <a href="https://github.com/guipmilek/despezzas-mcp/commits/main" title="View repository commits"><img src="https://img.shields.io/badge/last%20commit-today-4b0?style=flat-square&amp;labelColor=202024" alt="Last commit" /></a>
  <a href="./LICENSE" title="View project license"><img src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square&amp;labelColor=202024" alt="Project license" /></a>
  <img
    src="https://img.shields.io/badge/Node.js-%3E%3D20-233056?style=flat-square&amp;logo=node.js&amp;logoColor=white&amp;labelColor=202024"
    alt="Node.js >= 20"
  />
</p>

<p align="center">
  Unofficial MCP server for connecting Despezzas financial data to MCP-compatible clients, including ChatGPT.
</p>

<details>
  <summary>
    <h2>📒 Table of Contents</h2>
  </summary>

- [📍 Overview](#-overview)
- [⚡ Quick Start](#-quick-start)
- [✨ Features](#-features)
- [🧰 Tool Catalog](#-tool-catalog)
- [🛠 Technologies](#-technologies)
  - [MCP Server](#mcp-server)
  - [Deploy](#deploy)
  - [Tooling](#tooling)
- [🚀 Getting Started](#-getting-started)
  - [📦 Setup](#-setup)
  - [✔️ Verification](#️-verification)
- [📋 Environment Variables](#-environment-variables)
- [🔐 Authentication](#-authentication)
- [🖥 Local MCP Configuration](#-local-mcp-configuration)
- [🌐 HTTP Mode](#-http-mode)
- [🤖 ChatGPT OAuth Connection](#-chatgpt-oauth-connection)
- [☁️ Remote Deploy](#️-remote-deploy)
- [🔎 HAR Inspection](#-har-inspection)
- [📚 Reference MCPs](#-reference-mcps)
- [🗺 Roadmap](#-roadmap)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
</details>

<!-- ===== PROJECT INFOS ===== -->

## 📍 Overview

Personal MCP server for financial data from [Despezzas](https://despezzas.com/). It exposes tools for MCP-compatible clients, including ChatGPT, to list accounts, credit cards, categories, search transactions, summarize spending, and run protected write operations.

This is an open-source MIT-licensed project built from observed Despezzas Web traffic and frontend bundle inspection. Despezzas does not appear to publish a public API, so treat this as an unofficial personal integration and expect endpoint details to change.

> [!WARNING]
> Despezzas does not publish an official public API for this integration. Endpoints, fields, and login flows may change without notice.

> [!IMPORTANT]
> This MCP can read and change personal financial data. Never commit `.env`, tokens, passwords, sessions, unredacted HARs, or real API responses.

| Item | Value |
| --- | --- |
| **Status** | Functional MVP for personal use |
| **API** | Unofficial integration with Despezzas endpoints |
| **Runtime** | Node.js `>=20` |
| **Transports** | `stdio`, Node HTTP, Cloudflare Workers |
| **Authentication** | Bearer token, email/password, MCP OAuth |
| **Recommended deploy** | Cloudflare Workers |

## ⚡ Quick Start

```powershell
npm install
npm run build
Copy-Item .env.example .env
npm run dev
```

Then configure one authentication option in `.env`: `DESPEZZAS_TOKEN` or `DESPEZZAS_EMAIL` / `DESPEZZAS_PASSWORD` / `DESPEZZAS_FIREBASE_API_KEY`.

## ✨ Features

📖 **Read tools:** profile, profile access, personal configuration, accounts, banks, credit cards, categories, subcategories, compact transaction search, overview, financial summaries, and export/field diagnostics.

🧾 **Transaction preview tools:** prepare create/update/delete payloads without calling Despezzas.

✍️ **Write tools:** switch/create/update/delete/leave profile, create/update/delete account, credit card, transaction, transfer, duplicate transaction, and toggle paid status.

🔐 **Authentication:** copied bearer token, email/password login through environment variables, or HTTP MCP authorization page.

🔄 **Token refresh:** saved Firebase sessions are reused and refreshed automatically.

🛡 **Safety guard:** every write/destructive tool requires `confirm: true`.

🔌 **Transports:** local `stdio`, Streamable HTTP on Node at `/mcp`, and Streamable HTTP on Cloudflare Workers at `/mcp`.

🔎 **Debugging:** HAR inspector and DevTools request monitor for capturing future endpoints.

Amounts use Despezzas native integer cents. Example: `12345` means `R$123.45`.

For transaction writes, use the prepare tools first:

1. Search/list the target account, card, category, subcategory, or transaction.
2. Call `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction`, or `despezzas_prepare_delete_transaction`.
3. Review the returned payload and target IDs.
4. Call the real write tool with the same fields and `confirm: true`.

`despezzas_create_transaction` intentionally rejects payloads without an account/card destination, with both account and card at the same time, or without `category_id`, unless `allow_uncategorized` is explicitly `true`.

## 🧰 Tool Catalog

| Group | Examples | Writes? | Note |
| --- | --- | --- | --- |
| **Status and profile** | `despezzas_status`, `despezzas_profile`, `despezzas_list_profiles` | Partial | Switching/creating/deleting profiles requires `confirm: true`. |
| **Accounts and cards** | `despezzas_list_accounts`, `despezzas_list_credit_cards`, `despezzas_create_account` | Partial | Writes validate IDs and confirmation. |
| **Categories** | `despezzas_list_categories`, `despezzas_list_subcategories` | No | Use before creating/updating transactions. |
| **Transactions** | `despezzas_search_transactions`, `despezzas_create_transaction`, `despezzas_update_transaction` | Partial | Creation requires destination, category, or `allow_uncategorized`. |
| **Preview** | `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction` | No | Recommended path before any write. |
| **Diagnostics** | `despezzas_export_fields_diagnostics`, `despezzas_raw_request` | Partial | Use carefully; responses are redacted when possible. |

## 🛠 Technologies

Main tools used in this project:

### MCP Server

<p>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-white?style=for-the-badge&amp;logo=TypeScript" alt="TypeScript" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-233056?style=for-the-badge&amp;logo=node.js&amp;logoColor=white" alt="Node.js" /></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/Model_Context_Protocol-202024?style=for-the-badge" alt="Model Context Protocol" /></a>
  <a href="https://expressjs.com/"><img src="https://img.shields.io/badge/Express-111111?style=for-the-badge&amp;logo=express&amp;logoColor=white" alt="Express" /></a>
  <a href="https://hono.dev/"><img src="https://img.shields.io/badge/Hono-e36002?style=for-the-badge" alt="Hono" /></a>
  <a href="https://github.com/colinhacks/zod"><img src="https://img.shields.io/badge/Zod-3068b7?style=for-the-badge&amp;logo=zod&amp;logoColor=white" alt="Zod" /></a>
</p>

### Deploy

<p>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare_Workers-f38020?style=for-the-badge&amp;logo=cloudflare&amp;logoColor=202024" alt="Cloudflare Workers" /></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-white?style=for-the-badge&amp;logo=docker" alt="Docker" /></a>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-0a0a0a?style=for-the-badge&amp;logo=vercel&amp;logoColor=white" alt="Vercel" /></a>
  <a href="https://render.com/"><img src="https://img.shields.io/badge/Render-111111?style=for-the-badge&amp;logo=render&amp;logoColor=white" alt="Render" /></a>
</p>

### Tooling

<p>
  <a href="https://git-scm.com/"><img src="https://img.shields.io/badge/Git-f1f1e9?style=for-the-badge&amp;logo=git" alt="Git" /></a>
  <a href="https://www.npmjs.com/"><img src="https://img.shields.io/badge/npm-cb3837?style=for-the-badge&amp;logo=npm&amp;logoColor=white" alt="npm" /></a>
  <a href="https://developers.cloudflare.com/workers/wrangler/"><img src="https://img.shields.io/badge/Wrangler-f38020?style=for-the-badge&amp;logo=cloudflare&amp;logoColor=202024" alt="Wrangler" /></a>
</p>

_* See [<kbd>package.json</kbd>](./package.json) for the full dependency list._

## 🚀 Getting Started

### 📦 Setup

```powershell
npm install
npm run build
Copy-Item .env.example .env
```

### ✔️ Verification

```powershell
npm run typecheck
npm test
npm run smoke:readonly
```

`npm test` covers local payload protections and diagnostics. `npm run smoke:readonly` builds the project and calls only read-only Despezzas endpoints using the configured token/session.

## 📋 Environment Variables

| Variable | Required? | Used For |
| --- | --- | --- |
| `DESPEZZAS_TOKEN` | Optional | Manual bearer token copied from a web session. |
| `DESPEZZAS_EMAIL` | Optional | Email/password login. |
| `DESPEZZAS_PASSWORD` | Optional | Email/password login. |
| `DESPEZZAS_FIREBASE_API_KEY` | For email/password | Firebase custom token exchange and refresh. |
| `DESPEZZAS_SESSION_FILE` | Optional | Persisted session path; use `none` to disable. |
| `MCP_TRANSPORT` | Optional | `stdio` or `http`; default `stdio`. |
| `HOST` / `PORT` | Optional | HTTP server bind; default `127.0.0.1:8787`. |
| `MCP_PUBLIC_BASE_URL` | Production/OAuth | Public HTTPS URL for OAuth metadata. |
| `MCP_OAUTH_TOKEN_SECRET` | Recommended | Stable signing secret for MCP OAuth tokens. |
| `MCP_OWNER_AUTH_CODE` | Private deploy | Owner code for single-account authorizations. |
| `SESSION_ENCRYPTION_KEY` | Cloudflare multi-user | Workers KV session encryption. |

## 🔐 Authentication

Preferred options:

1. Run HTTP mode and open `http://127.0.0.1:8787/login`.
2. Set `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD`, and `DESPEZZAS_FIREBASE_API_KEY` in `.env`.
3. Set `DESPEZZAS_TOKEN` manually from browser DevTools.

The `/login` page uses the Despezzas visual identity, follows the system light/dark theme, and contains only the fields this MCP needs: email, password, and, when configured, owner access code. Account creation and password recovery still belong in the official Despezzas app/site.

The login flow mirrors the Despezzas frontend:

1. `POST https://api.despezzas.com/v2/auth` with email/password.
2. Uses the returned `firebase_token` with Firebase `accounts:signInWithCustomToken` using `DESPEZZAS_FIREBASE_API_KEY`.
3. Uses the Firebase `idToken` as `Authorization: Bearer ...` on `api.despezzas.com`.
4. Saves the Firebase refresh token to `%USERPROFILE%\.despezzas-mcp\session.json` by default.

| Step | Source | Target | Result |
| --- | --- | --- | --- |
| 1 | User | MCP `/login` | Sends email and password for local authorization. |
| 2 | MCP | Despezzas API | Exchanges credentials for `firebase_token`. |
| 3 | MCP | Firebase | Exchanges `firebase_token` for `idToken` and `refreshToken`. |
| 4 | MCP | MCP Client/ChatGPT | Returns an opaque MCP OAuth token. |

Set `DESPEZZAS_SESSION_FILE=none` to disable session persistence. If every authentication method fails, `despezzas_status` will tell you to open the login page or configure credentials.

Do not pass your password as an MCP tool argument. Tool arguments may be visible to the model/client. Use `.env` or the local `/login` page.

## 🖥 Local MCP Configuration

For a local MCP client over stdio:

```json
{
  "mcpServers": {
    "despezzas": {
      "command": "node",
      "args": ["C:\\path\\to\\despezzas-mcp\\dist\\index.js"],
      "env": {
        "DESPEZZAS_TOKEN": "paste-token-here"
      }
    }
  }
}
```

For development without compiling:

```powershell
npm run dev
```

## 🌐 HTTP Mode

```powershell
$env:MCP_TRANSPORT = "http"
$env:PORT = "8787"
npm run dev:http
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Open the local authorization page:

```powershell
Start-Process http://127.0.0.1:8787/login
```

If you expose HTTP mode beyond localhost, put HTTPS and real access control in front of it. The `/login` page accepts your Despezzas password to authorize this MCP.

## 🤖 ChatGPT OAuth Connection

For the **New App** screen in ChatGPT Apps & Connectors:

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

The server exposes the discovery endpoints expected by ChatGPT:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`

This OAuth layer protects the MCP connection. During authorization, the login page exchanges Despezzas email/password for a server-side Despezzas/Firebase session. The final button is `Entrar e autorizar`, and ChatGPT receives only an opaque MCP access token.

`MCP_HTTP_BEARER_TOKEN` is still useful for scripts that do not use ChatGPT, but when it is omitted, `/mcp` requires a valid OAuth access token.

<details>
  <summary>OAuth discovery details and official links</summary>

Custom ChatGPT apps/connectors require a remote HTTPS MCP endpoint. See:

- [Apps SDK quickstart](https://developers.openai.com/apps-sdk/quickstart)
- [Build your MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Authenticate users](https://developers.openai.com/apps-sdk/build/auth)
- [Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [MCP server building for ChatGPT Apps and API integrations](https://developers.openai.com/api/docs/mcp)
- [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

</details>

## ☁️ Remote Deploy

Recommended first path: [Cloudflare Workers](docs/cloudflare-workers.md). Free container alternative: [Koyeb Free](docs/koyeb.md).

See [docs/deployment.md](docs/deployment.md) for a broader comparison of free hosting options and provider-specific configuration notes.

| Provider | Best For | Files | Note |
| --- | --- | --- | --- |
| **Cloudflare Workers** | Recommended remote MCP | `wrangler.jsonc`, `src/cloudflare.ts` | Best path for ChatGPT OAuth. |
| **Docker/Koyeb** | Simple container deploy | `Dockerfile` | Good for personal use; may scale to zero. |
| **Vercel** | Serverless Express function | `vercel.json`, `api/index.js` | Stateless; use env vars for credentials. |
| **Render/Railway** | Quick demos and GitHub deploys | `render.yaml`, `railway.json` | Free services may sleep or have limits. |
| **Prefect Horizon** | Managed MCP gateway | `horizon_proxy.py` | FastMCP proxy for a published Node backend. |

Included deploy files:

- `render.yaml` for Render Blueprints.
- `railway.json` for Railway.
- `vercel.json` and `api/index.js` for Vercel Functions.
- `wrangler.jsonc` and `src/cloudflare.ts` for Cloudflare Workers.
- `Dockerfile` for Koyeb, Cloud Run, Fly.io, Northflank, Docker deploys on Railway, or a VM.
- `horizon_proxy.py` and `requirements.txt` for Prefect Horizon as a FastMCP proxy in front of an already published Node backend.

For multi-user Cloudflare Workers mode, bind the `DESPEZZAS_SESSIONS` KV namespace, set `MCP_OAUTH_TOKEN_SECRET`, `SESSION_ENCRYPTION_KEY`, and `DESPEZZAS_FIREBASE_API_KEY` as Wrangler secrets, then deploy with `npm run deploy:cloudflare`. For private single-account deploys, set `MCP_OWNER_AUTH_CODE` with your Despezzas credentials and `DESPEZZAS_FIREBASE_API_KEY`. For Horizon, publish the Node backend somewhere else and point `horizon_proxy.py:mcp` to that backend.

## 🔎 HAR Inspection

When capturing more frontend actions:

```powershell
npm run inspect:har -- C:\path\to\despezzas.har
```

The script prints only calls to `api.despezzas.com` and masks common secrets. Useful next actions to capture:

- Pay/unpay bills and credit-card invoices.
- Goals, spending limits, reports, investments, Open Finance connection management, and AI chat actions.
- Any profile edge case not yet covered by `despezzas_list_profiles`, `despezzas_switch_profile`, or profile management tools.

If exporting a HAR is cumbersome, paste [scripts/request-monitor-devtools.js](scripts/request-monitor-devtools.js) into DevTools on `despezzas.com`, perform the action, then run:

```js
window.__despezzasMcpMonitor.download()
```

It exports a masked JSON report of `fetch`/XHR calls to `api.despezzas.com`.

## 📚 Reference MCPs

The implementation style was compared with:

- [SamuelMoraesF/mcp-organizze](https://github.com/SamuelMoraesF/mcp-organizze)
- [silviorodrigues/organizze-mcp](https://github.com/silviorodrigues/organizze-mcp)
- [WeslleyNasRocha/organizze-mcp](https://github.com/WeslleyNasRocha/organizze-mcp)

This repository keeps a similar structure, but uses native Despezzas endpoints and UUID IDs.

## 🗺 Roadmap

- [ ] Expand coverage for reports, goals, and investment endpoints.
- [ ] Generate automatic documentation for the MCP tool catalog.
- [ ] Add screenshots for the ChatGPT connection flow.
- [ ] Add ready-to-copy examples for `Claude Desktop`, ChatGPT, and local MCP clients.
- [ ] Document more shared-profile edge cases.

## 🤝 Contributing

Contributions are welcome. Before opening a pull request:

1. Read [CONTRIBUTING.md](CONTRIBUTING.md).
2. Run `npm run typecheck` and `npm test`.
3. Do not include credentials, tokens, sessions, unredacted HARs, or real financial data.
4. Keep `confirm: true` mandatory for every write/destructive tool.

## 📄 License

This project is licensed under the terms of the `MIT` license. See the [LICENSE](./LICENSE) file for additional info.

<!-- ===== FOOTER ===== -->

---

<p align="center">
  Made with 💙 by
  <a href="https://www.guipm.dev/">@guipm.dev</a>.
</p>

<p align="center">
  <a href="#top">
    <b>↑ Return to the top ↑</b>
  </a>
</p>
