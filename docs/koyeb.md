# Deploy Gratuito no Koyeb

O Koyeb Free é a hospedagem gratuita alternativa para este repositório. Ele executa o `Dockerfile` existente, então o servidor HTTP Node/Express é publicado sem etapa de build específica de Worker.

## Adequação

O Koyeb Free é bom para testes e uso pessoal:

- 512 MB de RAM, 0,1 vCPU e 2 GB de SSD.
- Uma instância `Free` por organização.
- A região da instância `Free` é Frankfurt ou Washington, D.C.
- Instâncias `Free` não podem usar volumes, escalonamento customizado ou Koyeb Worker Services.
- Instâncias `Free` escalam para zero depois de 1 hora sem tráfego.

Como ele escala para zero e não aceita volumes persistentes, use credenciais do Despezzas em variáveis de ambiente e desative a persistência em arquivo de sessão.

## Deploy Pelo GitHub

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

## Variáveis de Ambiente

Defina estas variáveis no Koyeb:

```dotenv
MCP_TRANSPORT=http
HOST=0.0.0.0
PORT=8787
MCP_OAUTH_TOKEN_SECRET=<segredo-longo-aleatorio>
MCP_OWNER_AUTH_CODE=<codigo-de-proprietario-digitado>
MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS=3600
DESPEZZAS_EMAIL=<seu-email>
DESPEZZAS_PASSWORD=<sua-senha>
DESPEZZAS_FIREBASE_API_KEY=<firebase-api-key-do-despezzas>
DESPEZZAS_SESSION_FILE=none
```

Depois que o Koyeb fornecer o domínio público, defina:

```dotenv
MCP_PUBLIC_BASE_URL=https://<seu-app>-<sua-org>.koyeb.app
```

Se os cabeçalhos encaminhados pelo Koyeb estiverem corretos, o servidor consegue inferir essa URL. Defini-la explicitamente torna a descoberta OAuth menos surpreendente.

Gere o segredo OAuth localmente:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Conectar ao ChatGPT

Em ChatGPT Apps / Custom Tool:

- Nome: `Despezzas`
- URL do servidor: `https://<seu-app>-<sua-org>.koyeb.app/mcp`
- Autenticação: `OAuth`

Espere que a primeira requisição depois de um período ocioso seja mais lenta, porque a instância `Free` escala para zero.
