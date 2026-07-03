# Despezzas MCP - Agent Instructions

## Project

This repository is an unofficial TypeScript MCP server for Despezzas personal finance data.
It can read and change real financial records, so agents must treat credentials, sessions,
HAR captures, API responses, and transaction data as sensitive.

Core source files live in `src/`. Build output lives in `dist/`.

## Mandatory Rules

1. Read `llms.txt` before non-trivial code changes.
2. Keep write and destructive MCP tools gated by `confirm: true`.
3. Never commit `.env`, real tokens, passwords, Firebase sessions, session JSON files,
   unredacted HAR files, raw API responses, or personal finance data.
4. Do not manually edit `dist/` as a standalone change. Edit `src/` and run the build.
5. Use integer cents for money values. Example: `12345` means `R$123.45`.
6. Use `YYYY-MM-DD` dates for MCP tool inputs and API payload normalization.
7. Do not pass Despezzas passwords as MCP tool arguments. Use `.env` or `/login`.
8. Prefer existing helpers in `src/response.ts`, `src/client.ts`, `src/auth.ts`,
   `src/oauth.ts`, and `src/tools.ts` before adding parallel patterns.
9. Update `llms.txt`, `AGENTS.md`, and docs under `docs/` when changing architecture,
   commands, tool behavior, security rules, or agent conventions.
10. Keep remote deployment support and documentation Cloudflare Workers-only unless the
    user explicitly changes that project policy. Local Node HTTP is for development,
    local clients, and private HTTP use, not a maintained remote deploy path.

## Required Agent Workflow

For any non-trivial task, read and follow:

- `docs/agent-playbook.md`
- `docs/agent-task-template.md` when starting from a reusable AI-agent prompt.
- `docs/agent-architecture-map.md` when changing source ownership, MCP tools,
  auth, OAuth, deployment behavior, or tests.
- `PROJECT_PATHS.md` when paths outside this repo, local sessions, HAR files, or
  related projects are involved.

Minimum preflight:

1. Check if a session checkpoint exists at `.agents/session-checkpoint.md`. If it does, read it (or run `npm run session:resume`) to restore context.
2. Confirm workspace status:

```powershell
git status --short
Get-Location
Test-Path -LiteralPath '<target path>'
```

Checkpointing:
Before wrapping up a session or when session/context limits are approaching, run:
`npm run session:checkpoint -- --goal="<goal>" --evidence="<findings>" --next="<next steps>"` to save the state for the next agent.

Post-implementation Handoff & Version Control:
Before completing a task, you must:

1. Update all relevant documentation, Readmes, `llms.txt`, or playbook files to reflect structural or behavioral changes.
2. Build the output using `npm run build` (if changes are code-level).
3. Verify formatting and compile safety (`npm run verify` or `npm run lint`).
4. Stage and commit the modifications using Conventional Commits format matching the repo history (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `chore: ...`).
5. Push the commit to the remote repository.

Use `rg` for search. Use `rg -F` for literal strings. Do not assume `grep` exists in this Windows environment.

## Verification

Use the narrowest useful check first:

```powershell
npm run check:repo-safety
npm run check:mcp-tools
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify
npm run check:cloudflare
npm run smoke:readonly
```

Notes:

- `npm test` builds the TypeScript output and runs `node --test`.
- `npm run smoke:readonly` requires valid Despezzas authentication and calls
  read-only endpoints.
- `npm run check:cloudflare` validates Worker deployment shape, not live behavior.
- `npm run verify` includes `format:check`, so run `npm run format` before verification
  when changing formatted files.

## Source Ownership

- `src/tools.ts`: MCP tool schemas, handlers, validation, and write guards.
- `src/response.ts`: MCP responses, error formatting, and confirmation guard helpers.
- `src/client.ts`: Despezzas API client, request helper, and endpoint mapping.
- `src/auth.ts`: Despezzas/Firebase login, token refresh, and local session handling.
- `src/httpApp.ts`: Express HTTP server, `/login`, OAuth discovery, and `/mcp`.
- `src/cloudflare.ts`: Cloudflare Workers app, OAuth, sessions, and Worker logging.
- `src/cloudflareSessions.ts`: encrypted Worker KV session persistence.
- `src/oauth.ts`: OAuth token, client registration, authorization, and validation helpers.
- `src/config.ts`: environment parsing and runtime configuration.
- `src/loginPage.ts`: local/OAuth login page HTML.
- `test/`: Node test suite for tool validation, login page behavior, and Cloudflare paths.
- `scripts/`: local diagnostics, HAR inspection, smoke tests, and repo checks.
- `docs/cloudflare-workers.md` and `docs/deployment.md`: Cloudflare-only remote deploy docs.

## Stop Rules

Stop and write a checkpoint instead of continuing blindly when any of these happen:

- The same tool or command fails three consecutive times for the same reason.
- A build, typecheck, or test failure is clearly outside the touched scope.
- A HAR/API capture contains unredacted sensitive values that cannot be safely summarized.
- The requested path is outside this repository and `PROJECT_PATHS.md` does not make it clear.

## Token Optimization & Common Pitfalls

1. **Avoid Wasted File Views (Token Saving)**:
   - Do NOT view complete files if they are large (e.g. `src/tools.ts` or `package-lock.json`). Always specify `StartLine` and `EndLine` in `view_file` to only load the lines of interest.
   - Avoid reading files under `dist/` or other generated outputs.
2. **Tool Call Arguments Safety**:
   - **`write_to_file` / `replace_file_content`**: Never supply `ArtifactMetadata` when writing to a file in the workspace directory (e.g. `src/` or `scripts/`). `ArtifactMetadata` is reserved _only_ for files written to the Antigravity conversation brain directory. Specifying it for workspace paths will cause an execution error.
   - **`view_file`**: If you specify `StartLine`, you must also specify `EndLine`. Leaving `EndLine` omitted or 0 when `StartLine` is provided will cause validation errors.
3. **Shell Environment Constraints (Windows PowerShell)**:
   - The shell is Windows PowerShell. Do NOT run Unix-specific tools like `grep`, `sed`, `awk`, or `export` directly in `run_command`. Use `rg` for searching, and PowerShell commands like `$env:VAR = "value"` for environment variables.
   - Do not assume external tools like `gh` (GitHub CLI) or `jq` are available unless verified. Use Node scripts or PowerShell commands instead.
4. **Prettier and Linters Alignment**:
   - Always run `npm run format` before running verification commands or committing. Prettier formatting is strictly checked and must pass.
   - In `despezzas-mcp`, ESLint strictly forbids unused variables (e.g., unused catch error bindings `catch (e)`) and empty blocks. Use optional catch binding `catch {` and add descriptive comments inside empty blocks to satisfy the compiler.
   - Avoid staging or committing `.agents/session-checkpoint.md` or `.agents/session-diff.patch`. Keep them git-ignored.
