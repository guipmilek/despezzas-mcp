# Notas de Deploy

Este servidor MCP precisa de URL HTTPS pública e acesso de saída para Despezzas e Firebase. Não funciona em hospedagem estática. Roda em Node (serviço tradicional, container ou serverless) ou atrás de um proxy FastMCP no Prefect Horizon — desde que o `MCP_OAUTH_TOKEN_SECRET` seja estável.

## Configurações Obrigatórias de Runtime

Use estas configurações em todo provedor remoto:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
MCP_OAUTH_TOKEN_SECRET=<segredo-longo-aleatorio>
MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
```

Para deploys públicos multiusuário em Cloudflare Workers, configure também:

```dotenv
DESPEZZAS_SESSIONS=<Cloudflare KV binding>
SESSION_ENCRYPTION_KEY=<segredo-longo-aleatorio>
```

Para deploys privados de conta única, use:

```dotenv
MCP_OWNER_AUTH_CODE=<codigo-de-proprietario>
```

Defina `MCP_PUBLIC_BASE_URL=https://seu-host-publico` se a descoberta OAuth retornar host ou protocolo incorreto atrás do proxy do provedor. Caso contrário, o servidor infere a URL pública pelos cabeçalhos da requisição.

Para autenticação no Despezzas, escolha uma opção:

- Hospedagem efêmera (escala a zero): defina `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD`, `DESPEZZAS_FIREBASE_API_KEY` e `DESPEZZAS_SESSION_FILE=none`.
- Hospedagem durável (com volume): defina `DESPEZZAS_FIREBASE_API_KEY`, aponte `DESPEZZAS_SESSION_FILE` para um caminho no volume e use `/login` uma vez.

Não faça commit de credenciais do Despezzas. Adicione-as apenas como secrets/variáveis de ambiente no provedor.

## Suporte Atual do Repositório

- Deploys Node nativos podem usar `npm ci --include=dev && npm run build` e depois `node dist/index.js`.
- `wrangler.jsonc` e `src/cloudflare.ts` estão incluídos para Cloudflare Workers.
- `render.yaml` está incluído para Render Blueprints.
- `railway.json` está incluído para Railway.
- `vercel.json` com `api/index.js` está incluído para Vercel Functions.
- `Dockerfile` está incluído para Koyeb, Cloud Run, Fly.io, Northflank, deploys Docker no Railway ou uma VM.
- `horizon_proxy.py` com `requirements.txt` está incluído para Prefect Horizon como proxy FastMCP na frente de um backend Node já publicado.
- `/health` está pronto para verificações de saúde de provedores.
- `/mcp` é a URL do servidor MCP para o ChatGPT.
- Endpoints de descoberta OAuth são expostos em `/.well-known/*`.

## Melhores Opções Gratuitas Para Este MCP

1. Cloudflare Workers Free
   Melhor escolha atual. Oferece HTTPS, sem hibernação de container, plano gratuito generoso e suporte oficial para MCP remoto via Streamable HTTP. O worker usa o transporte web-standard diretamente, sem Durable Objects — as ferramentas atuais são stateless. Veja [cloudflare-workers.md](cloudflare-workers.md).

2. Koyeb Free Instance
   Melhor alternativa gratuita em container. Roda o Dockerfile incluído a partir do GitHub e fornece um domínio HTTPS público. A Free Instance escala para zero após 1 hora ociosa e não oferece volumes persistentes; use `DESPEZZAS_EMAIL`/`DESPEZZAS_PASSWORD`/`DESPEZZAS_FIREBASE_API_KEY` e `DESPEZZAS_SESSION_FILE=none`. Veja [koyeb.md](koyeb.md).

3. Oracle Cloud Always Free VM
   Melhor opção "realmente gratuita e estável" se você aceita gerenciar uma VM pequena. Oferece disco persistente e processo sempre ativo, então o modelo de login/sessão do MCP funciona de forma mais natural. Contrapartida: mais trabalho com SSH, firewall, Docker/systemd e TLS.

4. Vercel Hobby
   Boa opção gratuita baseada em Git. A Vercel tem documentação específica para Functions, metadados OAuth e hosts MCP. Este repositório usa um adaptador Express em vez do `mcp-handler` dos exemplos oficiais.

5. Prefect Horizon
   Melhor gateway nativo MCP para quem quer hospedagem gerenciada com autenticação, controle de acesso, logs, Inspector e ChatMCP. O Horizon espera um ponto de entrada Python FastMCP, então este repositório inclui um proxy que encaminha para um backend Node já publicado em Koyeb, Vercel, Render, Cloudflare ou similar.

