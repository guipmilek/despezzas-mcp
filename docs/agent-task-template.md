# Agent Task Template

```text
Task:
<specific desired change>

Preflight:
- Read .agents/session-checkpoint.md when present.
- Confirm git status and cwd.
- Read AGENTS.md, llms.txt, and docs/agent-playbook.md.
- Use CodeGraph before broad source scans and rg for exact text.

Rules:
- Keep confirm:true on every write.
- Keep raw non-GET behind allow_destructive:true and confirm:true.
- Never commit secrets, sessions, HARs, API responses, or financial data.
- Use integer cents and YYYY-MM-DD dates.
- Keep Horizon as the only remote deployment path.

Checklist:
- [ ] Restore checkpoint context
- [ ] Implement the smallest scoped change
- [ ] Add focused tests
- [ ] Run Ruff, pytest, and fastmcp inspect
- [ ] Update relevant docs/llms.txt
- [ ] Review diff for sensitive/unrelated files
- [ ] Commit and push
```
