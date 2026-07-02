"""Entrypoint de proxy Prefect Horizon / FastMCP.

O Horizon publica servidores Python FastMCP. Este arquivo permite que o Horizon
exponha o backend Despezzas MCP em TypeScript por um gateway FastMCP gerenciado.
"""

import os

from fastmcp import Client
from fastmcp.client.auth import BearerAuth
from fastmcp.server import create_proxy


backend_url = os.environ.get("DESPEZZAS_MCP_BACKEND_URL")
backend_token = os.environ.get("DESPEZZAS_MCP_BACKEND_TOKEN")

if not backend_url:
    raise RuntimeError("DESPEZZAS_MCP_BACKEND_URL deve apontar para a URL /mcp do backend Node publicado.")

backend = (
    Client(backend_url, auth=BearerAuth(token=backend_token))
    if backend_token
    else backend_url
)

mcp = create_proxy(backend, name="Despezzas MCP")
