# Despezzas MCP Agent Playbook

This file is the operating checklist for AI agents working in this repository. It exists
to reduce repeated context, wrong tool calls, and long recovery loops.

## Preflight

Run this before reading large files or editing anything:

1. Check if a session checkpoint exists at `.agents/session-checkpoint.md`. If it does, read it (or run `npm run session:resume`) to restore session context immediately.
2. Confirm the current directory:
   - `git status --short`
   - `Get-Location`
3. Confirm target paths exist before searching inside them:
   - `Test-Path -LiteralPath '<absolute path>'`
4. Use Windows-safe search:
   - Prefer `rg`.
   - Use `rg -F` for literal strings.
   - Use `Select-String -SimpleMatch` when PowerShell-native search is clearer.
   - Do not assume `grep` exists.
5. Classify the task:
   - MCP tool schema or handler
   - Despezzas API endpoint/client behavior
   - Authentication or session persistence
   - OAuth or HTTP transport
   - Cloudflare Workers deployment
   - Tests or safety validation
   - Documentation only
6. State the owner files before editing.
7. State the verification command before editing.
8. **Task Checklist Initialization**: When creating `task.md` checklist at task startup, always include the checkpoint check as the first item, and formatting/verification, handoff reflection/instruction validation, and final checkpoint creation as the final items (following `docs/agent-task-template.md`).

## Edit Ownership

- MCP tool definitions and write guards belong in `src/tools.ts`.
- Shared confirmation, response, and error helpers belong in `src/response.ts`.
- Despezzas endpoint calls and request plumbing belong in `src/client.ts`.
- Despezzas/Firebase login and local session behavior belong in `src/auth.ts`.
- Express HTTP routes belong in `src/httpApp.ts`.
- Cloudflare Worker routes and KV-backed sessions belong in `src/cloudflare.ts` and
  `src/cloudflareSessions.ts`.
- OAuth registration, authorization, token issue, and validation helpers belong in
  `src/oauth.ts`.
- Environment parsing belongs in `src/config.ts`.
- Login page markup belongs in `src/loginPage.ts`.
- Tests belong in `test/*.test.mjs`.
- Diagnostic scripts belong in `scripts/`.
- Deployment docs belong in `docs/`.

Avoid introducing a new helper when an existing one already owns the behavior.

## Security Rules

- Preserve `confirm: true` on every write or destructive tool.
- Add focused tests for new write paths, ambiguous payloads, and dangerous defaults.
- Never log secrets, raw Authorization headers, Firebase refresh tokens, full sessions,
  unredacted HAR content, or raw financial exports.
- Keep passwords out of MCP tool arguments. Use `.env` or `/login`.
- When mapping endpoints from HAR captures, use `npm run inspect:har -- <path>` and
  manually review redaction before sharing or committing any derived artifact.
- Treat undocumented Despezzas endpoints as unstable. Keep payload handling defensive.

## Verification Ladder

Use the narrowest check first, then broaden only when needed:

1. `npm run check:repo-safety`
2. `npm run check:mcp-tools`
3. `npm run format:check`
4. `npm run lint`
5. `npm run typecheck`
6. `npm test`
7. `npm run verify`
8. `npm run check:cloudflare` when Worker or deployment behavior changed.
9. `npm run smoke:readonly` only when live read-only API behavior needs validation.

Notes:

- `npm test` builds first.
- `npm run smoke:readonly` requires credentials and calls real read-only endpoints.
- `npm run verify` includes `format:check`; run `npm run format` before verification
  when changing formatted files.
- If full verification fails because of pre-existing or environment-only issues, run the
  most targeted useful command and report the limitation.

## Endpoint Capture Pattern

When adding or repairing Despezzas API behavior:

1. Start from existing helpers in `src/client.ts` and `src/tools.ts`.
2. Capture only the minimum network traffic needed.
3. Redact with `npm run inspect:har -- <path>`.
4. Add or update TypeScript payload normalization.
5. Add tests for required fields, dangerous ambiguity, and confirmation behavior.
6. Update `llms.txt` and docs when tool names, payload rules, or endpoints change.
7. Run `npm run check:mcp-tools` to catch stale tool references.

## Stop Rules

Stop and write a checkpoint instead of continuing blindly when any of these happen:

- Three consecutive command/tool errors from the same cause.
- More than 30 tool calls without a concrete edit or verified finding.
- Build/typecheck/test failure is clearly outside touched files.
- A HAR or API response contains secrets or personal finance data that cannot be safely
  redacted in the current context.
- A task references a path outside this repository and `PROJECT_PATHS.md` is ambiguous.

To automatically generate a session checkpoint and git patch file, run:
`npm run session:checkpoint -- --goal="<goal>" --evidence="<findings>" --blocker="<blockers>" --next="<next steps>"`

This will create or update `.agents/session-checkpoint.md` and `.agents/session-diff.patch`.

Alternatively, use the following manual format:

```text
Goal:
Current cwd:
Touched files:
Evidence found:
Current blocker:
Next command:
Verification already run:
```

## Token Optimization & Tool Call Pitfalls

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

## Documentation & README Style Standards

1. **Bilingual Layout**: Every project README must support both Portuguese (`README.md`) and English (`README.en.md`) versions, with language-selection flags in the top-right header of each file.
2. **Visual Header**: Center the project logo and use `flat-square` Shields.io badges styled with `labelColor=202024` for metadata (Node.js, license, commit activity).
3. **Collapsible Table of Contents**: Include a collapsible summary dropdown (`📒 Sumário` or `📒 Table of Contents`) using HTML `<details>`.
4. **IA Context & Metadata Table**: Outline the assist-coded (vibecoded) nature of the project. Link to agent files (`AGENTS.md`, `docs/`, `PROJECT_PATHS.md`) and present a clean metadata table mapping the project's tech stack, linting, and visual foundations.
5. **Context Maintenance**: Whenever changing project architecture, script APIs, visual primitives, or tools:
   - Update `llms.txt` to keep the context representation accurate for LLMs and AI agents.
   - Update `README.md` and `README.en.md` to reflect any new setup/verify commands or folder maps.
