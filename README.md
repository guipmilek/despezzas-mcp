<!-- ===== HEADER ===== -->
<p align="right">
  <img
    src="https://img.shields.io/badge/lang-pt--br-green?style=flat-square&labelColor=202024"
    alt="lang-pt-br"
  />
</p>

<h1 id="top" align="center">Despezzas MCP</h1>

<p align="center">
  <img
    src="https://img.shields.io/github/languages/count/guipmilek/despezzas-mcp?color=%2304D361&labelColor=202024"
    alt="Repository language count"
  />
  <img
    src="https://img.shields.io/github/repo-size/guipmilek/despezzas-mcp?labelColor=202024"
    alt="Repository size"
  />
  <img
    src="https://img.shields.io/github/commit-activity/m/guipmilek/despezzas-mcp?color=black&labelColor=202024"
    alt="Commit activity"
  />
  <a
    href="https://github.com/guipmilek/despezzas-mcp/commits/main"
    title="Ver commits do repositório"
  >
    <img
      src="https://img.shields.io/github/last-commit/guipmilek/despezzas-mcp?labelColor=202024"
      alt="Last commit"
    />
  </a>
  <a href="./LICENSE" title="Ver licença do projeto">
    <img
      src="https://img.shields.io/badge/license-MIT-brightgreen?labelColor=202024"
      alt="Project license"
    />
  </a>
  <img
    src="https://img.shields.io/badge/Node.js-%3E%3D20-233056?logo=node.js&labelColor=202024"
    alt="Node.js >= 20"
  />
</p>

<p align="center">
  <img
    src="./assets/despezzas-mcp.png"
    alt="Despezzas MCP logo"
    width="120"
  />
</p>

<p align="center">
  Servidor MCP não oficial para conectar dados financeiros do Despezzas a clientes compatíveis com MCP, incluindo ChatGPT.
</p>

<details>
  <summary>
    <h2>Table of Contents</h2>
  </summary>

