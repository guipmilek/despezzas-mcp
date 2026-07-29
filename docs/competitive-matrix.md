# Matriz competitiva — 2026-07-29

Comparação baseada apenas no catálogo local e nas capacidades divulgadas publicamente
pelo Despezzas. Nenhum dado financeiro ou resultado autenticado foi armazenado.

| Capacidade | Este projeto | MCP oficial |
| --- | --- | --- |
| Endpoint remoto com OAuth | Horizon gerenciado | Sim |
| Código aberto e auditável | Sim | Não identificado publicamente |
| Catálogo MCP observável | 35 ferramentas | Exige OAuth para inventário completo |
| Contas, cartões e categorias | Leitura e CRUD protegido | Não detalhado publicamente |
| Busca e resumo de transações | Sim | Gastos divulgados |
| Pré-visualização antes de escrita | `prepare_*` | Não detalhado publicamente |
| Confirmação explícita de escrita | `confirm: true` | Não detalhado publicamente |
| Diagnóstico/exportação de campos | Sim | Não detalhado publicamente |
| Faturas | Não implementado | Divulgado |
| Metas | Não implementado | Divulgado |
| Investimentos | Não implementado | Produto divulga investimentos; catálogo MCP não confirmado |

## Auditoria reproduzível

Execute apenas a listagem de metadados:

```powershell
uv run fastmcp list https://api.despezzas.com/mcp --auth oauth --json
uv run fastmcp list src/despezzas_mcp/server.py --json
```

Atualize esta matriz somente com nomes, descrições e JSON Schemas. Não registre
argumentos usados, resultados de ferramentas, tokens ou dados da conta.
