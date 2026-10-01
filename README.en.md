<a id="topo"></a>
<a id="top"></a>

<p align="right"><a href="README.md" lang="pt-BR" title="Ler em português"><img src="https://raw.githubusercontent.com/jdecked/twemoji/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/assets/svg/1f1e7-1f1f7.svg" width="20" height="20" alt="Brazil"> Português</a> · <strong lang="en"><img src="https://raw.githubusercontent.com/jdecked/twemoji/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/assets/svg/1f1fa-1f1f8.svg" width="20" height="20" alt="United States"> English</strong></p>

![Despezzas MCP — project symbol and name on a light-blue background](assets/readme/capa.svg)

# Despezzas MCP

**Unofficial MCP server for reading and managing Despezzas financial data.**

Connect your MCP client to your account, read information, and prepare changes before applying them. This repository contains the server, tests, and usage guides.

<p>
  <a href="#overview"><img src="assets/readme/estado-projeto.en.svg" width="184" height="24" alt="Project: unofficial"></a>
  <a href="LICENSE"><img src="assets/readme/estado-licenca.en.svg" width="140" height="24" alt="License: MIT"></a>
</p>

<p>
  <a href="#getting-started"><img src="assets/readme/acao-comecar.en.svg" width="158" height="36" alt="Start here"></a>
  <a href="#preview"><img src="assets/readme/acao-previa.en.svg" width="155" height="36" alt="View preview"></a>
  <a href="src/despezzas_mcp/"><img src="assets/readme/acao-arquivos.en.svg" width="148" height="36" alt="Explore files"></a>
</p>

<details>
<summary>📒 Contents — jump to a section</summary>

