# Despezzas API Notes

These notes come from the captured HAR and public frontend bundle inspection.

## Base URL

`https://api.despezzas.com`

The web app sends:

- `Authorization: Bearer <Firebase ID token>`
- `Accept: application/json, text/plain, */*`
- `Content-Type: application/json`
- `Origin: https://despezzas.com`
- `Referer: https://despezzas.com/`
- `lang: pt-BR`

## Auth Flow

The Despezzas login page at `https://despezzas.com/auth/login` calls:

- `POST /v2/auth` with `{ "email": "...", "password": "..." }`
- Response includes `firebase_token` and `user`
- Frontend calls Firebase `accounts:signInWithCustomToken`
- Firebase returns `idToken`, `refreshToken`, and `expiresIn`
- Despezzas API calls use `Authorization: Bearer <idToken>`

The MCP implements the same flow and refreshes through:

- `POST https://securetoken.googleapis.com/v1/token?key=<firebase-api-key>`
- Form body: `grant_type=refresh_token&refresh_token=<refresh-token>`

## MCP OAuth Wrapper

For ChatGPT Apps & Connectors, the MCP server also acts as a small OAuth 2.1 authorization server around the Despezzas session:

- Protected resource metadata: `GET /.well-known/oauth-protected-resource`
- OAuth metadata: `GET /.well-known/oauth-authorization-server`
- Dynamic client registration: `POST /oauth/register`
- Authorization endpoint: `GET|POST /oauth/authorize`
- Token endpoint: `POST /oauth/token`

The OAuth access token is opaque and authorizes access to `/mcp`. It is not a Despezzas token. The server-side Despezzas session is obtained through `/v2/auth` and Firebase custom-token exchange.

## Captured Read Endpoints

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

## Frontend-Discovered Transaction Endpoints

- `POST /v1/transactions`
- `PUT /v1/transactions/{id}`
- `DELETE /v1/transactions/{id}` with body `{ "type": "THIS" | "THIS_AND_NEXT" | "ALL" }`
- `POST /v1/transactions/{id}/duplicate`
- `POST /v1/transactions/{id}/installments` with body `{ "quantity": number }`
- `POST /v1/transactions/{id}/paid` with body `{ "date": "YYYY-MM-DD" }`
- `POST /v1/transactions/create-transfer`
- `GET /v1/transactions/subscriptions`
- `GET /v1/export-transactions/count`
- `GET /v1/export-transactions`

## Frontend-Discovered Profile Access Endpoints

Despezzas supports a personal/root profile plus up to 3 extra profile types (`pj`, `family`, `investments`). The frontend lists profile access state and switches the active profile through:

- `GET /v1/profile-access`
- `PUT /v1/profile-access/change` with `{ "profileId": "uuid-or-null" }`
- `POST /v1/profile-access`
- `PUT /v1/profile-access/{id}`
- `DELETE /v1/profile-access/{id}`
- `PUT /v1/profile-access/leave` with `{ "profileId": "uuid" }`

Create/update payloads use:

```json
{
  "name": "Família Silva",
  "type": "family",
  "invites": [
    { "email": "partner@example.com", "role": "editor" }
  ]
}
```

Invite roles observed in the web form are `editor` and `viewer`.

## Transaction Filters

The frontend passes these directly as query parameters:

- `account_type`: `bank_account` or `credit_card`
- `account_ids`: repeated UUID value
- `credit_card_ids`: repeated UUID value
- `category_ids`: repeated UUID value
- `subcategory_ids`: repeated UUID value
- `date_start`: `YYYY-MM-DD`
- `date_end`: `YYYY-MM-DD`
- `is_paid`: `true` or `false`
- `is_expense`: `true` or `false`
- `value`: minimum amount in cents
- `search`: text query
- `order_by`: `date`, `title`, or `amount`
- `order`: `asc` or `desc`

## Transaction Payload Shape

The web form sends amounts in integer cents and positive values. Expense/income is represented by `is_expense`.

Create payload fields observed from the frontend:

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

`type` can be `FIXED`, `RECURRENT`, or `PARCELLED`.
