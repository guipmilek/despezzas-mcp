import asyncio
from unittest.mock import AsyncMock

import httpx

from despezzas_mcp import client as client_module
from despezzas_mcp.auth import DespezzasAuthManager
from despezzas_mcp.client import DespezzasClient
from despezzas_mcp.config import Settings


async def test_concurrent_calls_share_single_login():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if request.url.path == "/v2/auth":
            return httpx.Response(200, json={"firebase_token": "custom"})
        return httpx.Response(
            200,
            json={"idToken": "id-token", "refreshToken": "refresh", "expiresIn": "3600"},
        )

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    auth = DespezzasAuthManager(
        Settings(firebase_api_key="firebase", email="me@example.com", password="secret"),
        http,
    )
    assert await asyncio.gather(auth.get_token(), auth.get_token()) == ["id-token", "id-token"]
    assert sum("/v2/auth" in url for url in calls) == 1
    await http.aclose()


async def test_client_retries_once_after_401():
    requests = []

    class FakeAuth:
        async def get_token(self, force_refresh=False):
            return "fresh" if force_refresh else "old"

        async def status(self):
            return {}

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request.headers["authorization"])
        return httpx.Response(401 if len(requests) == 1 else 200, json={"ok": True})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = DespezzasClient(Settings(), FakeAuth(), http)
    assert await client.get_profile() == {"ok": True}
    assert requests == ["Bearer old", "Bearer fresh"]
    await http.aclose()


async def test_client_retries_429_and_preserves_idempotency_key(monkeypatch):
    requests = []

    class FakeAuth:
        async def get_token(self, force_refresh=False):
            return "token"

        async def status(self):
            return {}

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) < 3:
            return httpx.Response(429, headers={"Retry-After": "0"}, json={"message": "rate limit"})
        return httpx.Response(200, json={"id": "transaction"})

    sleep = AsyncMock()
    monkeypatch.setattr(client_module.asyncio, "sleep", sleep)
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = DespezzasClient(Settings(), FakeAuth(), http)

    assert await client.update_transaction(
        "transaction",
        {"title": "Novo"},
        idempotency_key="batch-key",
    ) == {"id": "transaction"}
    assert len(requests) == 3
    assert {request.headers["idempotency-key"] for request in requests} == {"batch-key"}
    assert sleep.await_count == 2
    await http.aclose()


async def test_client_does_not_retry_non_idempotent_post_on_429(monkeypatch):
    calls = 0

    class FakeAuth:
        async def get_token(self, force_refresh=False):
            return "token"

        async def status(self):
            return {}

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, json={"message": "rate limit"})

    sleep = AsyncMock()
    monkeypatch.setattr(client_module.asyncio, "sleep", sleep)
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = DespezzasClient(Settings(), FakeAuth(), http)

    try:
        await client.create_transaction({"title": "Compra"})
    except Exception as error:
        assert getattr(error, "status", None) == 429
    else:
        raise AssertionError("POST com 429 deveria falhar sem retry")
    assert calls == 1
    sleep.assert_not_awaited()
    await http.aclose()
