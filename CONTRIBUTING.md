# Contribuindo

Este projeto usa endpoints não documentados e dados financeiros reais. Mudanças devem
ser pequenas, revisáveis e acompanhadas de testes.

```powershell
uv sync --extra dev
uv run ruff format .
uv run ruff check .
uv run pytest
uv run fastmcp inspect src/despezzas_mcp/server.py:mcp
```

Regras:

- Nunca inclua `.env`, credenciais, sessões, HARs ou dados financeiros.
- Toda escrita exige `confirm: true`.
- Preserve centavos inteiros e datas `YYYY-MM-DD`.
- Atualize `llms.txt` e documentação quando alterar contratos ou arquitetura.
- Use `uv run python scripts/inspect_har.py <arquivo>` para inspeção mascarada e revise
  manualmente antes de compartilhar.

O projeto foi desenvolvido majoritariamente com assistência de IA. Contribuições
assistidas são aceitas, mas precisam de revisão humana e verificação local.