- [📍 Overview](#overview)
- [✨ Features](#features)
- [🎨 Preview](#preview)
- [🛠️ Tools](#tools)
- [🚀 Getting started](#getting-started)
  - [Connect to ChatGPT](#connect-to-chatgpt)
- [📄 Terms of use](#terms)
- [👏 Credits](#credits)

</details>

<a id="overview"></a>

## 📍 Overview

The server exposes **37 MCP tools** for profiles, accounts, cards, categories, transactions, transfers, summaries, and diagnostics. It was built from endpoints observed in the web app and **is not affiliated with Despezzas**.

Local use is over stdio. The maintained remote deployment platform is **Prefect Horizon**, with platform-managed OAuth. Each fork and deployment represents one Despezzas account; sessions remain in memory only.

> [!IMPORTANT]
> This server accesses real finances. Every write requires `confirm: true`; review the data before confirming. Never include `.env`, tokens, passwords, sessions, HAR captures, API responses, or financial exports in the repository. Never send a Despezzas password as a tool argument.
>
> **Every deployment is bound to one account.** Fork the repository, publish your
> own Prefect Horizon deployment, and configure only your secrets. Never use or
> share someone else's deployment: it accesses the financial data configured in
> that server's secrets.

<a id="features"></a>
<a id="tools-and-safety"></a>

## ✨ Features

| What do you want to do? | Tools and guides |
| --- | --- |
| Read profiles, accounts, and cards | `despezzas_list_profiles`, `despezzas_list_accounts`, `despezzas_list_credit_cards` |
| Find transactions and read summaries | `despezzas_get_transaction`, `despezzas_search_transactions`, `despezzas_finance_summary` |
| Prepare a change without applying it | `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction`, `despezzas_prepare_batch_update_transactions` |
| Understand write rules | [Write contract](WRITES.md) · [Security](SECURITY.md) |
| Deploy and connect a client | [Prefect Horizon](docs/deployment.md) · [MCP client connections](docs/chatgpt-app-setup.md) |
| Browse the catalog and source | [Catalog in llms.txt](llms.txt) · [Server tools](src/despezzas_mcp/tools.py) |

Money uses **integer cents** (`12345` = `R$ 123.45`); dates use `YYYY-MM-DD`. Tools publish explicit input/output schemas and MCP annotations to distinguish reads, creates, updates, deletes, and non-idempotent operations.

Transaction creates and updates are re-read and validated after the write. Omitted fields are preserved; explicit `null` clears nullable fields. The raw API is an advanced feature: non-GET methods require **both `allow_destructive: true` and `confirm: true`**.

<details>
<summary>View operation limits and details</summary>

- Creation compares the previous state and validates the number of occurrences, dates, installments, and persisted fields. Updates read and merge data before `PUT`.
- Search supports `offset`, opaque cursors, and stable ordering. `despezzas_get_transaction` can locate an ID outside the current month.
- `despezzas_status` exposes the public server version.
- Series previews show each occurrence's paid state: only the first can start paid; future occurrences remain pending.
- Monthly recurring transactions starting on days 29, 30, or 31 are blocked because of the API's date behavior.
- Partial writes are reported explicitly; they are not retried or rolled back automatically. Re-read the state before preparing only the remaining changes.
- Transfer deletion handles both connected entries, including relationships that use raw API IDs.
- `available_limit_cents` is read-only and is not part of card create or update schemas. Read this value from the card list.

The [write contract](WRITES.md) covers validation, partial persistence, recurring transactions, and safety. The [API notes](docs/despezzas-api-notes.md) document observed behavior.

</details>

<a id="preview"></a>

## 🎨 Preview

### Check the connection

After configuring the server, select `despezzas_status` in the Inspector or MCP client. The tool reports the version and authentication state without changing financial data.

```json
{
  "name": "despezzas_status",
  "arguments": {}
}
```

This example shows only the tool name and arguments. It is not a live response, a client configuration file, or proof of an active deployment.

### Prepare before confirming

1. Read the current resources and IDs.
2. Use a `despezzas_prepare_*` tool and review its preview.
3. Run the write tool only after reviewing its arguments and sending `confirm: true`.

Previews may read data to build the comparison, but do not write. For natural-language request examples, see [MCP client connections](docs/chatgpt-app-setup.md).

<a id="tools"></a>

## 🛠️ Tools

### Server

<p>
  <a href="pyproject.toml"><img src="assets/readme/ferramenta-python.svg" width="155" height="26" alt="Python &gt;= 3.11"></a>
  <a href="pyproject.toml"><img src="assets/readme/ferramenta-fastmcp.svg" width="148" height="26" alt="FastMCP 3.x"></a>
</p>

Python and FastMCP make up the server. HTTPX handles API requests; Pydantic defines and validates models. Dependencies and version ranges are listed in [pyproject.toml](pyproject.toml).

### Development and deployment

| Tool | Use in this project |
| --- | --- |
| uv | Install dependencies and run commands |
| pytest | Verify the catalog and server behavior |
| Ruff | Format and analyze the code |
| Prefect Horizon | Deploy the remote MCP and manage its OAuth authentication |

Badges identify documented technologies and terms. They do not prove installed versions, passing tests, or service availability.

<a id="getting-started"></a>
<a id="quick-start"></a>

## 🚀 Getting started

### Run locally

You need **Python 3.11 or later**, [uv](https://docs.astral.sh/uv/), and access to a Despezzas account. Get the source:

```powershell
git clone https://github.com/guipmilek/despezzas-mcp.git
cd despezzas-mcp
uv sync --extra dev
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
```

Edit `.env` on your computer. Configure either:

- `DESPEZZAS_TOKEN`; or
- `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD`, and `DESPEZZAS_FIREBASE_API_KEY`.

If `.env` already exists, preserve its configuration. Keep it out of version control.

```powershell
uv run --env-file .env despezzas-mcp
```

This command starts the server over **stdio**; the MCP client must launch it and communicate through that transport. Firebase sessions stay in memory. A fresh start without a session authenticates again using the configured credentials.

<a id="connect-to-chatgpt"></a>

<details>
<summary>Connect to ChatGPT</summary>

After publishing your own fork and deployment, use these values when adding the
MCP to ChatGPT. Never use someone else's URL:

| Field | Value |
| --- | --- |
| Name | `Despezzas` |
| Description | `Read and manage Despezzas profiles, accounts, cards, transactions, transfers, and financial summaries, with confirmation required before changes.` |
| URL | `https://your-server.fastmcp.app/mcp` — replace it with your deployment URL |
| Authentication | OAuth |
| Image | [`assets/despezzas-mcp.png`](assets/despezzas-mcp.png) — square PNG, 512 × 512, under 100 KB |

In ChatGPT, enable developer mode under **Settings → Security and login**, open
**Plugins**, select **+**, enter the values above, and complete authentication.
See the [ChatGPT connection guide](docs/chatgpt-app-setup.md) for setup,
validation, and catalog-refresh steps.

</details>

<a id="prefect-horizon-deployment"></a>

<details>
<summary>Deploy to Prefect Horizon and connect a client</summary>

1. Fork this repository.
2. Sign in to [horizon.prefect.io](https://horizon.prefect.io/) with GitHub and select the fork.
3. Set the entrypoint to `src/despezzas_mcp/server.py:mcp`.
4. Add the Despezzas credentials to Horizon secrets.
5. Enable **Authentication**.
6. Deploy and test `despezzas_status` in the Inspector first.
7. Connect the MCP client to Horizon's `/mcp` URL using OAuth.

The endpoint will resemble `https://your-server.fastmcp.app/mcp`. Use one deployment per account; do not share the deployment between people or share its credentials. Granting MCP access allows access to the configured financial account, even without revealing secrets.

[Deployment guide](docs/deployment.md) · [MCP client connections](docs/chatgpt-app-setup.md)

</details>

<a id="development"></a>

<details>
<summary>Develop and verify the server</summary>

```powershell
uv sync --extra dev
uv run ruff format --check .
uv run ruff check .
uv run pytest
uv run fastmcp inspect src/despezzas_mcp/server.py:mcp
```

To apply formatting, use `uv run ruff format .`.

The following smoke test is **optional**, read-only, and calls real endpoints. Run it only when you need to verify the integration and have configured credentials:

```powershell
uv run --env-file .env python scripts/smoke_readonly.py
```

To inspect a HAR with redacted data:

```powershell
uv run python scripts/inspect_har.py C:\caminho\captura.har
```

Do not publish the original capture. Read the [contribution guide](CONTRIBUTING.md) and [agent instructions](AGENTS.md) before changing contracts or architecture.

</details>

<a id="official-mcp-comparison"></a>

<details>
<summary>Compare the catalog with the official MCP</summary>

The official endpoint documented by this project is `https://api.despezzas.com/mcp`. To compare metadata only, authenticate in the browser and list the catalogs:

```powershell
uv run fastmcp list https://api.despezzas.com/mcp --auth oauth --json
uv run fastmcp list src/despezzas_mcp/server.py --json
```

Do not save tool arguments, results, or financial data. Goals, invoices, and investments depend on verified, documented authenticated endpoints; they are not declared capabilities of this server. See the [dated competitive matrix](docs/competitive-matrix.md).

</details>

<a id="terms"></a>

## 📄 Terms of use

This project declares the [MIT license](LICENSE). The integration is unofficial and uses undocumented endpoints, which may change.

The license does not establish an affiliation with Despezzas or guarantee the external service's availability. You remain responsible for reviewing and authorizing operations on your account. Read the [security guidance](SECURITY.md) and [write contract](WRITES.md).

<a id="credits"></a>

## 👏 Credits

- **Author:** Guilherme Milek, as listed in [pyproject.toml](pyproject.toml) and [LICENSE](LICENSE).
- **Development:** primarily AI-assisted, with human review.
- **Symbol:** the existing project file, preserved at [assets/despezzas-mcp.png](assets/despezzas-mcp.png). The cover only embeds it; it does not replace the original.
- **README structure and navigation:** adapted from the reusable pattern developed by Guilherme; the local functional icons are original work.
- **Functional icons:** original local SVGs for actions, states, Python, and FastMCP; these are not official tool logotypes.
- **Flags:** Twemoji, Twitter, Inc. and other contributors; [CC BY 4.0](https://github.com/jdecked/twemoji/blob/b6b55fef1e8636b540a6d016a4729ca8cdf2e60b/LICENSE-GRAPHICS), with no changes to the drawings.

[Contribute](CONTRIBUTING.md) · [Security guidance](SECURITY.md) · [Adaptation record](docs/readme-consistencia-2026-09-30.md)

---

<p align="right"><a href="#topo"><img src="assets/readme/voltar-ao-topo.en.svg" width="143" height="32" alt="Back to top"></a></p>
