from unittest.mock import AsyncMock

import pytest
from fastmcp import Client

from despezzas_mcp import tools as tools_module
from despezzas_mcp.server import mcp

EXPECTED_TOOLS = {
    "despezzas_status",
    "despezzas_profile",
    "despezzas_list_profiles",
    "despezzas_switch_profile",
    "despezzas_create_profile",
    "despezzas_update_profile_access",
    "despezzas_delete_profile",
    "despezzas_leave_profile",
    "despezzas_personal_config",
    "despezzas_list_accounts",
    "despezzas_list_banks",
    "despezzas_create_account",
    "despezzas_update_account",
    "despezzas_delete_account",
    "despezzas_list_credit_cards",
    "despezzas_create_credit_card",
    "despezzas_update_credit_card",
    "despezzas_delete_credit_card",
    "despezzas_list_categories",
    "despezzas_list_subcategories",
    "despezzas_search_transactions",
    "despezzas_transaction_overview",
    "despezzas_finance_summary",
    "despezzas_prepare_create_transaction",
    "despezzas_create_transaction",
    "despezzas_prepare_update_transaction",
    "despezzas_update_transaction",
    "despezzas_batch_update_transactions",
    "despezzas_prepare_delete_transaction",
    "despezzas_delete_transaction",
    "despezzas_duplicate_transaction",
    "despezzas_toggle_transaction_paid",
    "despezzas_create_transfer",
    "despezzas_export_transactions",
    "despezzas_raw_api",
}


@pytest.fixture
def no_api(monkeypatch):
    fake = AsyncMock()
    monkeypatch.setattr(tools_module, "client", fake)
    return fake


async def test_catalog_has_exactly_35_tools():
    async with Client(mcp) as client:
        listed = await client.list_tools()
    assert {tool.name for tool in listed} == EXPECTED_TOOLS


async def test_every_destructive_tool_exposes_confirmation():
    async with Client(mcp) as client:
        listed = await client.list_tools()
    destructive = [tool for tool in listed if tool.annotations and tool.annotations.destructiveHint]
    assert destructive
    for tool in destructive:
        assert "confirm" in tool.inputSchema["properties"], tool.name


@pytest.mark.parametrize(
    ("name", "arguments"),
    [
        ("despezzas_switch_profile", {"profile_id": None}),
        ("despezzas_create_profile", {"name": "Família", "type": "family"}),
        ("despezzas_update_profile_access", {"id": "profile", "name": "Novo"}),
        ("despezzas_delete_profile", {"id": "profile"}),
        ("despezzas_leave_profile", {"profile_id": "profile"}),
        ("despezzas_create_account", {"name": "Conta", "logo": "logo"}),
        ("despezzas_update_account", {"id": "account", "name": "Conta"}),
        ("despezzas_delete_account", {"id": "account"}),
        ("despezzas_create_credit_card", {"name": "Cartão"}),
        ("despezzas_update_credit_card", {"id": "card", "name": "Cartão"}),
        ("despezzas_delete_credit_card", {"id": "card"}),
        (
            "despezzas_create_transaction",
            {
                "title": "Compra",
                "amount_cents": 100,
                "date": "2026-07-29",
                "account_id": "account",
                "category_id": "category",
            },
        ),
        ("despezzas_update_transaction", {"id": "transaction", "title": "Novo"}),
        ("despezzas_batch_update_transactions", {"updates": [{"id": "transaction", "title": "Novo"}]}),
        ("despezzas_delete_transaction", {"id": "transaction"}),
        ("despezzas_duplicate_transaction", {"id": "transaction"}),
        ("despezzas_toggle_transaction_paid", {"id": "transaction"}),
        (
            "despezzas_create_transfer",
            {
                "amount_cents": 100,
                "date": "2026-07-29",
                "sent_account_id": "one",
                "received_account_id": "two",
            },
        ),
        (
            "despezzas_raw_api",
            {
                "method": "POST",
                "path": "/v1/example",
                "allow_destructive": True,
            },
        ),
    ],
)
async def test_write_tools_refuse_before_api_call(no_api, name, arguments):
    async with Client(mcp) as client:
        result = await client.call_tool(name, arguments)
    assert (
        result.data.get("refused") is True
        or result.data.get("requires_confirm") is True
        or "Recusando" in result.data.get("error", "")
    )
    assert not no_api.mock_calls


async def test_prepare_create_transaction_keeps_integer_cents(no_api):
    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_prepare_create_transaction",
            {
                "title": "Mercado",
                "amount_cents": 12345,
                "date": "2026-07-29",
                "account_id": "account",
                "category_id": "category",
            },
        )
    assert result.data["ready"] is True
    assert result.data["payload"]["amount"] == 12345
    no_api.assert_not_awaited()
