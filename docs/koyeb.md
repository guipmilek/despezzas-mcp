# Deploy gratuito no Koyeb

Koyeb Free é uma alternativa em container para este repositório. Usa o `Dockerfile` que já existe — o servidor Node/Express é publicado sem etapa extra de build.

## O que esperar

O plano Free é suficiente para testes e uso pessoal:

- 512 MB de RAM, 0,1 vCPU e 2 GB de SSD.
- Uma instância `Free` por organização.
- Regiões disponíveis: Frankfurt ou Washington, D.C.
- Sem suporte a volumes, escalonamento customizado ou Worker Services.
- Instâncias `Free` escalam para zero depois de 1 hora sem tráfego.

Como a instância escala para zero e não tem volume, use credenciais nas variáveis de ambiente com `DESPEZZAS_SESSION_FILE=none`.

## Deploy pelo GitHub

1. Envie este repositório para o GitHub.
2. No Koyeb, crie um App.
3. Escolha GitHub como método de deploy.
4. Selecione o repositório `despezzas-mcp` na sua conta GitHub.
5. Construtor: `Dockerfile`.
6. Caminho do Dockerfile: `Dockerfile`.
7. Tipo de instância: `Free`.
8. Região: Washington, D.C. ou Frankfurt.
9. Porta exposta: `8787`.
10. Rota HTTP: `/`.
11. Caminho de verificação de saúde: `/health`.

## Variáveis de ambiente

Defina estas variáveis no Koyeb:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
PORT=8787
MCP_OAUTH_TOKEN_SECRET=<segredo-longo-aleatorio>
MCP_OWNER_AUTH_CODE=<código-de-proprietário-digitado>
MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
DESPEZZAS_EMAIL=<seu-email>
DESPEZZAS_PASSWORD=<sua-senha>
DESPEZZAS_FIREBASE_API_KEY=<chave-publica-firebase-do-despezzas>
DESPEZZAS_SESSION_FILE=none
```

> **Dica:** `DESPEZZAS_FIREBASE_API_KEY` é uma chave pública do Firebase Web — o próprio frontend do Despezzas a expõe. Para encontrá-la, abra https://despezzas.com, pressione F12, vá em Sources e procure por `apiKey`.

Quando o Koyeb gerar o domínio público, defina:

```dotenv
MCP_PUBLIC_BASE_URL=https://<seu-app>-<sua-org>.koyeb.app
```

Se os cabeçalhos encaminhados pelo Koyeb estiverem corretos, o servidor descobre a URL sozinho. Defina manualmente para evitar surpresas na descoberta OAuth.

Gere o segredo OAuth localmente:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Conectar ao ChatGPT

Em ChatGPT Apps / Custom Tool:

- Nome: `Despezzas`
- URL do servidor: `https://<seu-app>-<sua-org>.koyeb.app/mcp`
- Autenticação: `OAuth`

A primeira requisição após inatividade será mais lenta — a instância escala para zero.
