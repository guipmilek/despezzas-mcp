# ChatGPT App/Connector Quick Setup

Step-by-step values for the ChatGPT **Settings → Apps & Connectors → New App** dialog, matching each field in order.

## 1. Icon (optional)

- **Requirement:** PNG only, best at 256x256px or larger, **max file size 10 KB**.
- **File to upload:** [`assets/despezzas-mcp.png`](../assets/despezzas-mcp.png) — the official Despezzas double-Z app icon, 512x512, optimized to ~3 KB (light lavender background `#f1f6ff`, near-black mark `#171717`). Upload it as-is.

## 2. Name

```
Despezzas
```

## 3. Description (optional)

```
Personal finance for Despezzas: check accounts, cards, categories, and spending, and log transactions.
```

## 4. Connection

Leave the toggle on **Server URL** (not Tunnel) — this is a permanently deployed Cloudflare Worker, not a local tunnel.

## 5. MCP Server URL

```
https://despezzas-mcp.guipmilek.workers.dev/mcp
```

## 6. Authentication

Select **OAuth** from the dropdown (not "No Auth" or "Mixed").

After entering a valid Server URL above, the **Advanced OAuth settings** panel below it becomes enabled and auto-discovers the server's OAuth metadata from:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`

You don't need to fill in client ID/secret manually — the Worker exposes public dynamic client registration (`POST /oauth/register`) and ChatGPT registers itself automatically during the first connection.

## 7. Risk acknowledgment checkbox

Check **"I understand and want to continue"** — this is required for any custom/unverified MCP server (the "Create" button stays disabled until it's checked).

## 8. Create

Click **Create**. ChatGPT will immediately try to connect and may prompt you to complete the OAuth login flow (see below) before the app is fully added.

## Longer Description (optional, for app listing)

```
Connect your Despezzas account to ChatGPT. Ask about your balances, credit
cards, categories, and recent transactions, get spending summaries, and
create or update transactions with a confirmation step before anything is
written. Each user signs in with their own Despezzas email and password
during setup — ChatGPT never sees your password, only a secure session
token.
```

## What to tell users during OAuth login

When ChatGPT redirects to the Despezzas MCP login screen, users should:

1. Enter their **Despezzas email and password** (the same ones used on despezzas.com or the Despezzas app).
2. Click **Entrar** to authorize.
3. Return to ChatGPT — the connection is now active and scoped to their account only.

No owner code or shared secret is needed; this deployment runs in **multi-user mode**, so each person's session is stored encrypted and independently in Cloudflare KV.

## Suggested Example Prompts (for the App Store listing "Try asking" section)

```
- "What's my current balance across all accounts?"
- "Show my last 10 transactions on my Nubank card."
- "How much did I spend on restaurants this month?"
- "Add a R$45.90 grocery expense to my checking account today."
- "List my spending categories."
```

## Verification Checklist Before Publishing

- [ ] `GET https://despezzas-mcp.guipmilek.workers.dev/health` returns `"ok": true` and `"authMode": "multi-user"`.
- [ ] `GET https://despezzas-mcp.guipmilek.workers.dev/.well-known/oauth-protected-resource` resolves.
- [ ] Logging in via `/login` with a real Despezzas account succeeds and shows the success page.
- [ ] A test ChatGPT connection can call a read-only tool (e.g. list accounts) after OAuth.
