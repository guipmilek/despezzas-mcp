# Agent Task Template

Use this when starting a new AI-agent task for this repository.

```text
Task:
<specific desired change>

Preflight:
- Check if a session checkpoint exists at `.agents/session-checkpoint.md`. If it does, run `npm run session:resume` (or read the file directly) to restore session context immediately.
- Confirm cwd with git status --short and Get-Location.
- Verify target paths with Test-Path -LiteralPath.
- Use rg for search; use rg -F for literal strings.
- Read AGENTS.md and llms.txt first.
- Open docs/agent-playbook.md for workflow rules.
- Open docs/agent-architecture-map.md when source ownership is involved.
- Open PROJECT_PATHS.md when external local paths, sessions, HAR files, or related projects are involved.

Repo rules:
- Preserve confirm: true for every write or destructive MCP tool.
- Never commit .env, tokens, sessions, unredacted HARs, logs, raw API responses, or personal finance data.
- Edit src/ for runtime behavior and test/ for tests.
- Do not manually edit dist/ as a standalone change.
- Use integer cents for money and YYYY-MM-DD dates.
- Prefer existing helpers in src/response.ts, src/client.ts, src/auth.ts, src/oauth.ts, and src/tools.ts.
- Update llms.txt/docs when architecture, commands, tools, payload rules, or security rules change.
- Keep remote deploy docs and artifacts Cloudflare Workers-only unless the task explicitly changes that project policy.

Before editing, state:
- Change class:
- Owner files:
- Verification command:

Stop and checkpoint if:
- The same tool error happens 3 times.
- More than 30 tool calls happen without a concrete edit or verified finding.
- Full lint/build fails because of files outside the touched scope.
- Sensitive API/HAR/session data cannot be safely redacted.

Task list (initialize in task.md):
- [ ] Read existing session checkpoint (.agents/session-checkpoint.md)
- [ ] <task sub-item 1>
- [ ] <task sub-item 2>
- [ ] Run formatting (npm run format) and verification (npm run verify)
- [ ] Review initial demand, what was accomplished, how it was done, and validate agent instructions/files
- [ ] Run session checkpoint (npm run session:checkpoint)
```
