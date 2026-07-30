from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any, Literal
from urllib.parse import quote

import httpx

from .auth import DespezzasAuthManager, auth_manager, browser_headers, response_json
from .config import Settings, settings

HttpMethod = Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
RATE_LIMIT_RETRIES = 3
RETRYABLE_METHODS = {"GET", "PUT", "PATCH", "DELETE"}


class DespezzasApiError(RuntimeError):
    def __init__(self, message: str, status: int, details: Any) -> None:
        super().__init__(message)
        self.status = status
        self.details = details


class DespezzasClient:
    def __init__(
        self,
        config: Settings = settings,
        auth: DespezzasAuthManager = auth_manager,
        http: httpx.AsyncClient | None = None,
    ) -> None:
        self.config = config
        self.auth = auth
        self.http = http or httpx.AsyncClient(timeout=30)

    async def request(
        self,
        path: str,
        method: HttpMethod = "GET",
        body: Any = None,
        query: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> Any:
        token = await self.auth.get_token()
        refreshed = False
        rate_limit_attempt = 0
        while True:
            response = await self._send(path, method, token, body, query, idempotency_key)
            if response.status_code == 401 and not refreshed:
                token = await self.auth.get_token(force_refresh=True)
                refreshed = True
                continue
            if response.status_code == 429 and method in RETRYABLE_METHODS and rate_limit_attempt < RATE_LIMIT_RETRIES:
                await asyncio.sleep(retry_after_seconds(response, rate_limit_attempt))
                rate_limit_attempt += 1
                continue
            break
        data = response_json(response)
        if response.is_error:
            message = data.get("message") if isinstance(data, dict) else None
            raise DespezzasApiError(
                f"HTTP {response.status_code}: {message or response.reason_phrase}",
                response.status_code,
                data,
            )
        return data

    async def _send(
        self,
        path: str,
        method: HttpMethod,
        token: str,
        body: Any,
        query: dict[str, Any] | None,
        idempotency_key: str | None,
    ) -> httpx.Response:
        headers = browser_headers() | {"Authorization": f"Bearer {token}"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return await self.http.request(
            method,
            f"{self.config.api_base_url}{path}",
            headers=headers,
            params=query_pairs(query),
            json=body if body is not None else None,
        )

    async def auth_status(self) -> dict[str, Any]:
        return await self.auth.status()

    async def get_profile(self) -> Any:
        return await self.request("/v1/profile")

    async def list_profile_access(self) -> Any:
        return await self.request("/v1/profile-access")

    async def change_profile(self, profile_id: str | None) -> Any:
        return await self.request("/v1/profile-access/change", "PUT", {"profileId": profile_id})

    async def create_access_profile(self, payload: dict[str, Any]) -> Any:
        return await self.request("/v1/profile-access", "POST", payload)

    async def update_access_profile(self, profile_id: str, payload: dict[str, Any]) -> Any:
        return await self.request(f"/v1/profile-access/{quote(profile_id, safe='')}", "PUT", payload)

    async def delete_access_profile(self, profile_id: str) -> Any:
        return await self.request(f"/v1/profile-access/{quote(profile_id, safe='')}", "DELETE")

    async def leave_access_profile(self, profile_id: str) -> Any:
        return await self.request("/v1/profile-access/leave", "PUT", {"profileId": profile_id})

    async def get_personal_config(self) -> Any:
        return await self.request("/v2/personal-config")

    async def get_accounts(self) -> Any:
        return await self.request("/v1/accounts")

    async def create_account(self, payload: dict[str, Any]) -> Any:
        return await self.request("/v1/accounts", "POST", payload)

    async def update_account(self, account_id: str, payload: dict[str, Any]) -> Any:
        return await self.request(f"/v1/accounts/{quote(account_id, safe='')}", "PUT", payload)

    async def delete_account(self, account_id: str) -> Any:
        return await self.request(f"/v1/accounts/{quote(account_id, safe='')}", "DELETE")

    async def get_banks(self) -> Any:
        return await self.request("/v1/accounts/v3/list-banks")

    async def get_credit_cards(self) -> Any:
        return await self.request("/v1/credit-card")

    async def create_credit_card(self, payload: dict[str, Any]) -> Any:
        return await self.request("/v1/credit-card", "POST", payload)

    async def update_credit_card(self, card_id: str, payload: dict[str, Any]) -> Any:
        return await self.request(f"/v1/credit-card/{quote(card_id, safe='')}", "PUT", payload)

    async def delete_credit_card(self, card_id: str) -> Any:
        return await self.request(f"/v1/credit-card/{quote(card_id, safe='')}", "DELETE")

    async def get_categories(self, include_user: bool = False) -> Any:
        default = await self.request("/v1/categories")
        if not include_user:
            return default
        return {"defaults": default, "user": await self.request("/v1/categories/user")}

    async def get_subcategories(self, include_user: bool = False) -> Any:
        default = await self.request("/v1/subcategories")
        if not include_user:
            return default
        return {"defaults": default, "user": await self.request("/v1/subcategories/user")}

    async def get_transactions(self, filters: dict[str, Any] | None = None) -> Any:
        return await self.request("/v1/transactions", query=filters)

    async def get_transaction(self, transaction_id: str) -> Any:
        return await self.request(f"/v1/transactions/{quote(transaction_id, safe='')}")

    async def create_transaction(self, payload: dict[str, Any]) -> Any:
        return await self.request("/v1/transactions", "POST", payload)

    async def update_transaction(
        self,
        transaction_id: str,
        payload: dict[str, Any],
        idempotency_key: str | None = None,
    ) -> Any:
        return await self.request(
            f"/v1/transactions/{quote(transaction_id, safe='')}",
            "PUT",
            payload,
            idempotency_key=idempotency_key,
        )

    async def delete_transaction(self, transaction_id: str, scope: str = "THIS") -> Any:
        return await self.request(
            f"/v1/transactions/{quote(transaction_id, safe='')}",
            "DELETE",
            {"type": scope},
        )

    async def duplicate_transaction(self, transaction_id: str) -> Any:
        return await self.request(
            f"/v1/transactions/{quote(transaction_id, safe='')}/duplicate",
            "POST",
        )

    async def toggle_paid(self, transaction_id: str, date: str) -> Any:
        return await self.request(
            f"/v1/transactions/{quote(transaction_id, safe='')}/paid",
            "POST",
            {"date": date},
        )

    async def create_transfer(self, payload: dict[str, Any]) -> Any:
        return await self.request("/v1/transactions/create-transfer", "POST", payload)

    async def get_overview(self, date: str) -> Any:
        return await self.request("/v1/transactions/overview", query={"date": date})

    async def count_exportable_transactions(self, filters: dict[str, Any]) -> Any:
        return await self.request("/v1/export-transactions/count", query=filters)

    async def export_transactions(self, filters: dict[str, Any]) -> Any:
        return await self.request("/v1/export-transactions", query=filters)


def query_pairs(query: dict[str, Any] | None) -> list[tuple[str, str]] | None:
    if not query:
        return None
    pairs: list[tuple[str, str]] = []
    for key, value in query.items():
        if value is None or value == "":
            continue
        values = value if isinstance(value, list) else [value]
        pairs.extend((key, str(item).lower() if isinstance(item, bool) else str(item)) for item in values)
    return pairs


def retry_after_seconds(response: httpx.Response, attempt: int) -> float:
    value = response.headers.get("Retry-After")
    if value:
        try:
            return min(max(float(value), 0.0), 30.0)
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(value)
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=UTC)
                return min(max((retry_at - datetime.now(UTC)).total_seconds(), 0.0), 30.0)
            except (TypeError, ValueError):
                pass
    return min(2**attempt, 30)


client = DespezzasClient()
