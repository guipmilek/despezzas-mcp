# Notas da API Despezzas

Estas notas vêm de um HAR capturado e da inspeção do bundle frontend público.

## URL base

`https://api.despezzas.com`

O app web envia:

- `Authorization: Bearer <Firebase ID token>`
- `Accept: application/json, text/plain, */*`
- `Content-Type: application/json`
- `Origin: https://despezzas.com`
- `Referer: https://despezzas.com/`
- `lang: pt-BR`

## Fluxo de autenticação

A página de login do Despezzas em `https://despezzas.com/auth/login` chama:

- `POST /v2/auth` com e-mail/senha em `{ "email": "...", "password": "..." }`
- A resposta inclui `firebase_token` e `user`
- O frontend chama o Firebase `accounts:signInWithCustomToken`
- O Firebase retorna `idToken`, `refreshToken` e `expiresIn`
- Chamadas para a API Despezzas usam `Authorization: Bearer <idToken>`

O MCP implementa o mesmo fluxo e renova a sessão por:

- `POST https://securetoken.googleapis.com/v1/token?key=<firebase-api-key>`
- Corpo de formulário: `grant_type=refresh_token&refresh_token=<refresh-token>`

## Wrapper OAuth do MCP

Para ChatGPT Apps & Connectors, o servidor MCP também atua como um pequeno servidor de autorização OAuth 2.1 ao redor da sessão Despezzas:

- Metadados do recurso protegido: `GET /.well-known/oauth-protected-resource`
- Metadados OAuth: `GET /.well-known/oauth-authorization-server`
- Registro dinâmico de cliente: `POST /oauth/register`
- Endpoint de autorização: `GET|POST /oauth/authorize`
- Endpoint de token: `POST /oauth/token`

O token de acesso OAuth é opaco e autoriza acesso ao `/mcp`. Ele não é um token do Despezzas. A sessão Despezzas no lado do servidor é obtida por `/v2/auth` e pela troca de custom token do Firebase.

## Endpoints de leitura capturados

- `GET /v1/profile`
- `PUT /v1/profile`
- `GET /v2/personal-config`
- `GET /v1/notifications`
- `GET /v1/accounts`
- `GET /v1/accounts/v3/list-banks`
- `GET /v1/credit-card`
- `GET /v1/categories`
- `GET /v1/categories/user`
- `GET /v1/subcategories`
- `GET /v1/subcategories/user`
- `GET /v1/transactions`
- `GET /v1/transactions/overview?date=YYYY-MM-DD`

## Endpoints de transação descobertos no frontend

- `POST /v1/transactions`
- `PUT /v1/transactions/{id}`
- `DELETE /v1/transactions/{id}` com corpo `{ "type": "THIS" | "THIS_AND_NEXT" | "ALL" }`
- `POST /v1/transactions/{id}/duplicate`
- `POST /v1/transactions/{id}/installments` com corpo `{ "quantity": number }`
- `POST /v1/transactions/{id}/paid` com corpo `{ "date": "YYYY-MM-DD" }`
- `POST /v1/transactions/create-transfer`
- `GET /v1/transactions/subscriptions`
- `GET /v1/export-transactions/count`
- `GET /v1/export-transactions`

## Endpoints de acesso a perfil descobertos no frontend

O Despezzas oferece um perfil pessoal/raiz e até 3 tipos de perfis extras (`pj`, `family`, `investments`). O frontend lista o estado de acesso a perfis e troca o perfil ativo por:

- `GET /v1/profile-access`
- `PUT /v1/profile-access/change` com `{ "profileId": "uuid-or-null" }`
- `POST /v1/profile-access`
- `PUT /v1/profile-access/{id}`
- `DELETE /v1/profile-access/{id}`
- `PUT /v1/profile-access/leave` com `{ "profileId": "uuid" }`

Payloads de criação/edição usam:

```json
{
  "name": "Família Silva",
  "type": "family",
  "invites": [{ "email": "partner@example.com", "role": "editor" }]
}
```

Os papéis de convite observados no formulário web são `editor` e `viewer`.

## Filtros de transação

O frontend envia estes campos diretamente como parâmetros de query:

- `account_type`: `bank_account` ou `credit_card`
- `account_ids`: valor UUID repetido
- `credit_card_ids`: valor UUID repetido
- `category_ids`: valor UUID repetido
- `subcategory_ids`: valor UUID repetido
- `date_start`: `YYYY-MM-DD`
- `date_end`: `YYYY-MM-DD`
- `is_paid`: `true` ou `false`
- `is_expense`: `true` ou `false`
- `value`: valor mínimo em centavos
- `search`: consulta de texto
- `order_by`: `date`, `title` ou `amount`
- `order`: `asc` ou `desc`

## Formato do payload de transação

O formulário web envia valores positivos em centavos inteiros. Despesa/receita é representada por `is_expense`.

Campos de payload de criação observados no frontend:

```json
{
  "title": "string",
  "description": "string",
  "amount": 12345,
  "date": "YYYY-MM-DD",
  "is_expense": true,
  "type": "FIXED",
  "frequency": "MONTHLY",
  "installments": 1,
  "is_full_amount": true,
  "category_id": "uuid",
  "subcategory_id": "uuid",
  "account_id": "uuid",
  "credit_card_id": "uuid",
  "paid": true
}
```

`type` pode ser `FIXED`, `RECURRENT` ou `PARCELLED`.
