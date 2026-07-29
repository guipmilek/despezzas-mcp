## Resumo

-

## Verificacao

- [ ] `uv run ruff format --check .`
- [ ] `uv run ruff check .`
- [ ] `uv run pytest`
- [ ] `uv run fastmcp inspect src/despezzas_mcp/server.py:mcp`

## Seguranca e privacidade

- [ ] Nao inclui tokens, senhas, arquivos `.env`, sessoes, HARs nao mascarados ou dados financeiros reais.
- [ ] Ferramentas de escrita/destrutivas continuam exigindo `confirm: true`.
- [ ] Atualizei `llms.txt`, `AGENTS.md` e `docs/` quando mudei arquitetura, comandos, ferramentas MCP ou regras para agentes.
