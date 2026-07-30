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

## OAuth do MCP

O Prefect Horizon publica o endpoint MCP e gerencia OAuth. Este pacote não
implementa endpoints próprios de login, registro ou token. As credenciais do
Despezzas ficam nos secrets do deployment e a sessão Firebase permanece em memória.

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

## Semântica defensiva adotada pelo MCP

A API observada usa `PUT /v1/transactions/{id}`. Como campos omitidos podem ser
interpretados como `null`, o MCP não envia patches parciais diretamente:

1. lê a transação atual;
2. diferencia campo ausente de `null` explícito;
3. mescla os campos solicitados com o estado atual;
4. para transação única, envia a nova data apenas em `date`;
5. para séries, envia a data original em `date`, a nova data em `edition_date`
   e o escopo em `edition_type`;
6. executa o `PUT`;
7. relê a transação e valida campos alterados e preservados.

O `GET /v1/transactions` sem período pode ficar restrito ao mês atual. Para
localizar com segurança uma transação histórica ou futura, o MCP guarda
temporariamente a data e o tipo de conta observados na busca, consulta essa data
em `bank_account` e `credit_card`. O endpoint direto
`GET /v1/transactions/{id}` retornou 404 para IDs válidos e não é usado no
lookup interno.

Atualizações idempotentes repetem HTTP 429 até três vezes, respeitando
`Retry-After`, e enviam `Idempotency-Key`. O suporte efetivo à chave e a
atomicidade de `scope: ALL` dependem do backend do Despezzas.

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
Perfis extras legados com `type: pf` são normalizados pelo MCP para `family`; o
perfil raiz é exposto como `personal`.

## Contas e cartões manuais

A interface oficial usa `PUT /v1/accounts/{id}` com o objeto atual completo e os
campos alterados sobrepostos. O MCP reproduz esse read/merge/write e retorna
diagnóstico sanitizado em erros HTTP.

Criação e edição de cartões usam `name`, `logo` na criação, `account_id`, `limit`,
`is_unlimited`, `closing_date` e `expiring_date`. `available_limit` aparece
somente nas leituras e é calculado a partir do limite e das faturas; por isso não
é aceito pelos `inputSchema` de criação ou edição. As descrições públicas das
duas ferramentas também explicitam essa restrição.

Transferências são duas transações `TRANSFER` ligadas por
`connected_transaction_id`. O valor observado pode apontar para o `id` bruto da
contraparte, enquanto a escrita exige seu `internal_id`, ou pode funcionar como
identificador compartilhado do par. O MCP compara todos os identificadores
conhecidos, rejeita relações ausentes ou ambíguas, converte a contraparte para o
ID interno e exclui as duas pontas dentro da mesma execução.

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
