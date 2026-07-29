from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    api_base_url: str = "https://api.despezzas.com"
    firebase_api_key: str | None = None
    token: str | None = None
    email: str | None = None
    password: str | None = None

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            api_base_url=os.getenv("DESPEZZAS_API_BASE_URL", cls.api_base_url).rstrip("/"),
            firebase_api_key=os.getenv("DESPEZZAS_FIREBASE_API_KEY") or None,
            token=os.getenv("DESPEZZAS_TOKEN") or None,
            email=os.getenv("DESPEZZAS_EMAIL") or None,
            password=os.getenv("DESPEZZAS_PASSWORD") or None,
        )


settings = Settings.from_env()
