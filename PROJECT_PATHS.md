# Project Paths

## Repository

| Purpose | Path |
| --- | --- |
| Repository | `C:\Users\guilherme.milek\Desktop\despezzas-mcp` |
| Python package | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\src\despezzas_mcp` |
| Tests | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\tests` |
| Docs | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\docs` |
| Scripts | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\scripts` |

## Runtime

- Python `>=3.11`
- uv for dependency and command execution
- Prefect Horizon entrypoint: `src/despezzas_mcp/server.py:mcp`
- `.venv/`, `.env`, HARs, logs, coverage, and agent checkpoints are ignored

Never commit `.env`, tokens, passwords, session data, HARs, raw API responses, or
financial exports. Verify copied external paths before accessing them.
