<!-- ===== HEADER ===== -->
<p align="right">
  <a href="./README.en.md"><img src="https://img.shields.io/badge/lang-en-gray?style=flat-square&amp;labelColor=202024" alt="English" /></a>
  <img src="https://img.shields.io/badge/lang-pt--br-green?style=flat-square&amp;labelColor=202024" alt="Português" />
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

<p align="center">MCP não oficial para consultar e administrar dados financeiros do Despezzas.</p>

<details>
  <summary><h2>📒 Sumário</h2></summary>

- [Visão geral](#visão-geral)
- [Início rápido](#início-rápido)
- [Ferramentas e segurança](#ferramentas-e-segurança)
- [Deploy no Prefect Horizon](#deploy-no-prefect-horizon)
- [Desenvolvimento](#desenvolvimento)
- [Comparação com o MCP oficial](#comparação-com-o-mcp-oficial)

</details>

## Visão geral

Este projeto expõe 35 ferramentas MCP para perfis, contas, cartões, categorias,
transações, transferências, resumos e diagnósticos do Despezzas. É uma integração
open-source construída sobre endpoints observados no aplicativo web; não é afiliada
ao Despezzas.

| Item | Valor |
| --- | --- |
| Runtime | Python `>=3.11` |
| Framework | FastMCP 3 |
| Deploy mantido | Prefect Horizon |
| Modelo de conta | Um fork/deploy por conta Despezzas |
| Autenticação do MCP | OAuth gerenciado pelo Horizon |
| Autenticação do Despezzas | Token ou e-mail/senha + Firebase |
| Desenvolvimento | Majoritariamente assistido por IA, com revisão humana |

O catálogo publica schemas de entrada e saída e annotations MCP completas. As
annotations distinguem leitura, criação, atualização, exclusão e operações não
idempotentes para clientes como ChatGPT planejarem chamadas com segurança.

> [!IMPORTANT]
> Este servidor acessa finanças reais. Nunca faça commit de `.env`, tokens, senhas,
> HARs, respostas da API ou exportações financeiras.

## Início rápido

Instale o [uv](https://docs.astral.sh/uv/) e execute:

```powershell
uv sync --extra dev
Copy-Item .env.example .env
uv run --env-file .env despezzas-mcp
```

Para clientes locais, o comando acima usa stdio. Configure uma destas opções:

- `DESPEZZAS_TOKEN`; ou
- `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD` e `DESPEZZAS_FIREBASE_API_KEY`.

A sessão Firebase fica apenas em memória. Após cold start, o servidor autentica
novamente usando os secrets do deploy.

## Ferramentas e segurança

Os grupos principais são:

| Grupo | Exemplos |
| --- | --- |
| Perfis | `despezzas_list_profiles`, `despezzas_switch_profile` |
| Contas e cartões | `despezzas_list_accounts`, `despezzas_create_credit_card` |
| Transações | `despezzas_search_transactions`, `despezzas_finance_summary` |
| Pré-visualização | `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction` |
| Diagnóstico | `despezzas_export_transactions`, `despezzas_raw_api` |

Valores monetários usam centavos inteiros (`12345` = `R$123,45`) e datas usam
`YYYY-MM-DD`. Toda escrita exige `confirm: true`; `despezzas_raw_api` também exige
`allow_destructive: true` para métodos diferentes de GET.
Consulte o [contrato de escritas](WRITES.md) antes de habilitar mutações.

## Deploy no Prefect Horizon

1. Faça fork deste repositório.
2. Entre em [horizon.prefect.io](https://horizon.prefect.io/) com GitHub e escolha o fork.
3. Use o entrypoint `src/despezzas_mcp/server.py:mcp`.
4. Cadastre os secrets do Despezzas.
5. Habilite **Authentication** no Horizon.
6. Faça deploy e teste as ferramentas no Inspector.

O endpoint será semelhante a `https://seu-servidor.fastmcp.app/mcp`. Cada fork contém
as credenciais de uma única conta; não compartilhe o deployment entre pessoas.
Consulte [docs/deployment.md](docs/deployment.md).

## Desenvolvimento

```powershell
uv sync --extra dev
uv run ruff format .
uv run ruff check .
uv run pytest
uv run fastmcp inspect src/despezzas_mcp/server.py:mcp
```

Smoke test opcional e somente leitura:

```powershell
uv run --env-file .env python scripts/smoke_readonly.py
```

Inspeção mascarada de HAR:

```powershell
uv run python scripts/inspect_har.py C:\caminho\captura.har
```

## Comparação com o MCP oficial

O MCP oficial está em `https://api.despezzas.com/mcp`. Para comparar apenas
metadados, autentique via navegador e liste os catálogos:

```powershell
uv run fastmcp list https://api.despezzas.com/mcp --auth oauth --json
uv run fastmcp list src/despezzas_mcp/server.py --json
```

Não salve argumentos, resultados de ferramentas ou dados financeiros. Metas,
faturas e investimentos só devem ser adicionados depois de endpoints autenticados
serem comprovados e documentados. Veja a
[matriz competitiva datada](docs/competitive-matrix.md).
