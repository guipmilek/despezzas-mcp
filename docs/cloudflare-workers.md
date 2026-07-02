# Deploy em Cloudflare Workers

Cloudflare Workers é a hospedagem remota recomendada para este MCP. O repositório inclui um ponto de entrada nativo de Worker em `src/cloudflare.ts` e `wrangler.jsonc`.

Usa Streamable HTTP no `/mcp`, seguindo a documentação da Cloudflare. O transporte é `WebStandardStreamableHTTPServerTransport` em vez de `McpAgent` — as ferramentas são stateless e o estado OAuth é assinado com `MCP_OAUTH_TOKEN_SECRET`.

Dois modos de operação:

- Multiusuário: cada pessoa faz login com a própria conta Despezzas. A sessão Firebase é criptografada e salva no Workers KV, vinculada ao token OAuth do ChatGPT.
- Conta única: o Worker usa uma conta fixa do Despezzas (definida nos secrets) e protege o acesso com `MCP_OWNER_AUTH_CODE`.

## Por Que Este Caminho Faz Sentido

- O plano gratuito do Workers cobre um MCP de finanças pessoais sem problemas.
- Sem hibernação de container nem cold start como no Koyeb ou Render Free.
- HTTPS e URL `workers.dev` já vêm embutidos.
- O ChatGPT conecta direto em `https://<nome-do-worker>.<sua-conta>.workers.dev/mcp`.
- Senhas do Despezzas nunca são armazenadas. Apenas tokens de sessão Firebase criptografados vão para o Workers KV.
- O ChatGPT recebe apenas um token de acesso OAuth MCP opaco.

O Cloudflare Workers Free tem limites diários, e Workers KV está disponível na plataforma. Durable Objects também estão disponíveis no plano Free com backend SQLite. Este repositório usa Workers KV para sessões multiusuário.

## Antes do Deploy

Troque a senha do Despezzas que foi colada no chat antes de configurar credenciais em qualquer provedor cloud.

Instale as dependências:

```powershell
npm install
```

Verifique o TypeScript e o bundle do Worker:

```powershell
npm run typecheck
npm run check:cloudflare
```

Faça login na Cloudflare:

```powershell
npx wrangler login
```

Se este for o primeiro Worker na conta Cloudflare, abra Workers & Pages no dashboard da Cloudflare e registre um subdomínio `workers.dev` antes do deploy. O Wrangler não seleciona subdomínio em builds CI/CD não interativos.

## Configurar Secrets

Gere um segredo de assinatura OAuth:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Adicione-o à Cloudflare:

```powershell
npx wrangler secret put MCP_OAUTH_TOKEN_SECRET
```

## Modo Multiusuário

Use este modo se mais de uma pessoa for conectar a própria conta Despezzas ao ChatGPT.

Crie um namespace KV:

```powershell
npx wrangler kv namespace create DESPEZZAS_SESSIONS
```

O comando retorna um bloco `kv_namespaces`. Cole o `id` gerado no `wrangler.jsonc`, no binding `DESPEZZAS_SESSIONS`:

```jsonc
{
  "binding": "DESPEZZAS_SESSIONS",
  "id": "generated-kv-id"
}
```

Crie uma chave de criptografia:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Adicione-a à Cloudflare:

```powershell
npx wrangler secret put SESSION_ENCRYPTION_KEY
```

Adicione também a chave Firebase usada pelo fluxo de login por email/senha. É a mesma chave pública do Firebase Web que o frontend do Despezzas carrega — para encontrá-la, abra https://despezzas.com, pressione F12, vá em Sources e procure por `apiKey` nos arquivos JavaScript.

```powershell
npx wrangler secret put DESPEZZAS_FIREBASE_API_KEY
```

Para modo multiusuário, não defina credenciais globais do Despezzas. Se você já as adicionou para testes privados, remova:

```powershell
npx wrangler secret delete DESPEZZAS_EMAIL
npx wrangler secret delete DESPEZZAS_PASSWORD
```

