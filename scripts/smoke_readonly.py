from __future__ import annotations

import asyncio

from despezzas_mcp.client import client


async def smoke() -> None:
    status = await client.auth_status()
    if not (status["hasManualToken"] or status["hasEnvCredentials"]):
        raise SystemExit("Configure DESPEZZAS_TOKEN ou as credenciais antes do smoke test.")
    profile, accounts, categories = await asyncio.gather(
        client.get_profile(),
        client.get_accounts(),
        client.get_categories(),
    )
    print(
        {
            "ok": True,
            "profile": bool(profile),
            "accounts": len(accounts) if isinstance(accounts, list) else None,
            "categories": len(categories) if isinstance(categories, list) else None,
        }
    )


if __name__ == "__main__":
    asyncio.run(smoke())
