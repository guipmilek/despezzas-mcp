# Despezzas MCP - Agent Instructions

## Project

Unofficial Python/FastMCP server for Despezzas personal finance data. Source lives
under `src/despezzas_mcp/`; tests live under `tests/`. Remote deployment is Prefect
Horizon only.

## Mandatory rules

1. Read `llms.txt` before non-trivial changes.
2. Keep every write/destructive tool gated by `confirm: true`.
3. Non-GET `despezzas_raw_api` calls also require `allow_destructive: true`.
4. Never commit `.env`, credentials, sessions, HARs, API responses, or finance data.
5. Use integer cents for money and `YYYY-MM-DD` dates.
6. Never accept Despezzas passwords as MCP tool arguments.
7. Reuse helpers in `helpers.py`, `client.py`, and `auth.py`.
8. Update docs and `llms.txt` when architecture, commands, tools, or security change.
9. Keep remote deployment and documentation Prefect Horizon-only.
10. Do not add persistent session storage or multi-user credentials without an explicit request.

## Workflow

For non-trivial changes:

1. Check `.agents/session-checkpoint.md`; read it if present.
2. Run `git status --short` and confirm the workspace.
3. Read `docs/agent-playbook.md` and, for architecture changes,
   `docs/agent-architecture-map.md`.
4. Use CodeGraph before broad source scans; use `rg` for exact text.
5. Preserve unrelated tracked and untracked files.

If a checkpoint is needed, write `.agents/session-checkpoint.md` with goal, evidence,
blocker, next command, and verification. It is ignored and must not be committed.

## Ownership

- `server.py`: FastMCP instance and entrypoint.
- `tools.py`: public tool schemas, handlers, annotations, and confirmation guards.
- `client.py`: endpoint mapping, request headers, parsing, and 401 retry.
- `auth.py`: Despezzas/Firebase login, refresh, and in-memory session lock.
- `helpers.py`: redaction, preparation, profile context, and summaries.
- `tests/`: catalog and behavior checks.
- `docs/deployment.md`: Prefect Horizon instructions.

## Verification

Run the narrowest useful check, then the complete suite:

```powershell
uv run ruff format --check .
uv run ruff check .
uv run pytest
uv run fastmcp inspect src/despezzas_mcp/server.py:mcp
```

The optional smoke test calls real read-only endpoints:

```powershell
uv run --env-file .env python scripts/smoke_readonly.py
```

Before completing code-level work, format, verify, update relevant docs, commit with a
Conventional Commit, and push the branch. Do not stage `.agents/` or sensitive files.

## Stop rules

Stop and checkpoint when the same command fails three times, a failure is clearly
outside touched scope, or sensitive data cannot be safely summarized.
