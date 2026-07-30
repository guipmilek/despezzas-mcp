# Deploy no Prefect Horizon

O deploy remoto mantido é o Prefect Horizon. O Horizon clona o fork, instala
`pyproject.toml`, importa o objeto FastMCP e fornece URL, OAuth, CI/CD e previews.

## Modelo operacional

- Um fork e um deployment por conta Despezzas.
- Horizon OAuth controla quem acessa o MCP.
- Credenciais do Despezzas ficam nos secrets daquele servidor.
- A sessão Firebase fica em memória e é renovada automaticamente.
- Cold starts fazem novo login; não existe banco, KV ou arquivo de sessão.

## Passo a passo

1. Faça fork do repositório no GitHub.
2. Acesse <https://horizon.prefect.io/> e selecione o fork.
3. Configure:
   - **Entrypoint:** `src/despezzas_mcp/server.py:mcp`
   - **Authentication:** habilitada
4. Cadastre uma opção de autenticação:
   - `DESPEZZAS_TOKEN`; ou
   - `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD` e `DESPEZZAS_FIREBASE_API_KEY`.
5. Opcionalmente defina `DESPEZZAS_API_BASE_URL`.
6. Faça deploy e abra o Horizon Inspector.
7. Teste primeiro `despezzas_status`, depois uma leitura como
   `despezzas_list_accounts`.

O endpoint publicado tem formato semelhante a:

```text
https://seu-servidor.fastmcp.app/mcp
```

## Atualização do schema das ferramentas

Quando uma versão adiciona parâmetros MCP, faça novo deploy do commit e reconecte
o servidor no cliente. O Horizon ou o cliente podem manter o catálogo anterior em
cache; sem essa atualização, a resposta pode conter um `next_cursor` que o schema
local antigo ainda não aceita como entrada.

Na versão `0.1.1`, `despezzas_search_transactions` expõe publicamente `cursor` e
`offset`. Confirme no Horizon Inspector que ambos aparecem antes de retomar uma
busca paginada.

Não coloque secrets no repositório, nos logs de build ou em screenshots. A primeira
versão aceita a URL `fastmcp.app`; domínio personalizado não é mantido.

## Verificação local

```powershell
uv sync --extra dev
uv run ruff format --check .
uv run ruff check .
uv run pytest
uv run fastmcp inspect src/despezzas_mcp/server.py:mcp
```

Referências:

- <https://gofastmcp.com/deployment/prefect-horizon>
- <https://www.prefect.io/pricing?product=horizon>
