# Matriz competitiva — 2026-07-29

Comparação baseada apenas no catálogo local e nas capacidades divulgadas publicamente
pelo Despezzas. Nenhum dado financeiro ou resultado autenticado foi armazenado.

| Capacidade | Este projeto | MCP oficial |
| --- | --- | --- |
| Endpoint remoto com OAuth | Horizon gerenciado | Sim |
| Código aberto e auditável | Sim | Não identificado publicamente |
| Catálogo MCP autenticado em 2026-07-29 | 35 ferramentas | 13 ferramentas |
| Contas, cartões e categorias | Leitura e CRUD protegido | Não expostos no inventário |
| Busca e resumo de transações | Busca, visão geral e resumo | Busca, contexto, snapshot e saldo |
| Pré-visualização antes de escrita | `prepare_*` | Não exposta no inventário |
| Confirmação explícita de escrita | `confirm: true` | Não exposta no inventário |
| Schemas de saída e annotations completas | Sim | Parcial no inventário observado |
| Diagnóstico/exportação de campos | Sim | Não exposto no inventário |
| Limites e ritmo de gastos | Não implementado | Sim |
| Metas | Não implementado | Sim |
| Relatório gerado | Resumo estruturado | Sim |
| Investimentos | Não implementado | Não exposto no inventário |

O catálogo oficial observado continha `create_goal`, `create_spending_limit`,
`create_transaction`, `delete_transaction`, `generate_report`,
`get_balance_overview`, `get_financial_context`, `get_financial_snapshot`,
`get_goals`, `get_spending_limits`, `get_spending_pace`, `get_transactions` e
`update_transaction`.

## Auditoria reproduzível

Execute apenas a listagem de metadados:

```powershell
uv run fastmcp list https://api.despezzas.com/mcp --auth oauth --json
uv run fastmcp list src/despezzas_mcp/server.py --json
```

Atualize esta matriz somente com nomes, descrições e JSON Schemas. Não registre
argumentos usados, resultados de ferramentas, tokens ou dados da conta.
