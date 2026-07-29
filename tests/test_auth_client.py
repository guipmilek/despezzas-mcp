import asyncio

import httpx

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
