from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlsplit

SENSITIVE = ("authorization", "token", "password", "cookie", "secret", "credential")


def masked(key: str, value: Any) -> Any:
    return "[mascarado]" if any(part in key.lower() for part in SENSITIVE) else value


def summarize(entry: dict[str, Any]) -> dict[str, Any] | None:
    request = entry.get("request", {})
    url = request.get("url", "")
    parsed = urlsplit(url)
    if parsed.hostname != "api.despezzas.com":
        return None
    headers = {
        item.get("name", ""): masked(item.get("name", ""), item.get("value")) for item in request.get("headers", [])
    }
    query = {key: masked(key, value) for key, value in parse_qsl(parsed.query)}
    return {
        "method": request.get("method"),
        "path": parsed.path,
        "query": query,
        "headers": headers,
        "status": entry.get("response", {}).get("status"),
    }


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Uso: uv run python scripts/inspect_har.py caminho/arquivo.har")
    path = Path(sys.argv[1])
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    entries = data.get("log", {}).get("entries", [])
    output = [item for entry in entries if (item := summarize(entry)) is not None]
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
