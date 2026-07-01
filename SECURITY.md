# Security

This MCP can read and mutate personal finance data. Treat it as sensitive infrastructure.

- Never commit `.env` or bearer tokens.
- Treat Despezzas passwords as exposed if pasted into chats, logs, shell history, screenshots, or committed files. Rotate the password after accidental exposure.
- Prefer private GitHub repositories unless you intentionally want the code public.
- Use `MCP_HTTP_BEARER_TOKEN` when running HTTP mode outside localhost.
- Put HTTPS, authentication, and IP/mTLS restrictions in front of any remotely hosted MCP endpoint.
- The HTTP `/login` page accepts your Despezzas password. Use it on localhost or behind strong access control only.
- For ChatGPT, prefer OAuth mode. ChatGPT should receive only an opaque MCP access token, never your Despezzas password, Firebase refresh token, or Despezzas bearer token.
- Review every write tool call before passing `confirm: true`.

If a Despezzas token is exposed, sign out of Despezzas sessions and rotate credentials where possible.
