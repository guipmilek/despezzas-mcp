<!-- ===== HEADER ===== -->
<p align="right">
  <img src="https://img.shields.io/badge/lang-en-green?style=flat-square&amp;labelColor=202024" alt="English" />
  <a href="./README.md"><img src="https://img.shields.io/badge/lang-pt--br-gray?style=flat-square&amp;labelColor=202024" alt="Português" /></a>
</p>

<p align="center">
  <img src="./assets/despezzas-mcp.png" alt="Despezzas MCP" width="120" />
</p>

<h1 id="top" align="center">Despezzas MCP</h1>

<p align="center">
  <img src="https://img.shields.io/badge/Python-%3E%3D3.11-3776ab?style=flat-square&amp;logo=python&amp;logoColor=white&amp;labelColor=202024" alt="Python >= 3.11" />
  <img src="https://img.shields.io/badge/FastMCP-3.x-7c3aed?style=flat-square&amp;labelColor=202024" alt="FastMCP 3" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square&amp;labelColor=202024" alt="MIT" /></a>
</p>

<p align="center">Unofficial MCP server for reading and managing Despezzas financial data.</p>

<details>
  <summary><h2>📒 Table of Contents</h2></summary>

- [Overview](#overview)
- [Quick start](#quick-start)
- [Tools and safety](#tools-and-safety)
- [Prefect Horizon deployment](#prefect-horizon-deployment)
- [Development](#development)
- [Official MCP comparison](#official-mcp-comparison)

</details>

## Overview

This project exposes 35 MCP tools for Despezzas profiles, accounts, cards,
categories, transactions, transfers, summaries, and diagnostics. It is an
open-source integration built from observed web app endpoints and is not affiliated
with Despezzas.

| Item | Value |
| --- | --- |
| Runtime | Python `>=3.11` |
| Framework | FastMCP 3 |
| Maintained deployment | Prefect Horizon |
| Account model | One fork/deployment per Despezzas account |
| MCP authentication | Horizon-managed OAuth |
| Despezzas authentication | Token or email/password + Firebase |
| Development | Primarily AI-assisted, with human review |

> [!IMPORTANT]
> This server accesses real finances. Never commit `.env`, tokens, passwords,
> HAR captures, API responses, or financial exports.

## Quick start

Install [uv](https://docs.astral.sh/uv/) and run:

```powershell
uv sync --extra dev
Copy-Item .env.example .env
uv run --env-file .env despezzas-mcp
```

Local clients use stdio. Configure either `DESPEZZAS_TOKEN`, or
`DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD`, and `DESPEZZAS_FIREBASE_API_KEY`.
Firebase sessions stay in memory; cold starts authenticate again from deployment
secrets.

## Tools and safety

| Group | Examples |
| --- | --- |
| Profiles | `despezzas_list_profiles`, `despezzas_switch_profile` |
| Accounts and cards | `despezzas_list_accounts`, `despezzas_create_credit_card` |
| Transactions | `despezzas_search_transactions`, `despezzas_finance_summary` |
| Preview | `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction` |
| Diagnostics | `despezzas_export_transactions`, `despezzas_raw_api` |

Money uses integer cents (`12345` = `R$123.45`) and dates use `YYYY-MM-DD`.
Every write requires `confirm: true`; non-GET raw calls also require
`allow_destructive: true`.

## Prefect Horizon deployment

1. Fork this repository.
2. Sign in to [horizon.prefect.io](https://horizon.prefect.io/) with GitHub and select the fork.
3. Set the entrypoint to `src/despezzas_mcp/server.py:mcp`.
4. Add the Despezzas secrets.
5. Enable Horizon **Authentication**.
6. Deploy and test with Horizon Inspector.

The endpoint will resemble `https://your-server.fastmcp.app/mcp`. Each fork stores
credentials for one account; do not share the deployment. See
[docs/deployment.md](docs/deployment.md).

## Development

```powershell
uv sync --extra dev
uv run ruff format .
uv run ruff check .
uv run pytest
uv run fastmcp inspect src/despezzas_mcp/server.py:mcp
```

Optional read-only smoke test:

```powershell
uv run --env-file .env python scripts/smoke_readonly.py
```

## Official MCP comparison

The official MCP endpoint is `https://api.despezzas.com/mcp`. Compare metadata only:

```powershell
uv run fastmcp list https://api.despezzas.com/mcp --auth oauth --json
uv run fastmcp list src/despezzas_mcp/server.py --json
```

Do not retain tool arguments, results, or financial data. Goals, invoices, and
investments should only be added after authenticated endpoints are verified. See
the [dated competitive matrix](docs/competitive-matrix.md).
