from __future__ import annotations

import asyncio
import base64
import json
import time
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any

import httpx

from .config import Settings, settings

EXPIRY_SKEW_SECONDS = 5 * 60


class AuthRequiredError(RuntimeError):
    def __init__(
        self,
        message: str = (
            "Autenticação obrigatória. Configure DESPEZZAS_TOKEN ou "
            "DESPEZZAS_EMAIL/DESPEZZAS_PASSWORD/DESPEZZAS_FIREBASE_API_KEY nos secrets do Horizon."
        ),
    ) -> None:
        super().__init__(message)


@dataclass(frozen=True)
class AuthSession:
    id_token: str
    refresh_token: str | None
    expires_at: float | None
    user: Any = None
    email: str | None = None


class DespezzasAuthManager:
    def __init__(self, config: Settings = settings, http: httpx.AsyncClient | None = None) -> None:
        self.config = config
        self.http = http or httpx.AsyncClient(timeout=30)
        self.session: AuthSession | None = None
        # ponytail: um fork representa uma conta; separar locks apenas se houver contas por processo.
        self._lock = asyncio.Lock()

    async def get_token(self, force_refresh: bool = False) -> str:
        manual = (self.config.token or "").strip()
        if manual and not force_refresh and not jwt_expiring_soon(manual):
            return manual

        async with self._lock:
            if self.session and not force_refresh and not expiring_soon(self.session.expires_at):
                return self.session.id_token

            if self.session and self.session.refresh_token:
                try:
                    self.session = await self._refresh(self.session)
                    return self.session.id_token
                except AuthRequiredError:
                    self.session = None

            if self.config.email and self.config.password:
                self.session = await self._login(self.config.email, self.config.password)
                return self.session.id_token

            if manual and not force_refresh:
                return manual

            raise AuthRequiredError()

    async def status(self) -> dict[str, Any]:
        return {
            "hasManualToken": bool(self.config.token),
            "hasEnvCredentials": bool(self.config.email and self.config.password),
            "hasSession": bool(self.session),
            "canRefresh": bool(
                self.config.firebase_api_key
                and ((self.session and self.session.refresh_token) or (self.config.email and self.config.password))
            ),
            "expiresAt": iso_timestamp(self.session.expires_at if self.session else jwt_expiration(self.config.token)),
        }

    async def _login(self, email: str, password: str) -> AuthSession:
        key = self._firebase_key()
        response = await self.http.post(
            f"{self.config.api_base_url}/v2/auth",
            headers=browser_headers(),
            json={"email": email, "password": password},
        )
        data = response_json(response)
        ensure_success(response, data, "Login no Despezzas falhou.")
        custom_token = data.get("firebase_token") if isinstance(data, dict) else None
        if not isinstance(custom_token, str):
            raise RuntimeError("O login no Despezzas não retornou firebase_token.")

        response = await self.http.post(
            "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken",
            params={"key": key},
            json={"token": custom_token, "returnSecureToken": True},
        )
        firebase = response_json(response)
        ensure_success(response, firebase, "A troca do custom token do Firebase falhou.")
        if not isinstance(firebase, dict) or not isinstance(firebase.get("idToken"), str):
            raise RuntimeError("O Firebase não retornou idToken.")
        return AuthSession(
            id_token=firebase["idToken"],
            refresh_token=firebase.get("refreshToken"),
            expires_at=time.time() + int(firebase.get("expiresIn", 3600)),
            user=data.get("user") if isinstance(data, dict) else None,
            email=email,
        )

    async def _refresh(self, session: AuthSession) -> AuthSession:
        if not session.refresh_token:
            raise AuthRequiredError("A sessão do Despezzas não tem refresh token.")
        response = await self.http.post(
            "https://securetoken.googleapis.com/v1/token",
            params={"key": self._firebase_key()},
            data={"grant_type": "refresh_token", "refresh_token": session.refresh_token},
        )
        data = response_json(response)
        if response.is_error or not isinstance(data, dict) or not isinstance(data.get("id_token"), str):
            raise AuthRequiredError("A sessão do Despezzas expirou; o próximo acesso tentará novo login.")
        return replace(
            session,
            id_token=data["id_token"],
            refresh_token=data.get("refresh_token") or session.refresh_token,
            expires_at=time.time() + int(data.get("expires_in", 3600)),
        )

    def _firebase_key(self) -> str:
        if not self.config.firebase_api_key:
            raise AuthRequiredError(
                "DESPEZZAS_FIREBASE_API_KEY é obrigatório para login e renovação da sessão Firebase."
            )
        return self.config.firebase_api_key


def browser_headers() -> dict[str, str]:
    return {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Origin": "https://despezzas.com",
        "Referer": "https://despezzas.com/",
        "lang": "pt-BR",
    }


def response_json(response: httpx.Response) -> Any:
    if not response.content:
        return None
    try:
        return response.json()
    except json.JSONDecodeError:
        return response.text


def ensure_success(response: httpx.Response, data: Any, fallback: str) -> None:
    if not response.is_error:
        return
    message = data.get("message") if isinstance(data, dict) else None
    raise RuntimeError(f"HTTP {response.status_code}: {message or fallback}")


def expiring_soon(expires_at: float | None) -> bool:
    return expires_at is None or expires_at - time.time() < EXPIRY_SKEW_SECONDS


def jwt_expiration(token: str | None) -> float | None:
    if not token:
        return None
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        exp = json.loads(base64.urlsafe_b64decode(payload)).get("exp")
        return float(exp) if isinstance(exp, int | float) else None
    except (IndexError, ValueError, json.JSONDecodeError):
        return None


def jwt_expiring_soon(token: str) -> bool:
    expires_at = jwt_expiration(token)
    return bool(expires_at and expiring_soon(expires_at))


def iso_timestamp(timestamp: float | None) -> str | None:
    return datetime.fromtimestamp(timestamp, UTC).isoformat() if timestamp else None


auth_manager = DespezzasAuthManager()
