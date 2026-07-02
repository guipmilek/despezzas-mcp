<!-- ===== HEADER ===== -->
<p align="right">
  <a href="./README.en.md" title="Read the README in English"><img src="https://img.shields.io/badge/lang-en-gray?style=flat-square&amp;labelColor=202024" alt="lang-en" /></a>
  <img
    src="https://img.shields.io/badge/lang-pt--br-green?style=flat-square&amp;labelColor=202024"
    alt="lang-pt-br"
  />
</p>

<p align="center">
  <img
    src="./assets/despezzas-mcp.png"
    alt="Despezzas MCP logo"
    width="120"
  />
</p>

<h1 id="top" align="center">Despezzas MCP</h1>

<p align="center">
  <img
    src="https://img.shields.io/badge/languages-4-04D361?style=flat-square&amp;labelColor=202024"
    alt="Repository language count"
  />
  <img
    src="https://img.shields.io/badge/repo%20size-207%20KiB-007ec6?style=flat-square&amp;labelColor=202024"
    alt="Repository size"
  />
  <img
    src="https://img.shields.io/github/commit-activity/m/guipmilek/despezzas-mcp?style=flat-square&amp;color=black&amp;labelColor=202024"
    alt="Commit activity"
  />
  <a href="https://github.com/guipmilek/despezzas-mcp/commits/main" title="Ver commits do repositório"><img src="https://img.shields.io/badge/last%20commit-today-4b0?style=flat-square&amp;labelColor=202024" alt="Last commit" /></a>
  <a href="./LICENSE" title="Ver licença do projeto"><img src="https://img.shields.io/badge/license-MIT-brightgreen?style=flat-square&amp;labelColor=202024" alt="Project license" /></a>
  <img
    src="https://img.shields.io/badge/Node.js-%3E%3D20-233056?style=flat-square&amp;logo=node.js&amp;logoColor=white&amp;labelColor=202024"
    alt="Node.js >= 20"
  />
</p>

<p align="center">
  Servidor MCP não oficial para conectar dados financeiros do Despezzas a clientes compatíveis com MCP, incluindo ChatGPT.
</p>

<details>
  <summary>
    <h2>📒 Sumário</h2>
  </summary>