6. Render Free Web Service
   Caminho GitHub-para-URL mais simples e bom para testar MVP. Serviços web gratuitos hibernam após 15 minutos e perdem alterações no sistema de arquivos em reinícios. Use o `render.yaml` incluído, defina credenciais Despezzas como segredos e mantenha `DESPEZZAS_SESSION_FILE=none`.

7. Railway Free
   Experiência de desenvolvimento muito fluida e permite anexar um volume pequeno, mas o plano gratuito é baseado em créditos de uso. Bom para testes e uso pessoal de curta duração; menos ideal como serviço sempre ligado e gratuito para sempre.

8. Northflank Developer Sandbox
   Plataforma de container sólida para experimentação. O sandbox gratuito é explicitamente para testes/exploração pessoal, não produção. Boa alternativa se você gosta do painel.

Google Cloud Run continua tecnicamente suportado pelo Dockerfile, mas não é o caminho atual.

Discussões da comunidade apontam também AWS, Supabase, Zapier e plataformas MCP especializadas. Vale acompanhar, mas o repositório atual não foi feito para builders low-code.

Evite Netlify e hosts estáticos. O servidor é um serviço Express com rotas OAuth — não funciona como arquivos estáticos.

## Cloudflare Workers

Cloudflare Workers é o deploy recomendado.

Suporte incluído:

- `src/cloudflare.ts`: app Hono Worker com descoberta OAuth, login, health e `/mcp`.
- `wrangler.jsonc`: configuração do Worker com `nodejs_compat` e variáveis padrão seguras.
- `npm run check:cloudflare`: validação do bundle pelo Wrangler sem publicar.
- `npm run deploy:cloudflare`: deploy para Workers.

Defina secrets:

```powershell
npx wrangler secret put MCP_OAUTH_TOKEN_SECRET
npx wrangler secret put SESSION_ENCRYPTION_KEY
npx wrangler secret put DESPEZZAS_FIREBASE_API_KEY
```

> **Dica:** `DESPEZZAS_FIREBASE_API_KEY` é uma chave pública do Firebase Web — o próprio frontend do Despezzas a expõe no código-fonte. Para encontrá-la, abra https://despezzas.com, pressione F12, vá em Sources e procure por `apiKey`.
Crie e associe o namespace KV:

```powershell
npx wrangler kv namespace create DESPEZZAS_SESSIONS
```

Cole o namespace id gerado em `wrangler.jsonc` no binding `DESPEZZAS_SESSIONS`. Não defina `DESPEZZAS_EMAIL` / `DESPEZZAS_PASSWORD` globais no modo multiusuário; cada usuário entra com a própria conta Despezzas durante o OAuth do ChatGPT.

Para modo privado de conta única, defina `MCP_OWNER_AUTH_CODE`, `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD` e `DESPEZZAS_FIREBASE_API_KEY` como secrets.

Deploy:

```powershell
npm run check:cloudflare
npm run deploy:cloudflare
```

Depois conecte no ChatGPT:

- URL do servidor: `https://despezzas-mcp.<sua-conta>.workers.dev/mcp`
- Autenticação: OAuth

Guia completo: [cloudflare-workers.md](cloudflare-workers.md).

## Render

O `render.yaml` incluído configura:

- Web service gratuito
- Runtime: Node
- Comando de build: `npm ci --include=dev && npm run build`
- Comando de start: `node dist/index.js`
- Verificação de saúde: `/health`
- `MCP_TRANSPORT=http`
- `HOST=0.0.0.0`
- `MCP_OAUTH_TOKEN_SECRET` gerado

Depois de criar o Blueprint, preencha estes placeholders de secrets no Render:

```dotenv
DESPEZZAS_EMAIL=<seu-email>
DESPEZZAS_PASSWORD=<sua-senha>
DESPEZZAS_FIREBASE_API_KEY=<chave-publica-firebase-do-despezzas>
MCP_OWNER_AUTH_CODE=<codigo-de-proprietario>
MCP_PUBLIC_BASE_URL=https://seu-servico.onrender.com
```

Depois conecte no ChatGPT:

- URL do servidor: `https://seu-servico.onrender.com/mcp`
- Autenticação: OAuth

## Railway

O `railway.json` incluído usa o Dockerfile e `/health`.

