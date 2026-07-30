# Matriz competitiva — 2026-07-30

Comparação baseada no catálogo carregado e em um teste autenticado controlado,
autorizado pelo titular da conta. Nenhum token, argumento financeiro, ID ou
resposta bruta foi armazenado. Todos os registros temporários foram removidos.

| Capacidade | Este projeto | MCP oficial |
| --- | --- | --- |
| Endpoint remoto com OAuth | Horizon gerenciado | Nativo do Despezzas |
| Código aberto e auditável | Sim | Não identificado publicamente |
| Catálogo autenticado em 2026-07-30 | 37 ferramentas | 13 ferramentas |
| Contas, cartões e perfis | Leitura e CRUD protegido | Não expostos |
| Busca de transações | Até 500, offset, cursor e filtros detalhados | Até 100, sem cursor ou offset |
| Leitura por ID | Lookup histórico público e seguro | Não exposta |
| Descrição no resultado de busca | Sim | Não retornada no inventário testado |
| Pré-visualização antes de escrita | `prepare_*` | Não exposta |
| Confirmação explícita de escrita | `confirm: true` | Não exposta |
| Validação pós-criação | Snapshot, releitura e comparação | Resposta de aceite sem releitura |
| Atualização parcial segura | Merge, releitura e validação | CRUD fixo funcionou; `description: null` foi descartado |
| Recorrência mensal nos dias 29–31 | Bloqueada preventivamente | Overflow de fevereiro reproduzido |
| Exclusão de série | `scope: ALL` com validação | Exclusões individuais falharam no teste da série |
| Lotes e idempotência | Preview, contadores, retry e chave | Não expostos |
| Transferências | Criação e exclusão das duas pontas | Não expostas |
| Exportação | Contagem, amostra e XLSX | Não exposta |
| Limites e ritmo de gastos | Não implementados | Leitura e criação |
| Metas | Não implementadas | Leitura e criação |
| Comparações e análises | Resumo e visão geral | Contexto, snapshot, categorias e comparações |
| Unidade monetária de escrita | Centavos inteiros | Valor decimal em reais |

## Evidências comportamentais

- Criação, edição de título, valor, tipo e data de uma transação fixa funcionaram
  no MCP oficial.
- O schema oficial aceitava `description: null`, mas a execução descartou o campo
  e respondeu que não havia nada para atualizar.
- Uma recorrência mensal iniciada no dia 30 criou 12 registros, pulou fevereiro
  e materializou duas datas em março.
- A exclusão oficial, chamada para cada uma das 12 ocorrências temporárias, não
  removeu a série. A limpeza foi concluída com `scope: ALL` deste projeto.
- As oito leituras oficiais testadas responderam corretamente e oferecem
  análises que este projeto ainda não replica.

## Decisão de produto

Este projeto permanece a integração principal para escritas, CRUD detalhado,
recorrências, séries, transferências e fluxos que exigem preview e validação. O
MCP oficial é um complemento útil para OAuth nativo, metas, limites e análises.

Não foram adicionados endpoints especulativos de metas ou limites: primeiro é
necessário confirmar os contratos REST usados pelo frontend. Suporte alternativo
ao OAuth oficial também deve ser tratado em mudança arquitetural separada, sem
substituir a autenticação atual do Horizon.

## Auditoria reproduzível

Para comparar somente metadados:

```powershell
uv run fastmcp list https://api.despezzas.com/mcp --auth oauth --json
uv run fastmcp list src/despezzas_mcp/server.py --json
```

Não salve argumentos, resultados autenticados, tokens ou dados da conta.
