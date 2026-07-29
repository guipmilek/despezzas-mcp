# Despezzas MCP Agent Playbook

## Preflight

1. Read `.agents/session-checkpoint.md` when present.
2. Confirm `git status --short` and the repository path.
3. Classify the change: tool contract, API client, auth, Horizon deploy, tests, or docs.
4. Read the corresponding owner module before editing.
5. State the targeted verification command.

## Security invariants

- Every write stops before the API unless `confirm is True`.
- Raw non-GET calls require both `allow_destructive` and `confirm`.
- Money is integer cents; dates are `YYYY-MM-DD`.
- Passwords are environment secrets, never tool arguments.
- Errors and diagnostic results must redact tokens, passwords, credentials, and authorization fields.
- Horizon is single-account per fork; sessions remain in memory.

## Verification ladder

```powershell
uv run ruff format --check src tests scripts
uv run ruff check src tests scripts
uv run pytest
uv run fastmcp inspect src/despezzas_mcp/server.py:mcp
```

Run `scripts/smoke_readonly.py` only when live behavior must be verified and credentials
are available. It must remain read-only.

## Endpoint work

1. Confirm endpoints from source, a redacted HAR, or a read-only call.
2. Put HTTP mapping in `client.py`.
3. Normalize and validate trust-boundary inputs in `tools.py`.
4. Add an in-memory or mocked HTTP test.
5. Update `docs/despezzas-api-notes.md` for new endpoint behavior.

## Handoff

Report changed files, documentation, verification commands/results, skipped live checks,
remaining risks, and Memory Bank updates. Commit and push only after the repository is
clean of sensitive/unrelated files.