Defina variáveis:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
MCP_OAUTH_TOKEN_SECRET=<segredo-longo-aleatorio>
MCP_OWNER_AUTH_CODE=<codigo-de-proprietario>
DESPEZZAS_EMAIL=<seu-email>
DESPEZZAS_PASSWORD=<sua-senha>
DESPEZZAS_FIREBASE_API_KEY=<chave-publica-firebase-do-despezzas>
DESPEZZAS_SESSION_FILE=none
```

Gere um domínio público no Railway e, opcionalmente, defina:

```dotenv
MCP_PUBLIC_BASE_URL=https://seu-servico.up.railway.app
```

Se adicionar um volume no Railway, monte em `/data` e use:

```dotenv
DESPEZZAS_SESSION_FILE=/data/session.json
```

## Vercel

O `vercel.json` incluído roteia todas as requisições para `api/index.js`, que importa o app Express compilado de `dist/index.js`.

O guia MCP da Vercel mostra `mcp-handler` com uma rota Next.js como `/api/mcp`. Este repositório mantém o servidor MCP Express existente e reescreve todos os caminhos para a Vercel Function, então o endpoint MCP publicado continua sendo `/mcp`. Manter `/mcp` na raiz também simplifica a descoberta de protected-resource OAuth para o ChatGPT.

Configurações recomendadas do projeto:

- Preset de framework: Other
- Comando de instalação: `npm ci`
- Comando de build: `npm run build`
- Diretório de saída: deixar vazio

Defina variáveis:

```dotenv
MCP_OAUTH_TOKEN_SECRET=<segredo-longo-aleatorio>
MCP_OWNER_AUTH_CODE=<codigo-de-proprietario>
MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
DESPEZZAS_EMAIL=<seu-email>
DESPEZZAS_PASSWORD=<sua-senha>
DESPEZZAS_FIREBASE_API_KEY=<chave-publica-firebase-do-despezzas>
DESPEZZAS_SESSION_FILE=none
MCP_PUBLIC_BASE_URL=https://seu-projeto.vercel.app
```

`MCP_TRANSPORT` e `HOST` não são obrigatórios na Vercel, porque a Vercel importa o app Express em vez de iniciar `node dist/index.js`. Você ainda pode definir `MCP_TRANSPORT=http` por consistência.

Depois conecte no ChatGPT:

- URL do servidor: `https://seu-projeto.vercel.app/mcp`
- Autenticação: OAuth

Vercel Functions são sem estado e escalam para zero, então não dependa do arquivo de sessão de `/login` ali. Use credenciais Despezzas em variáveis de ambiente ou adicione armazenamento durável depois.

## Prefect Horizon

Horizon é uma plataforma de deploy nativa para MCP da equipe FastMCP. Ela oferece hospedagem gerenciada, autenticação, controle de acesso, registro, Inspector e testes com ChatMCP, com um plano pessoal gratuito descrito na documentação do FastMCP.

Nota: o Horizon publica servidores Python FastMCP. Este projeto é TypeScript/Node, então `horizon_proxy.py` é um proxy FastMCP que encaminha tráfego do Horizon para um backend Node hospedado em outro lugar.

Fluxo de deploy:

1. Publique o backend Node no Cloud Run, Vercel, Render, Koyeb, Railway ou em uma VM.
2. Proteja esse backend com um bearer token estático:

   ```dotenv
   MCP_HTTP_BEARER_TOKEN=<segredo-longo-do-backend>
   ```

3. No Horizon, selecione este repositório GitHub e configure:

   - Ponto de entrada: `horizon_proxy.py:mcp`
   - Autenticação: habilitada

4. Adicione variáveis de ambiente no Horizon:

   ```dotenv
   DESPEZZAS_MCP_BACKEND_URL=https://seu-backend-node.example.com/mcp
   DESPEZZAS_MCP_BACKEND_TOKEN=<mesmo-segredo-longo-do-backend>
   ```

5. Use a URL MCP do Horizon, geralmente:

   ```text
   https://nome-do-seu-servidor.fastmcp.app/mcp
   ```

Nesse caminho, o Horizon é a camada pública de autenticação MCP e o backend Node é a camada privada de implementação. Não coloque credenciais Despezzas no Horizon, a menos que você decida portar a implementação real do Despezzas MCP para Python depois.

## Koyeb

Use o Dockerfile deste repositório. Koyeb Free é adequado para testes hobby, mas escala para zero depois de tempo ocioso e não suporta volumes, então configure credenciais por ambiente e desative persistência de sessão.

Configurações recomendadas no Koyeb:
- Método de deploy: GitHub.
- Construtor: Dockerfile.
- Local do Dockerfile: `Dockerfile`.
- Tipo de instância: Free.
- Porta exposta: `8787`.
- Caminho de verificação de saúde: `/health`.

Variáveis obrigatórias:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
PORT=8787
MCP_OAUTH_TOKEN_SECRET=<segredo-longo-aleatorio>
MCP_OWNER_AUTH_CODE=<codigo-de-proprietario>
MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
DESPEZZAS_EMAIL=<seu-email>
DESPEZZAS_PASSWORD=<sua-senha>
DESPEZZAS_FIREBASE_API_KEY=<chave-publica-firebase-do-despezzas>
DESPEZZAS_SESSION_FILE=none
MCP_PUBLIC_BASE_URL=https://seu-app-sua-org.koyeb.app
```

O Koyeb expõe um domínio público por `KOYEB_PUBLIC_DOMAIN`, então você também pode definir `MCP_PUBLIC_BASE_URL` como `https://{{ KOYEB_PUBLIC_DOMAIN }}` se estiver usando interpolação de variáveis do Koyeb.