- [Visão Geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
  - [Servidor MCP](#servidor-mcp)
  - [Deploy](#deploy)
  - [Ferramentas](#ferramentas)
- [Primeiros Passos](#primeiros-passos)
  - [Configuração](#configuração)
  - [Verificação](#verificação)
- [Autenticação](#autenticação)
- [Configuração MCP Local](#configuração-mcp-local)
- [Modo HTTP](#modo-http)
- [Conexão OAuth Com ChatGPT](#conexão-oauth-com-chatgpt)
- [Deploy Remoto](#deploy-remoto)
- [Inspeção de HAR](#inspeção-de-har)
- [MCPs de Referência](#mcps-de-referência)
- [Licença](#licença)
</details>

<!-- ===== PROJECT INFOS ===== -->

## Visão Geral

Servidor MCP pessoal para dados financeiros do [Despezzas](https://despezzas.com/). Ele expõe ferramentas para clientes MCP compatíveis com ChatGPT listarem contas, cartões, categorias, pesquisarem transações, resumirem gastos e executarem operações de escrita com proteções.

Este é um projeto open-source sob a licença MIT, construído a partir do tráfego observado no Despezzas Web e da inspeção do bundle frontend. O Despezzas não parece publicar uma API pública, então mantenha isto como uma integração pessoal não oficial e espere que detalhes de endpoints possam mudar.

## Funcionalidades

- Ferramentas de leitura: perfil, acessos de perfil, configuração pessoal, contas, bancos, cartões de crédito, categorias, subcategorias, busca compacta de transações, visão geral, resumo financeiro e diagnóstico de exportação/campos.
- Ferramentas de pré-visualização para transações: preparam payloads de criação/edição/exclusão sem chamar o Despezzas.
- Ferramentas de escrita: trocar/criar/editar/excluir/sair de perfil, criar/editar/excluir conta, cartão de crédito, transação, transferência, duplicar transação e alternar pago.
- Autenticação: token bearer copiado, login por email/senha via variáveis de ambiente ou página HTTP de autorização MCP.
- Renovação de token: sessões Firebase salvas são reutilizadas e renovadas automaticamente.
- Trava de segurança: toda ferramenta de escrita/destrutiva exige `confirm: true`.
- Transportes: `stdio` local, Streamable HTTP em Node no `/mcp` e Streamable HTTP em Cloudflare Workers no `/mcp`.
- Depuração: inspetor de HAR e monitor de requisições no DevTools para capturar endpoints futuros.

Valores usam centavos inteiros no formato nativo do Despezzas. Exemplo: `12345` significa `R$123.45`.

Para escritas de transação, use primeiro as ferramentas de preparo:

1. Pesquise/liste a conta, cartão, categoria, subcategoria ou transação alvo.
2. Chame `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction` ou `despezzas_prepare_delete_transaction`.
3. Revise o payload retornado e os IDs de destino.
4. Chame a ferramenta real de escrita com os mesmos campos e `confirm: true`.

`despezzas_create_transaction` recusa intencionalmente payloads sem destino de conta/cartão, com conta e cartão ao mesmo tempo, ou sem `category_id`, a menos que `allow_uncategorized` seja explicitamente `true`.

## Tecnologias

As principais ferramentas usadas neste projeto:

### Servidor MCP

<p>
  <a href="https://www.typescriptlang.org/">
    <img
      src="https://img.shields.io/badge/TypeScript-white?style=for-the-badge&logo=TypeScript"
      alt="TypeScript"
    />
  </a>
  <a href="https://nodejs.org/">
    <img
      src="https://img.shields.io/badge/Node.js-233056?style=for-the-badge&logo=node.js"
      alt="Node.js"
    />
  </a>
  <a href="https://modelcontextprotocol.io/">
    <img
      src="https://img.shields.io/badge/Model_Context_Protocol-202024?style=for-the-badge"
      alt="Model Context Protocol"
    />
  </a>
  <a href="https://expressjs.com/">
    <img
      src="https://img.shields.io/badge/Express-111111?style=for-the-badge&logo=express"
      alt="Express"
    />
  </a>
  <a href="https://hono.dev/">
    <img
      src="https://img.shields.io/badge/Hono-e36002?style=for-the-badge"
      alt="Hono"
    />
  </a>
  <a href="https://github.com/colinhacks/zod">
    <img
      src="https://img.shields.io/badge/Zod-3068b7?style=for-the-badge&logo=zod"
      alt="Zod"
    />
  </a>
</p>

### Deploy

<p>
  <a href="https://workers.cloudflare.com/">
    <img
      src="https://img.shields.io/badge/Cloudflare_Workers-f38020?style=for-the-badge&logo=cloudflare"
      alt="Cloudflare Workers"
    />
  </a>
  <a href="https://www.docker.com/">
    <img
      src="https://img.shields.io/badge/Docker-white?style=for-the-badge&logo=docker"
      alt="Docker"
    />
  </a>
  <a href="https://vercel.com/">
    <img
      src="https://img.shields.io/badge/Vercel-0a0a0a?style=for-the-badge&logo=vercel"
      alt="Vercel"
    />
  </a>
  <a href="https://render.com/">
    <img
      src="https://img.shields.io/badge/Render-111111?style=for-the-badge&logo=render"
      alt="Render"
    />
  </a>
</p>

### Ferramentas

<p>
  <a href="https://git-scm.com/">
    <img
      src="https://img.shields.io/badge/Git-f1f1e9?style=for-the-badge&logo=git"
      alt="Git"
    />
  </a>
  <a href="https://www.npmjs.com/">
    <img
      src="https://img.shields.io/badge/npm-cb3837?style=for-the-badge&logo=npm"
      alt="npm"
    />
  </a>
  <a href="https://developers.cloudflare.com/workers/wrangler/">
    <img
      src="https://img.shields.io/badge/Wrangler-f38020?style=for-the-badge&logo=cloudflare"
      alt="Wrangler"
    />
  </a>
</p>

_* Veja o arquivo [<kbd>package.json</kbd>](./package.json) para a lista completa de dependências._

## Primeiros Passos

### Configuração

```powershell
npm install
npm run build
Copy-Item .env.example .env
```

### Verificação

```powershell
npm run typecheck
npm test
npm run smoke:readonly
```

`npm test` cobre as proteções locais de payload e os diagnósticos. `npm run smoke:readonly` compila o projeto e chama apenas endpoints somente leitura do Despezzas usando o token/sessão configurado.

## Autenticação

Opções preferenciais:

1. Execute em modo HTTP e abra `http://127.0.0.1:8787/login`.
2. Defina `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD` e `DESPEZZAS_FIREBASE_API_KEY` no `.env`.
3. Defina `DESPEZZAS_TOKEN` manualmente a partir do DevTools do navegador.

A página `/login` usa a identidade visual do Despezzas, acompanha os temas claro/escuro do sistema e contém apenas os campos necessários para este MCP: email, senha e, quando configurado, código de acesso do proprietário. Criação de conta e recuperação de senha continuam pertencendo ao app/site oficial do Despezzas.

O fluxo de login espelha o frontend do Despezzas:

1. `POST https://api.despezzas.com/v2/auth` com email/senha.
2. Usa o `firebase_token` retornado com Firebase `accounts:signInWithCustomToken` usando `DESPEZZAS_FIREBASE_API_KEY`.
3. Usa o `idToken` do Firebase como `Authorization: Bearer ...` em `api.despezzas.com`.
4. Salva o refresh token do Firebase em `%USERPROFILE%\.despezzas-mcp\session.json` por padrão.

Defina `DESPEZZAS_SESSION_FILE=none` para desativar a persistência de sessão. Se todos os métodos de autenticação falharem, `despezzas_status` indicará que você deve abrir a página de login ou configurar credenciais.

Não passe sua senha como argumento de ferramenta MCP. Argumentos de ferramentas podem ficar visíveis ao modelo/cliente. Use `.env` ou a página local `/login`.

## Configuração MCP Local

Para um cliente MCP local via stdio:

```json
{
  "mcpServers": {
    "despezzas": {
      "command": "node",
      "args": ["C:\\caminho\\para\\despezzas-mcp\\dist\\index.js"],
      "env": {
        "DESPEZZAS_TOKEN": "cole-o-token-aqui"
      }
    }
  }
}
```

Para desenvolvimento sem compilar:

```powershell
npm run dev
```

## Modo HTTP

```powershell
$env:MCP_TRANSPORT = "http"
$env:PORT = "8787"
npm run dev:http
```

Verificação de saúde:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/health
```

Abra a página local de autorização:

```powershell
Start-Process http://127.0.0.1:8787/login
```

Se você expuser o modo HTTP além do localhost, coloque HTTPS e controle de acesso real na frente dele. A página `/login` aceita sua senha do Despezzas para autorizar este MCP.

## Conexão OAuth Com ChatGPT

Para a tela **New App** em ChatGPT Apps & Connectors:

1. Exponha o MCP por HTTPS, por exemplo:

   ```powershell
   npm run start:http
   ngrok http 8787
   ```

2. Defina a URL pública antes de iniciar o servidor:

   ```powershell
   $env:MCP_PUBLIC_BASE_URL = "https://seu-dominio-ngrok.ngrok.app"
   npm run start:http
   ```

3. No ChatGPT, use:

   - URL do servidor: `https://seu-dominio-ngrok.ngrok.app/mcp`
   - Autenticação: `OAuth`

O servidor expõe os endpoints de descoberta esperados pelo ChatGPT:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`

Essa camada OAuth protege a conexão MCP. Durante a autorização, a página de login troca email/senha do Despezzas por uma sessão Despezzas/Firebase no lado do servidor. O botão final é `Entrar e autorizar`, e o ChatGPT recebe apenas um token de acesso MCP opaco.

`MCP_HTTP_BEARER_TOKEN` continua útil para scripts que não usam ChatGPT, mas, quando ele é omitido, o endpoint `/mcp` exige um token de acesso OAuth válido.

Apps/conectores personalizados do ChatGPT exigem um endpoint MCP remoto em HTTPS. A documentação do Apps SDK da OpenAI descreve o MCP como a camada de servidor necessária para expor ferramentas ao ChatGPT, e o guia de conexão pelo ChatGPT usa um endpoint HTTPS para adicionar um servidor MCP. Veja:

- [Quickstart do Apps SDK](https://developers.openai.com/apps-sdk/quickstart)
- [Construir seu servidor MCP](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Autenticar usuários](https://developers.openai.com/apps-sdk/build/auth)
- [Conectar pelo ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [Construção de servidores MCP para ChatGPT Apps e integrações de API](https://developers.openai.com/api/docs/mcp)
- [Especificação de autorização MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

## Deploy Remoto

Caminho recomendado primeiro: [Cloudflare Workers](docs/cloudflare-workers.md). Alternativa gratuita em container: [Koyeb Free](docs/koyeb.md).

Veja [docs/deployment.md](docs/deployment.md) para a comparação mais ampla de hospedagens gratuitas e notas de configuração por provedor.

Arquivos de deploy incluídos:

- `render.yaml` para Render Blueprints.
- `railway.json` para Railway.
- `vercel.json` e `api/index.js` para Vercel Functions.
- `wrangler.jsonc` e `src/cloudflare.ts` para Cloudflare Workers.
- `Dockerfile` para Koyeb, Cloud Run, Fly.io, Northflank, deploys Docker no Railway ou uma VM.
- `horizon_proxy.py` e `requirements.txt` para Prefect Horizon como proxy FastMCP na frente de um backend Node já publicado.

Para o modo multiusuário em Cloudflare Workers, associe o namespace KV `DESPEZZAS_SESSIONS`, defina `MCP_OAUTH_TOKEN_SECRET`, `SESSION_ENCRYPTION_KEY` e `DESPEZZAS_FIREBASE_API_KEY` como secrets do Wrangler e faça deploy com `npm run deploy:cloudflare`. Para deploys privados de conta única, defina `MCP_OWNER_AUTH_CODE` junto com suas credenciais do Despezzas e `DESPEZZAS_FIREBASE_API_KEY`. Para Horizon, publique o backend Node em outro lugar e aponte `horizon_proxy.py:mcp` para esse backend.

## Inspeção de HAR

Quando capturar mais ações do frontend:

```powershell
npm run inspect:har -- C:\path\to\despezzas.har
```

O script imprime apenas chamadas para `api.despezzas.com` e mascara segredos comuns. Próximas ações úteis para capturar:

- Pagar/despagar contas e faturas de cartão de crédito.
- Metas, limites de gastos, relatórios, investimentos, gerenciamento de conexão Open Finance e ações do chat de IA.
- Qualquer caso de borda de perfil ainda não coberto por `despezzas_list_profiles` / `despezzas_switch_profile` / ferramentas de gerenciamento de perfil.

Se exportar um HAR for trabalhoso, cole [scripts/request-monitor-devtools.js](scripts/request-monitor-devtools.js) no DevTools em `despezzas.com`, execute a ação e depois rode:

```js
window.__despezzasMcpMonitor.download()
```

Ele exporta um relatório JSON mascarado das chamadas `fetch`/XHR para `api.despezzas.com`.

## MCPs de Referência

O estilo de implementação foi comparado com:

- [SamuelMoraesF/mcp-organizze](https://github.com/SamuelMoraesF/mcp-organizze)
- [silviorodrigues/organizze-mcp](https://github.com/silviorodrigues/organizze-mcp)
- [WeslleyNasRocha/organizze-mcp](https://github.com/WeslleyNasRocha/organizze-mcp)

Este repositório mantém uma estrutura parecida, mas usa endpoints nativos do Despezzas e IDs em UUID.

## Licença

MIT. Veja [LICENSE](LICENSE).

<!-- ===== FOOTER ===== -->

---

<p align="center">
  Feito por
  <a href="https://www.guipm.dev/">@guipm.dev</a>.
</p>

<p align="center">
  <a href="#top">
    <b>↑ Voltar ao topo ↑</b>
  </a>
</p>