Cada usuário digita o próprio email e senha na tela de autorização OAuth. O Worker troca a senha por tokens do Firebase e guarda apenas a sessão criptografada no KV.

## Modo Conta Única

Use este modo só quando o Worker for para sua própria conta ChatGPT e sua própria conta Despezzas.

Crie um código de acesso de proprietário. É o código que você digita na tela de login do MCP quando o ChatGPT conecta, para garantir que só você autorize o acesso à conta Despezzas nos secrets do Worker:

```powershell
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

Adicione o código e as credenciais Despezzas à Cloudflare:

```powershell
npx wrangler secret put MCP_OWNER_AUTH_CODE
npx wrangler secret put DESPEZZAS_EMAIL
npx wrangler secret put DESPEZZAS_PASSWORD
npx wrangler secret put DESPEZZAS_FIREBASE_API_KEY
```

Secrets opcionais:

```powershell
npx wrangler secret put DESPEZZAS_TOKEN
npx wrangler secret put MCP_HTTP_BEARER_TOKEN
```

Nunca coloque credenciais no `wrangler.jsonc` — ele vai para o Git. Use `wrangler secret put` em vez disso.

## Deploy

```powershell
npm run deploy:cloudflare
```

O deploy gera uma URL como:

```text
https://despezzas-mcp.<sua-conta>.workers.dev
```

Verifique a saúde:

```powershell
Invoke-RestMethod https://despezzas-mcp.<sua-conta>.workers.dev/health
```

Se o deploy falhar com `You need to register a workers.dev subdomain before publishing to workers.dev`, conclua o onboarding de Workers na Cloudflare e rode `npm run deploy:cloudflare` novamente.

Abra a página de login para testar a tela de autorização:

```text
https://despezzas-mcp.<sua-conta>.workers.dev/login
```

## Conectar ao ChatGPT

Em ChatGPT Apps / Custom Tool:

- Nome: `Despezzas`
- URL do servidor: `https://despezzas-mcp.<sua-conta>.workers.dev/mcp`
- Autenticação: `OAuth`

No modo multiusuário, cada pessoa vê o formulário de autorização durante o OAuth e informa as próprias credenciais do Despezzas. A tela usa a identidade visual do Despezzas, acompanha tema claro/escuro e contém apenas os campos necessários. O token OAuth do ChatGPT fica vinculado à sessão criptografada no KV.

O Worker expõe os endpoints que o ChatGPT espera:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`

## Domínio Personalizado

O Worker normalmente infere a URL pública pela requisição recebida. Se você anexar um domínio personalizado e a descoberta OAuth retornar a URL errada, defina `MCP_PUBLIC_BASE_URL` em `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "MCP_PUBLIC_BASE_URL": "https://mcp.seu-dominio.com"
  }
}
```

Depois faça redeploy:

```powershell
npm run deploy:cloudflare
```

## Notas de Runtime

- `DESPEZZAS_SESSION_FILE=none` está fixo no `wrangler.jsonc` — Workers não têm sistema de arquivos persistente.
- O modo multiusuário exige KV `DESPEZZAS_SESSIONS` e `SESSION_ENCRYPTION_KEY`.
- Conta única exige `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD`, `DESPEZZAS_FIREBASE_API_KEY` e `MCP_OWNER_AUTH_CODE`.
- `MCP_OWNER_AUTH_CODE` é ignorado quando o armazenamento KV multiusuário está configurado.
- A página `/login` é para testes e autorização manual. Não oferece criação de conta, recuperação de senha nem "lembrar de mim" — esses fluxos são do app oficial do Despezzas. Usuários do ChatGPT devem conectar pelo OAuth do ChatGPT.
- Uma versão futura poderia migrar de KV para `McpAgent` com Durable Objects se precisarmos de estado por sessão mais rico.

## Nota de Confiança

O Despezzas não tem OAuth oficial. No modo multiusuário, cada pessoa digita a própria senha na página de login deste MCP. Use apenas com pessoas que confiam em quem opera o Worker. O Worker não armazena senhas — apenas as recebe momentaneamente para trocar por tokens de sessão.
