# Configuração rápida do app/connector no ChatGPT

Valores passo a passo para o diálogo **Settings -> Apps & Connectors -> New App** do ChatGPT, seguindo cada campo na ordem.

## 1. Ícone (opcional)

- **Requisito:** apenas PNG, idealmente 256x256px ou maior, **tamanho máximo de 10 KB**.
- **Arquivo para upload:** [`assets/despezzas-mcp.png`](../assets/despezzas-mcp.png) - o ícone oficial de duplo Z do app Despezzas, 512x512, otimizado para ~3 KB (fundo lilás claro `#f1f6ff`, marca quase preta `#171717`). Faça upload dele como está.

## 2. Nome

```
Despezzas
```

## 3. Descrição (opcional)

```
Finanças pessoais para Despezzas: consulte contas, cartões, categorias e gastos, e registre transações.
```

## 4. Conexão

Deixe o seletor em **Server URL** (não Tunnel) - este é um Cloudflare Worker publicado de forma permanente, não um túnel local.

## 5. URL do servidor MCP

```
https://despezzas-mcp.<sua-conta>.workers.dev/mcp
```

## 6. Autenticação

Selecione **OAuth** no menu (não "No Auth" ou "Mixed").

Depois de informar uma Server URL válida acima, o painel **Advanced OAuth settings** abaixo fica habilitado e descobre automaticamente os metadados OAuth do servidor a partir de:

- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`

Você não precisa preencher client ID/secret manualmente - o Worker expõe registro dinâmico público de clientes (`POST /oauth/register`) e o ChatGPT registra a si mesmo automaticamente na primeira conexão.

## 7. Checkbox de ciência de risco

Marque **"I understand and want to continue"** - isso é obrigatório para qualquer servidor MCP personalizado/não verificado (o botão "Create" fica desabilitado até a marcação).

## 8. Criar

Clique em **Create**. O ChatGPT tentará conectar imediatamente e pode pedir que você conclua o fluxo de login OAuth (veja abaixo) antes de adicionar o app por completo.

## Descrição longa (opcional, para a listagem do app)

```
Conecte sua conta Despezzas ao ChatGPT. Pergunte sobre seus saldos,
cartões de crédito, categorias e transações recentes, veja resumos de
gastos e crie ou atualize transações com uma etapa de confirmação antes
de qualquer gravação. Cada usuário entra com seu próprio e-mail e senha
do Despezzas durante a configuração - o ChatGPT nunca vê sua senha,
apenas um token de sessão seguro.
```

## O que informar aos usuários durante o login OAuth

Quando o ChatGPT redirecionar para a tela de login do Despezzas MCP, os usuários devem:

1. Informar **e-mail e senha do Despezzas** (os mesmos usados em despezzas.com ou no app Despezzas).
2. Clicar em **Entrar e autorizar**.
3. Voltar ao ChatGPT - a conexão estará ativa e restrita apenas à conta deles.

A tela de autorização usa a identidade visual do Despezzas e acompanha tema claro/escuro, mas foi adaptada para a finalidade deste MCP: não mostra botão de voltar, "lembrar de mim", criação de conta ou recuperação de senha. Esses fluxos continuam no app/site oficial do Despezzas.

Não é necessário código de proprietário nem segredo compartilhado; este deploy roda em **modo multiusuário**, então a sessão de cada pessoa é armazenada de forma criptografada e independente no Cloudflare KV.

## Prompts de exemplo sugeridos (para a seção "Try asking" da App Store)

```
- "Qual é meu saldo atual somando todas as contas?"
- "Mostre minhas últimas 10 transações no cartão Nubank."
- "Quanto gastei com restaurantes este mês?"
- "Adicione uma despesa de mercado de R$45,90 na minha conta corrente hoje."
- "Liste minhas categorias de gastos."
```

## Checklist de verificação antes de publicar

- [ ] `GET https://despezzas-mcp.<sua-conta>.workers.dev/health` retorna `"ok": true` e `"authMode": "multi-user"`.
- [ ] `GET https://despezzas-mcp.<sua-conta>.workers.dev/.well-known/oauth-protected-resource` responde corretamente.
- [ ] O login via `/login` com uma conta real do Despezzas funciona e mostra a página de sucesso do MCP.
- [ ] Uma conexão de teste no ChatGPT consegue chamar uma ferramenta somente leitura (por exemplo, listar contas) depois do OAuth.
