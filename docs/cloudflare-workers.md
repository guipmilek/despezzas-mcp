# Deploy em Cloudflare Workers

Cloudflare Workers é a hospedagem remota gratuita preferida para este MCP no momento. O repositório inclui um ponto de entrada nativo de Worker em `src/cloudflare.ts` e `wrangler.jsonc`.

Esta implementação segue a orientação da Cloudflare para MCP remoto usando Streamable HTTP em `/mcp`. Ela usa o caminho bruto `WebStandardStreamableHTTPServerTransport` em vez de `McpAgent`, porque as ferramentas do Despezzas são sem estado por requisição MCP e o estado de cliente/código/token de acesso OAuth é assinado com `MCP_OAUTH_TOKEN_SECRET`.

O Cloudflare suporta dois modos:

- Modo multiusuário: cada usuário do ChatGPT faz login com sua própria conta Despezzas. O Worker armazena a sessão Firebase de refresh desse usuário criptografada no Workers KV e vincula o token OAuth do ChatGPT a essa sessão.
- Modo conta única: o Worker usa uma conta Despezzas definida nos secrets do Worker e protege a autorização com `MCP_OWNER_AUTH_CODE`.

## Por Que Este Caminho Faz Sentido

- O uso gratuito do Workers é suficiente para um MCP de finanças pessoais em uso normal.
- Não há suspensão/inicialização fria de container como no Koyeb Free ou Render Free.
- HTTPS e URL `workers.dev` já vêm embutidos.
- O ChatGPT consegue conectar diretamente em `https://<nome-do-worker>.<sua-conta>.workers.dev/mcp`.
- No modo multiusuário, senhas do Despezzas nunca são armazenadas. Apenas tokens de sessão Firebase criptografados são gravados no Workers KV.
- O ChatGPT recebe apenas um token de acesso OAuth MCP opaco.

O Cloudflare Workers Free tem limites diários, e Workers KV está disponível na plataforma Workers. Durable Objects também estão disponíveis no Workers Free com backend de armazenamento SQLite. Este repositório usa Workers KV para sessões multiusuário.

## Antes do Deploy

Troque a senha do Despezzas que foi colada no histórico de chat antes de colocar credenciais em qualquer provedor cloud.

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

Se este for o primeiro Worker na conta Cloudflare, abra Workers & Pages no dashboard da Cloudflare e registre um subdomínio `workers.dev` antes do deploy. O Wrangler não consegue escolher esse subdomínio em builds CI/CD não interativos.

## Configurar Secrets

Crie um segredo estável para assinatura OAuth:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Adicione-o à Cloudflare:

```powershell
npx wrangler secret put MCP_OAUTH_TOKEN_SECRET
```

## Modo Multiusuário

Use este modo se mais de uma pessoa deve conectar a própria conta Despezzas ao próprio ChatGPT.

Crie um namespace KV:

```powershell
npx wrangler kv namespace create DESPEZZAS_SESSIONS
```

O Wrangler imprime um bloco `kv_namespaces`. Cole o `id` gerado no bloco `kv_namespaces` comentado em `wrangler.jsonc` e mantenha o nome do binding exatamente:

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

Para modo multiusuário, não defina credenciais globais do Despezzas. Se você já as adicionou para testes privados, remova:

```powershell
npx wrangler secret delete DESPEZZAS_EMAIL
npx wrangler secret delete DESPEZZAS_PASSWORD
```

Usuários digitarão o próprio email/senha do Despezzas durante a conexão OAuth do ChatGPT. O Worker troca essa senha por tokens Firebase e armazena apenas a sessão Firebase criptografada no KV.

## Modo Conta Única

Use este modo apenas quando o Worker for para sua própria conta ChatGPT e sua própria conta Despezzas.

Crie um código de acesso de proprietário. Este é o código que você digita na tela de login do MCP quando o ChatGPT conecta, para que só você possa autorizar o ChatGPT a usar a conta Despezzas armazenada nos secrets do Worker:

```powershell
node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"
```

Adicione o código e as credenciais Despezzas à Cloudflare:

```powershell
npx wrangler secret put MCP_OWNER_AUTH_CODE
npx wrangler secret put DESPEZZAS_EMAIL
npx wrangler secret put DESPEZZAS_PASSWORD
```

Secrets opcionais:

```powershell
npx wrangler secret put DESPEZZAS_TOKEN
npx wrangler secret put MCP_HTTP_BEARER_TOKEN
```

Não coloque credenciais do Despezzas em `wrangler.jsonc`. Esse arquivo é commitado no Git.

## Deploy

```powershell
npm run deploy:cloudflare
```

O Wrangler imprimirá uma URL como:

```text
https://despezzas-mcp.<sua-conta>.workers.dev
```

Verifique a saúde:

```powershell
Invoke-RestMethod https://despezzas-mcp.<sua-conta>.workers.dev/health
```

Se o deploy falhar com `You need to register a workers.dev subdomain before publishing to workers.dev`, conclua o onboarding de Workers na Cloudflare e rode `npm run deploy:cloudflare` novamente.

Abra a página de login se quiser testar diretamente a tela de autenticação do Despezzas:

```text
https://despezzas-mcp.<sua-conta>.workers.dev/login
```

## Conectar ao ChatGPT

Em ChatGPT Apps / Custom Tool:

- Nome: `Despezzas`
- URL do servidor: `https://despezzas-mcp.<sua-conta>.workers.dev/mcp`
- Autenticação: `OAuth`

No modo multiusuário, cada usuário verá o formulário de login do Despezzas durante o OAuth e deve informar as próprias credenciais do Despezzas. O token de acesso OAuth do ChatGPT fica vinculado à sessão criptografada desse usuário no KV.

O Worker expõe os endpoints de descoberta esperados pelo ChatGPT:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`

## Domínio Personalizado

O Worker normalmente infere sua URL pública pela requisição recebida. Se você anexar um domínio personalizado e a descoberta OAuth retornar a URL base errada, defina `MCP_PUBLIC_BASE_URL` em `wrangler.jsonc`:

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

- `DESPEZZAS_SESSION_FILE=none` é definido em `wrangler.jsonc`; Workers não fornecem um sistema de arquivos persistente normal.
- O modo multiusuário exige KV `DESPEZZAS_SESSIONS` e `SESSION_ENCRYPTION_KEY`.
- O modo conta única exige `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD` e `MCP_OWNER_AUTH_CODE`.
- `MCP_OWNER_AUTH_CODE` é ignorado quando o armazenamento KV multiusuário está configurado.
- A página `/login` é principalmente um caminho de teste/autorização manual. Usuários do ChatGPT devem conectar pelo OAuth do ChatGPT.
- Uma versão futura poderia migrar de KV para `McpAgent` com Durable Objects se precisarmos de estado por sessão mais rico.

## Nota de Confiança

O Despezzas não fornece OAuth oficial. No modo multiusuário, usuários informam a senha do Despezzas na página de login deste MCP. Execute isto apenas para pessoas que confiam no operador do Worker. A implementação não armazena senhas em texto puro, mas o Worker as recebe brevemente para trocá-las por tokens de sessão Despezzas/Firebase.
