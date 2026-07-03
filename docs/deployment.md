# Notas de deploy

O deploy remoto suportado neste projeto é Cloudflare Workers. O servidor local via
`stdio` e o modo HTTP Node continuam disponíveis para desenvolvimento e uso local, mas
não são métodos de deploy remoto mantidos.

Para o passo a passo completo, use [cloudflare-workers.md](cloudflare-workers.md).

## Suporte atual do repositório

- `wrangler.jsonc`: configuração do Worker com `nodejs_compat`, variáveis padrão seguras
  e binding KV `DESPEZZAS_SESSIONS`.
- `src/cloudflare.ts`: app Hono Worker com `/health`, `/login`, descoberta OAuth e `/mcp`.
- `src/cloudflareSessions.ts`: persistência criptografada de sessões no Workers KV.
- `npm run check:cloudflare`: valida o bundle do Worker sem publicar.
- `npm run deploy:cloudflare`: publica o Worker.

## Configuração obrigatória

Gere e defina o segredo de assinatura OAuth:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npx wrangler secret put MCP_OAUTH_TOKEN_SECRET
```

Para modo multiusuário, crie o namespace KV e defina os secrets:

```powershell
npx wrangler kv namespace create DESPEZZAS_SESSIONS
npx wrangler secret put SESSION_ENCRYPTION_KEY
npx wrangler secret put DESPEZZAS_FIREBASE_API_KEY
```

Cole o `id` retornado pelo Wrangler no binding `DESPEZZAS_SESSIONS` em `wrangler.jsonc`.
Não defina `DESPEZZAS_EMAIL` nem `DESPEZZAS_PASSWORD` globais no modo multiusuário.

Para modo privado de conta única, defina também:

```powershell
npx wrangler secret put MCP_OWNER_AUTH_CODE
npx wrangler secret put DESPEZZAS_EMAIL
npx wrangler secret put DESPEZZAS_PASSWORD
```

Nunca coloque credenciais no `wrangler.jsonc`, em `.env` commitado ou em documentação.
Use apenas `wrangler secret put`.

## Deploy

```powershell
npm run check:cloudflare
npm run deploy:cloudflare
```

O deploy gera uma URL como:

```text
https://despezzas-mcp.<sua-conta>.workers.dev
```

Verifique a saúde do Worker:

```powershell
Invoke-RestMethod https://despezzas-mcp.<sua-conta>.workers.dev/health
```

Depois conecte no ChatGPT:

- URL do servidor: `https://despezzas-mcp.<sua-conta>.workers.dev/mcp`
- Autenticação: OAuth

## Domínio personalizado

O Worker normalmente infere a URL pública pela requisição recebida. Se você anexar um
domínio personalizado e a descoberta OAuth retornar a URL errada, defina
`MCP_PUBLIC_BASE_URL` em `wrangler.jsonc` e rode `npm run deploy:cloudflare` novamente.

## Referências

- Guia completo do projeto: [cloudflare-workers.md](cloudflare-workers.md)
- Cloudflare Workers: https://workers.cloudflare.com/
- Wrangler: https://developers.cloudflare.com/workers/wrangler/
