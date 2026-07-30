from __future__ import annotations

from fastmcp import FastMCP

from despezzas_mcp.tools import register_tools

mcp = FastMCP(
    name="despezzas-mcp",
    version="0.1.8",
    website_url="https://github.com/guipmilek/despezzas-mcp",
    mask_error_details=True,
    strict_input_validation=True,
    instructions=(
        "Servidor não oficial para finanças pessoais no Despezzas. "
        "Use ferramentas prepare_* antes de escritas e só confirme após revisar IDs e payloads."
    ),
)
register_tools(mcp)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
