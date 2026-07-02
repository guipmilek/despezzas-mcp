# Project Paths

Canonical local paths for agents. Verify with `Test-Path -LiteralPath` before using
a path copied from old logs, another AI tool, or a shell transcript.

## Primary Repository

| Purpose                | Path                                                     |
| ---------------------- | -------------------------------------------------------- |
| Despezzas MCP repo     | `C:\Users\guilherme.milek\Desktop\despezzas-mcp`         |
| TypeScript source      | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\src`     |
| Test suite             | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\test`    |
| Project docs           | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\docs`    |
| Local scripts          | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\scripts` |
| Generated build output | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\dist`    |
| Static assets          | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\assets`  |

## Related Local Projects

| Project                       | Path                                                             | Notes                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Atrol design system           | `C:\Users\guilherme.milek\Desktop\atrol-design-system`           | Source for the agent workflow pattern used here. Do not copy design-system code unless explicitly requested. |
| Cadastro automatico backend   | `C:\Users\guilherme.milek\Desktop\cadastro-automatico`           | Related local project.                                                                                       |
| Interface cadastro automatico | `C:\Users\guilherme.milek\Desktop\interface-cadastro-automatico` | Related local project.                                                                                       |
| Useful scripts                | `C:\Users\guilherme.milek\Desktop\useful-scripts`                | Reference only unless the task targets it.                                                                   |

## Local Session And Secret Paths

| Purpose                       | Path                                                                     | Notes                                                            |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Default Despezzas session dir | `%USERPROFILE%\.despezzas-mcp`                                           | Sensitive. Do not commit or paste raw contents.                  |
| Alternate local session file  | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\.despezzas-session.json` | Sensitive and ignored.                                           |
| Local environment file        | `C:\Users\guilherme.milek\Desktop\despezzas-mcp\.env`                    | Sensitive and ignored.                                           |
| Codex Desktop sessions        | `C:\Users\guilherme.milek\.codex\sessions`                               | JSONL sessions grouped by date. Summarize, do not paste secrets. |
| Desktop exported sessions     | `C:\Users\guilherme.milek\Desktop\session-ses_*.md`                      | May contain sensitive context. Inspect before quoting.           |

## Runtime Notes

- `rg` is available and should be the default search tool.
- Use `rg -F` for literal strings such as tool names, endpoint paths, and JSON keys.
- Use PowerShell `-LiteralPath` when paths may contain special characters.
- Node.js must satisfy the package engine: `>=20`.
- `npm test` runs `npm run build` before executing tests.
- `npm run smoke:readonly` requires working Despezzas authentication.

## Generated Or Sensitive Files

Do not manually edit or commit as standalone changes:

- `dist/`

Never commit:

- `.env`
- `.env.*` except `.env.example`
- `.despezzas-mcp/`
- `.despezzas-session.json`
- `*.har`
- `*.har.json`
- `*.log`
- raw API response dumps
- Firebase session JSON files
- unredacted personal finance exports