- [📍 Visão Geral](#-visão-geral)
- [⚡ Início Rápido](#-início-rápido)
- [✨ Funcionalidades](#-funcionalidades)
- [🧰 Catálogo de Ferramentas](#-catálogo-de-ferramentas)
- [🛠 Tecnologias](#-tecnologias)
  - [Servidor MCP](#servidor-mcp)
  - [Deploy](#deploy)
  - [Ferramentas](#ferramentas)
- [🚀 Primeiros Passos](#-primeiros-passos)
  - [📦 Configuração](#-configuração)
  - [✔️ Verificação](#️-verificação)
- [📋 Variáveis de Ambiente](#-variáveis-de-ambiente)
- [🔐 Autenticação](#-autenticação)
- [🖥 Configuração MCP Local](#-configuração-mcp-local)
- [🌐 Modo HTTP](#-modo-http)
- [🤖 Conexão OAuth Com ChatGPT](#-conexão-oauth-com-chatgpt)
- [☁️ Deploy Remoto](#️-deploy-remoto)
- [🔎 Inspeção de HAR](#-inspeção-de-har)
- [📚 MCPs de Referência](#-mcps-de-referência)
- [🗺 Roadmap](#-roadmap)
- [🤝 Contribuição](#-contribuição)
- [📄 Licença](#-licença)
</details>

<!-- ===== PROJECT INFOS ===== -->

## 📍 Visão Geral

Servidor MCP para dados financeiros do [Despezzas](https://despezzas.com/). Expõe ferramentas para clientes MCP (como ChatGPT) listarem contas, cartões e categorias, pesquisarem transações, consultarem resumos de gastos e fazerem operações de escrita com proteções.

Projeto open-source (MIT), construído analisando as requisições de rede e o código do frontend do Despezzas. O Despezzas não publica uma API oficial — trate isto como integração não oficial. Endpoints e campos podem mudar sem aviso.

> [!WARNING]
> Integração não oficial. Endpoints e fluxos de login podem mudar sem aviso.

> [!IMPORTANT]
> Este MCP pode ler e alterar dados financeiros pessoais. Nunca faça commit de `.env`, tokens, senhas, sessões, HARs não mascarados ou respostas reais da API.

| Item | Valor |
| --- | --- |
| **Status** | MVP funcional para uso pessoal |
| **API** | Integração não oficial com endpoints do Despezzas |
| **Runtime** | Node.js `>=20` |
| **Transportes** | `stdio`, HTTP Node, Cloudflare Workers |
| **Autenticação** | Bearer token, email/senha, OAuth MCP |
| **Deploy recomendado** | Cloudflare Workers |

## ⚡ Início Rápido

```powershell
npm install
npm run build
Copy-Item .env.example .env
npm run dev
```

Depois configure a autenticação no `.env` com `DESPEZZAS_TOKEN` ou `DESPEZZAS_EMAIL` + `DESPEZZAS_PASSWORD` + `DESPEZZAS_FIREBASE_API_KEY`.

## ✨ Funcionalidades

📖 **Ferramentas de leitura:** perfil, acessos de perfil, configuração pessoal, contas, bancos, cartões de crédito, categorias, subcategorias, busca compacta de transações, visão geral, resumo financeiro e diagnóstico de exportação/campos.

🧾 **Pré-visualização de transações:** prepara payloads de criação/edição/exclusão sem chamar o Despezzas.

✍️ **Ferramentas de escrita:** trocar/criar/editar/excluir/sair de perfil, criar/editar/excluir conta, cartão de crédito, transação, transferência, duplicar transação e alternar pago.

🔐 **Autenticação:** token bearer copiado, login por email/senha via variáveis de ambiente ou página HTTP de autorização MCP.

🔄 **Renovação de token:** sessões Firebase salvas são reutilizadas e renovadas automaticamente.

🛡 **Trava de segurança:** toda ferramenta de escrita/destrutiva exige `confirm: true`.

🔌 **Transportes:** `stdio` local e Streamable HTTP (Node ou Cloudflare Workers).

🔎 **Depuração:** inspetor de HAR e monitor de requisições no DevTools para capturar endpoints futuros.

Valores usam centavos inteiros no formato nativo do Despezzas. Exemplo: `12345` significa `R$123.45`.

Para escritas de transação, use primeiro as ferramentas de preparo:

1. Pesquise/liste a conta, cartão, categoria, subcategoria ou transação alvo.
2. Chame `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction` ou `despezzas_prepare_delete_transaction`.
3. Revise o payload retornado e os IDs de destino.
4. Chame a ferramenta real de escrita com os mesmos campos e `confirm: true`.

`despezzas_create_transaction` recusa intencionalmente payloads sem destino de conta/cartão, com conta e cartão ao mesmo tempo, ou sem `category_id`, a menos que `allow_uncategorized` seja explicitamente `true`.

## 🧰 Catálogo de Ferramentas

| Grupo | Exemplos | Escrita? | Observação |
| --- | --- | --- | --- |
| **Status e perfil** | `despezzas_status`, `despezzas_profile`, `despezzas_list_profiles` | Parcial | Trocar/criar/excluir perfil exige `confirm: true`. |
| **Contas e cartões** | `despezzas_list_accounts`, `despezzas_list_credit_cards`, `despezzas_create_account` | Parcial | Escritas validam IDs e confirmação. |
| **Categorias** | `despezzas_list_categories`, `despezzas_list_subcategories` | Não | Use antes de criar/editar transações. |
| **Transações** | `despezzas_search_transactions`, `despezzas_create_transaction`, `despezzas_update_transaction` | Parcial | Criação exige destino, categoria ou `allow_uncategorized`. |
| **Pré-visualização** | `despezzas_prepare_create_transaction`, `despezzas_prepare_update_transaction` | Não | Caminho recomendado antes de qualquer escrita. |
| **Diagnóstico** | `despezzas_export_fields_diagnostics`, `despezzas_raw_request` | Parcial | Use com cuidado; respostas são mascaradas quando possível. |

## 🛠 Tecnologias

As principais ferramentas usadas neste projeto:

### Servidor MCP

<p>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-white?style=for-the-badge&amp;logo=TypeScript" alt="TypeScript" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-233056?style=for-the-badge&amp;logo=node.js&amp;logoColor=white" alt="Node.js" /></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/Model_Context_Protocol-202024?style=for-the-badge" alt="Model Context Protocol" /></a>
  <a href="https://expressjs.com/"><img src="https://img.shields.io/badge/Express-111111?style=for-the-badge&amp;logo=express&amp;logoColor=white" alt="Express" /></a>
  <a href="https://hono.dev/"><img src="https://img.shields.io/badge/Hono-e36002?style=for-the-badge" alt="Hono" /></a>
  <a href="https://github.com/colinhacks/zod"><img src="https://img.shields.io/badge/Zod-3068b7?style=for-the-badge&amp;logo=zod&amp;logoColor=white" alt="Zod" /></a>
</p>

### Deploy

<p>
  <a href="https://workers.cloudflare.com/"><img src="https://img.shields.io/badge/Cloudflare_Workers-f38020?style=for-the-badge&amp;logo=cloudflare&amp;logoColor=202024" alt="Cloudflare Workers" /></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-white?style=for-the-badge&amp;logo=docker" alt="Docker" /></a>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-0a0a0a?style=for-the-badge&amp;logo=vercel&amp;logoColor=white" alt="Vercel" /></a>
  <a href="https://render.com/"><img src="https://img.shields.io/badge/Render-111111?style=for-the-badge&amp;logo=render&amp;logoColor=white" alt="Render" /></a>
</p>

### Ferramentas

<p>
  <a href="https://git-scm.com/"><img src="https://img.shields.io/badge/Git-f1f1e9?style=for-the-badge&amp;logo=git" alt="Git" /></a>
  <a href="https://www.npmjs.com/"><img src="https://img.shields.io/badge/npm-cb3837?style=for-the-badge&amp;logo=npm&amp;logoColor=white" alt="npm" /></a>
  <a href="https://developers.cloudflare.com/workers/wrangler/"><img src="https://img.shields.io/badge/Wrangler-f38020?style=for-the-badge&amp;logo=cloudflare&amp;logoColor=202024" alt="Wrangler" /></a>
</p>

_* Veja o arquivo [<kbd>package.json</kbd>](./package.json) para a lista completa de dependências._

## 🚀 Primeiros Passos

### 📦 Configuração

```powershell
npm install
npm run build
Copy-Item .env.example .env
```

### ✔️ Verificação

```powershell
npm run typecheck
npm test
npm run smoke:readonly
```

`npm test` cobre as proteções locais de payload e os diagnósticos. `npm run smoke:readonly` compila o projeto e chama apenas endpoints somente leitura do Despezzas usando o token/sessão configurado.

## 📋 Variáveis de Ambiente

| Variável | Obrigatória? | Uso |
| --- | --- | --- |
| `DESPEZZAS_TOKEN` | Opcional | Token bearer manual copiado de uma sessão web. |
| `DESPEZZAS_EMAIL` | Opcional | Login por email/senha. |
| `DESPEZZAS_PASSWORD` | Opcional | Login por email/senha. |
| `DESPEZZAS_FIREBASE_API_KEY` | Para email/senha | Chave pública do Firebase Web usada para troca e refresh de token. Veja como obtê-la no [.env.example](.env.example). |
| `DESPEZZAS_SESSION_FILE` | Opcional | Caminho de sessão persistida; use `none` para desativar. |
| `MCP_TRANSPORT` | Opcional | `stdio` ou `http`; padrão `stdio`. |
| `HOST` / `PORT` | Opcional | Bind do servidor HTTP; padrão `127.0.0.1:8787`. |
| `MCP_PUBLIC_BASE_URL` | Produção/OAuth | URL pública HTTPS para metadados OAuth. |
| `MCP_OAUTH_TOKEN_SECRET` | Recomendado | Assinatura estável dos tokens OAuth MCP. |
| `MCP_OWNER_AUTH_CODE` | Deploy privado | Código de proprietário para autorizações de conta única. |
| `SESSION_ENCRYPTION_KEY` | Cloudflare multiusuário | Criptografia de sessões no Workers KV. |

## 🔐 Autenticação

Opções preferenciais:

1. Execute em modo HTTP e abra `http://127.0.0.1:8787/login`.
2. Defina `DESPEZZAS_EMAIL`, `DESPEZZAS_PASSWORD` e `DESPEZZAS_FIREBASE_API_KEY` (chave pública — veja [.env.example](.env.example)) no `.env`.
3. Copie o `DESPEZZAS_TOKEN` pelas DevTools do navegador.

A página `/login` usa a identidade visual do Despezzas, acompanha os temas claro/escuro do sistema e contém apenas os campos necessários para este MCP: email, senha e, quando configurado, código de acesso do proprietário. Criação de conta e recuperação de senha ficam no app oficial do Despezzas.

O fluxo de login espelha o frontend do Despezzas:

1. `POST https://api.despezzas.com/v2/auth` com email/senha.
2. Usa o `firebase_token` retornado com Firebase `accounts:signInWithCustomToken` usando `DESPEZZAS_FIREBASE_API_KEY` (a chave pública do Firebase Web do Despezzas).
3. Usa o `idToken` do Firebase como `Authorization: Bearer ...` em `api.despezzas.com`.
4. Salva o refresh token do Firebase em `%USERPROFILE%\.despezzas-mcp\session.json` por padrão.

| Etapa | Origem | Destino | Resultado |
| --- | --- | --- | --- |
| 1 | Usuário | `/login` do MCP | Envia email e senha para autorização local. |
| 2 | MCP | API Despezzas | Troca credenciais por `firebase_token`. |
| 3 | MCP | Firebase | Troca `firebase_token` por `idToken` e `refreshToken`. |
| 4 | MCP | Cliente MCP/ChatGPT | Entrega um token OAuth MCP opaco. |

Defina `DESPEZZAS_SESSION_FILE=none` para desativar a persistência de sessão. Se todos os métodos de autenticação falharem, `despezzas_status` indicará que é preciso abrir a página de login ou configurar credenciais.

Não passe sua senha como argumento de ferramenta. Argumentos podem ficar visíveis ao cliente. Use `.env` ou a página `/login`.

## 🖥 Configuração MCP Local

Para um cliente MCP local via stdio:

```json
{
  "mcpServers": {
    "despezzas": {
      "command": "node",
      "args": ["C:\\caminho\\para\\despezzas-mcp\\dist\\index.js"],
      "env": {
        "DESPEZZAS_TOKEN": "seu-token-aqui"
      }
    }
  }
}
```

Para desenvolvimento sem compilar:

```powershell
npm run dev
```

## 🌐 Modo HTTP

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

Se expuser o modo HTTP além do localhost, coloque HTTPS e controle de acesso na frente. A página `/login` aceita sua senha do Despezzas para autorizar o MCP.

## 🤖 Conexão OAuth Com ChatGPT

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

Essa camada OAuth protege a conexão. Durante a autorização, a página de login troca email/senha do Despezzas por uma sessão Despezzas/Firebase no servidor. O botão final é `Entrar e autorizar`, e o ChatGPT recebe apenas um token de acesso MCP opaco.

`MCP_HTTP_BEARER_TOKEN` ainda é útil para scripts fora do ChatGPT. Quando omitido, o `/mcp` exige um token OAuth válido.

<details>
  <summary>Detalhes de descoberta OAuth e links oficiais</summary>

Apps/conectores personalizados do ChatGPT exigem um endpoint MCP remoto em HTTPS. A documentação do Apps SDK da OpenAI descreve o MCP como a camada de servidor necessária para expor ferramentas ao ChatGPT, e o guia de conexão pelo ChatGPT usa um endpoint HTTPS para adicionar um servidor MCP. Veja:

- [Quickstart do Apps SDK](https://developers.openai.com/apps-sdk/quickstart)
- [Construir seu servidor MCP](https://developers.openai.com/apps-sdk/build/mcp-server)
- [Autenticar usuários](https://developers.openai.com/apps-sdk/build/auth)
- [Conectar pelo ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
- [Construção de servidores MCP para ChatGPT Apps e integrações de API](https://developers.openai.com/api/docs/mcp)
- [Especificação de autorização MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

</details>

## ☁️ Deploy Remoto

Caminho recomendado: [Cloudflare Workers](docs/cloudflare-workers.md). Alternativa em container: [Koyeb Free](docs/koyeb.md).

Veja [docs/deployment.md](docs/deployment.md) para a comparação mais ampla de hospedagens gratuitas e notas de configuração por provedor.

| Provedor | Melhor para | Arquivos | Observação |
| --- | --- | --- | --- |
| **Cloudflare Workers** | MCP remoto recomendado | `wrangler.jsonc`, `src/cloudflare.ts` | Melhor caminho para OAuth com ChatGPT. |
| **Docker/Koyeb** | Container simples | `Dockerfile` | Bom para uso pessoal; pode escalar para zero. |
| **Vercel** | Função serverless Express | `vercel.json`, `api/index.js` | Sem estado; use env vars para credenciais. |
| **Render/Railway** | Demos e deploys rápidos pelo GitHub | `render.yaml`, `railway.json` | Planos gratuitos podem hibernar ou ter limites. |
| **Prefect Horizon** | Gateway MCP gerenciado | `horizon_proxy.py` | Proxy FastMCP para backend Node publicado. |

Arquivos de deploy incluídos:

- `render.yaml` para Render Blueprints.
- `railway.json` para Railway.
- `vercel.json` e `api/index.js` para Vercel Functions.
- `wrangler.jsonc` e `src/cloudflare.ts` para Cloudflare Workers.
- `Dockerfile` para Koyeb, Cloud Run, Fly.io, Northflank, deploys Docker no Railway ou uma VM.
- `horizon_proxy.py` e `requirements.txt` para Prefect Horizon como proxy FastMCP na frente de um backend Node já publicado.

Para o modo multiusuário em Cloudflare Workers, associe o namespace KV `DESPEZZAS_SESSIONS`, defina `MCP_OAUTH_TOKEN_SECRET`, `SESSION_ENCRYPTION_KEY` e `DESPEZZAS_FIREBASE_API_KEY` como secrets do Wrangler e faça deploy com `npm run deploy:cloudflare`. Para deploys privados de conta única, defina `MCP_OWNER_AUTH_CODE` junto com suas credenciais do Despezzas e `DESPEZZAS_FIREBASE_API_KEY`. Para Horizon, publique o backend Node em outro lugar e aponte `horizon_proxy.py:mcp` para esse backend.

## 🔎 Inspeção de HAR

Quando capturar mais ações do frontend:

```powershell
npm run inspect:har -- C:\path\to\despezzas.har
```

O script imprime apenas chamadas para `api.despezzas.com` e mascara segredos comuns. Próximas ações úteis para capturar:

- Pagar/despagar contas e faturas de cartão de crédito.
- Metas, limites de gastos, relatórios, investimentos, gerenciamento de conexão Open Finance e ações do chat de IA.
- Qualquer caso de borda de perfil ainda não coberto por `despezzas_list_profiles` / `despezzas_switch_profile` / ferramentas de gerenciamento de perfil.

Se preferir não exportar um HAR, cole [scripts/request-monitor-devtools.js](scripts/request-monitor-devtools.js) no DevTools em `despezzas.com`, execute a ação e depois rode:

```js
window.__despezzasMcpMonitor.download()
```

Ele exporta um relatório JSON mascarado das chamadas `fetch`/XHR para `api.despezzas.com`.

## 📚 MCPs de Referência

Este projeto tomou como referência:

- [SamuelMoraesF/mcp-organizze](https://github.com/SamuelMoraesF/mcp-organizze)
- [silviorodrigues/organizze-mcp](https://github.com/silviorodrigues/organizze-mcp)
- [WeslleyNasRocha/organizze-mcp](https://github.com/WeslleyNasRocha/organizze-mcp)

Este repositório mantém uma estrutura parecida, mas usa endpoints nativos do Despezzas e IDs em UUID.

## 🗺 Roadmap

- [ ] Expandir cobertura de endpoints de relatórios, metas e investimentos.
- [ ] Gerar documentação automática do catálogo de ferramentas MCP.
- [ ] Adicionar screenshots do fluxo de conexão no ChatGPT.
- [ ] Criar exemplos de configuração para Claude Desktop, ChatGPT e clientes MCP.
- [ ] Documentar mais casos de borda de perfis compartilhados.

## 🤝 Contribuição

Contribuições são bem-vindas. Antes de abrir um pull request:

1. Leia [CONTRIBUTING.md](CONTRIBUTING.md).
2. Rode `npm run typecheck` e `npm test`.
3. Não inclua credenciais, tokens, sessões, HARs não mascarados ou dados financeiros reais.
4. Mantenha `confirm: true` obrigatório para toda ferramenta de escrita/destrutiva.

## 📄 Licença

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
