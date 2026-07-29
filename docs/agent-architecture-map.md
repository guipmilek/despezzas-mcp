# Agent Architecture Map

## Runtime flow

```text
Horizon OAuth
  -> FastMCP server.py
  -> validated tool in tools.py
  -> DespezzasClient in client.py
  -> AuthManager in auth.py
  -> api.despezzas.com / Firebase
```

Horizon owns public HTTP transport and OAuth. This repository owns only the FastMCP
object and Despezzas-side authentication. One process serves one account configured by
deployment secrets.

## Source ownership

- `server.py`: server metadata and registration only.
- `tools.py`: all public MCP names, schemas, annotations, response shapes, and write guards.
- `client.py`: endpoint methods and exactly one retry after HTTP 401.
- `auth.py`: manual-token precedence, login, refresh, and concurrency lock.
- `helpers.py`: deterministic transformations without network access.

## Change checklists

Tool change:

1. Update `tools.py`.
2. Preserve confirmation for writes.
3. Add/update catalog and behavior tests.
4. Synchronize `llms.txt` and user docs.

Endpoint change:

1. Add the method to `client.py`.
2. Keep raw response details out of exception messages.
3. Add an `httpx.MockTransport` test.

Auth change:

1. Keep sessions in memory.
2. Ensure concurrent calls share login/refresh.
3. Retry API requests only once after 401.

Deploy change:

1. Preserve `src/despezzas_mcp/server.py:mcp`.
2. Update `docs/deployment.md`.
3. Verify with `fastmcp inspect`.
