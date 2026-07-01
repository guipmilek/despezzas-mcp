"""Prefect Horizon / FastMCP proxy entrypoint.

Horizon deploys Python FastMCP servers. This file lets Horizon expose the
TypeScript Despezzas MCP backend through a managed FastMCP gateway.
"""

import os

from fastmcp import Client
from fastmcp.client.auth import BearerAuth
from fastmcp.server import create_proxy


backend_url = os.environ.get("DESPEZZAS_MCP_BACKEND_URL")
backend_token = os.environ.get("DESPEZZAS_MCP_BACKEND_TOKEN")

if not backend_url:
    raise RuntimeError("DESPEZZAS_MCP_BACKEND_URL must point to the deployed Node backend /mcp URL.")

backend = (
    Client(backend_url, auth=BearerAuth(token=backend_token))
    if backend_token
    else backend_url
)

mcp = create_proxy(backend, name="Despezzas MCP")