Depois conecte no ChatGPT:

- URL do servidor: `https://seu-app-sua-org.koyeb.app/mcp`
- Autenticação: OAuth

Guia completo: [koyeb.md](koyeb.md).

## Cloud Run

Use o Dockerfile. Cloud Run é sem estado por padrão, então use credenciais em variáveis de ambiente e sem arquivo de sessão:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
MCP_OAUTH_TOKEN_SECRET=<segredo-longo-aleatorio>
MCP_OWNER_AUTH_CODE=<codigo-de-proprietario>
DESPEZZAS_EMAIL=<seu-email>
DESPEZZAS_PASSWORD=<sua-senha>
DESPEZZAS_FIREBASE_API_KEY=<chave-publica-firebase-do-despezzas>
DESPEZZAS_SESSION_FILE=none
MCP_PUBLIC_BASE_URL=https://sua-url-cloud-run
```

Para uso direto como app personalizado do ChatGPT, o Cloud Run precisa ser acessível pelo ChatGPT; publique o serviço publicamente e conte com a camada OAuth do MCP para proteger `/mcp`:

```powershell
gcloud run deploy despezzas-mcp --source . --region=us-central1 --allow-unauthenticated
```

Para clientes MCP internos/locais, a orientação de MCP do Google recomenda serviços Cloud Run protegidos por IAM:

```powershell
gcloud run deploy despezzas-mcp --source . --region=us-central1 --no-allow-unauthenticated
gcloud run services proxy despezzas-mcp --region=us-central1 --port=3000
```

Esse modo protegido por IAM é mais forte para clientes locais, mas não serve para conexão direta do ChatGPT, a menos que o ChatGPT consiga fornecer um ID token emitido pelo Google para seu serviço Cloud Run. Para ChatGPT, use Cloud Run público com OAuth MCP, ou coloque o Prefect Horizon na frente do backend.

## Gerar Secrets

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Fontes

- Documentação de deploy do OpenAI Apps SDK: https://developers.openai.com/apps-sdk/deploy
- Guia de servidor MCP remoto da Cloudflare: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
- Preços e limites gratuitos do Cloudflare Workers: https://developers.cloudflare.com/workers/platform/pricing/
- Limites do serviço gratuito do Render: https://render.com/docs/free
- Documentação de deploy Node/Express no Render: https://render.com/docs/deploy-node-express-app
- Documentação de Blueprint do Render: https://render.com/docs/blueprint-spec
- Documentação de deploy Express no Railway: https://docs.railway.com/guides/express
- Preços/documentação do Railway: https://docs.railway.com/pricing
- Documentação de rede pública do Railway: https://docs.railway.com/networking/public-networking
- Documentação de deploy Express no Koyeb: https://www.koyeb.com/docs/deploy/express
- Referência de Koyeb Free Instance: https://www.koyeb.com/docs/reference/instances
- Documentação de deploy GitHub no Koyeb: https://www.koyeb.com/docs/build-and-deploy/deploy-with-git
- Documentação de escala para zero do Koyeb: https://www.koyeb.com/docs/run-and-scale/scale-to-zero
- Preços/plano gratuito do Google Cloud Run: https://cloud.google.com/run/pricing
- Recursos Oracle Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Documentação do sandbox gratuito Northflank: https://northflank.com/docs/v1/application/billing/pricing-on-northflank
- Documentação de deploy Express na Vercel: https://vercel.com/docs/frameworks/backend/express
- Documentação de Vercel Functions: https://vercel.com/docs/functions
- Limites de Vercel Functions: https://vercel.com/docs/functions/limitations
- Documentação de deploy MCP na Vercel: https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel
- Documentação de hospedagem MCP no Google Cloud Run: https://cloud.google.com/run/docs/host-mcp-servers
- Blog Google Cloud MCP no Cloud Run: https://cloud.google.com/blog/topics/developers-practitioners/build-and-deploy-a-remote-mcp-server-to-google-cloud-run-in-under-10-minutes
- Documentação Prefect Horizon / FastMCP: https://gofastmcp.com/deployment/prefect-horizon
- Documentação de provedor proxy FastMCP: https://gofastmcp.com/servers/providers/proxy
- Discussão da comunidade sobre plataformas de deploy MCP: https://www.reddit.com/r/mcp/comments/1qh1tlt/platforms_for_easy_mcp_deployment/
