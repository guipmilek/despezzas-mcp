from unittest.mock import AsyncMock

import pytest
from fastmcp import Client

from despezzas_mcp import tools as tools_module
from despezzas_mcp.client import DespezzasApiError
from despezzas_mcp.helpers import public_error
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
    "despezzas_prepare_batch_update_transactions",
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

NONDESTRUCTIVE_WRITES = {
    "despezzas_switch_profile",
    "despezzas_create_profile",
    "despezzas_create_account",
    "despezzas_create_credit_card",
    "despezzas_create_transaction",
    "despezzas_duplicate_transaction",
    "despezzas_create_transfer",
}


@pytest.fixture
def no_api(monkeypatch):
    fake = AsyncMock()
    monkeypatch.setattr(tools_module, "client", fake)
    return fake


async def test_catalog_has_exactly_36_tools():
    async with Client(mcp) as client:
        listed = await client.list_tools()
    assert {tool.name for tool in listed} == EXPECTED_TOOLS


async def test_catalog_exposes_complete_and_accurate_metadata():
    async with Client(mcp) as client:
        listed = await client.list_tools()
    for tool in listed:
        assert tool.outputSchema is not None, tool.name
        assert tool.annotations is not None, tool.name
        assert tool.annotations.openWorldHint is False, tool.name
        assert tool.annotations.idempotentHint is not None, tool.name
        if tool.annotations.readOnlyHint is False:
            assert "confirm" in tool.inputSchema["properties"], tool.name
            assert tool.annotations.destructiveHint is (tool.name not in NONDESTRUCTIVE_WRITES), tool.name


def test_public_errors_do_not_expose_exception_details():
    assert "secret-token" not in public_error(RuntimeError("secret-token"))
    assert public_error(RuntimeError("secret-token")) == "A operação falhou sem expor detalhes internos."
    assert public_error(DespezzasApiError("secret-token", 403, {})) == "A API Despezzas retornou HTTP 403."


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


def transaction(**overrides):
    value = {
        "id": "transaction",
        "title": "Conta de luz",
        "description": "Julho",
        "amount": 6682,
        "date": "2026-07-10T00:00:00.000Z",
        "is_expense": True,
        "type": "FIXED",
        "frequency": "MONTHLY",
        "installments": 1,
        "installment_number": 1,
        "is_full_amount": True,
        "account_id": "account",
        "credit_card_id": None,
        "category_id": "category",
        "subcategory_id": "subcategory",
        "paid": True,
    }
    return {**value, **overrides}


async def test_update_transaction_merges_and_validates_preserved_fields(no_api):
    before = transaction()
    after = transaction(description="Conta Celesc")
    no_api.get_transactions.side_effect = [[before], [after]]
    no_api.update_transaction.return_value = after

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_update_transaction",
            {"id": "transaction", "description": "Conta Celesc", "confirm": True},
        )

    assert result.data["mode"] == "executed"
    assert result.data["status"] == "success"
    assert result.data["ok"] is True
    assert result.data["transaction"]["amount_cents"] == 6682
    payload = no_api.update_transaction.await_args.args[1]
    assert payload["subcategory_id"] == "subcategory"
    assert payload["date"] == "2026-07-10"
    assert payload["edition_date"] == "2026-07-10"
    assert payload["edition_type"] == "THIS"


async def test_prepare_update_distinguishes_omitted_and_explicit_null(no_api):
    no_api.get_transactions.return_value = [transaction()]

    async with Client(mcp) as client:
        omitted = await client.call_tool(
            "despezzas_prepare_update_transaction",
            {"id": "transaction", "title": "Novo"},
        )
        cleared = await client.call_tool(
            "despezzas_prepare_update_transaction",
            {"id": "transaction", "subcategory_id": None},
        )

    assert omitted.data["before"]["subcategory_id"] == "subcategory"
    assert omitted.data["after"]["subcategory_id"] == "subcategory"
    assert "subcategory_id" not in omitted.data["changed_fields"]
    assert cleared.data["after"].get("subcategory_id") is None
    assert cleared.data["changed_fields"] == ["subcategory_id"]
    no_api.update_transaction.assert_not_awaited()


async def test_batch_reports_failed_and_not_attempted_items(no_api):
    before = [transaction(), transaction(id="transaction-2"), transaction(id="transaction-3")]
    after_first = [transaction(title="Primeiro"), before[1], before[2]]
    no_api.get_transactions.side_effect = [before, after_first]
    no_api.update_transaction.side_effect = [
        transaction(title="Primeiro"),
        DespezzasApiError("rate limit", 429, {}),
    ]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_batch_update_transactions",
            {
                "updates": [
                    {"id": "transaction", "title": "Primeiro"},
                    {"id": "transaction-2", "title": "Segundo"},
                    {"id": "transaction-3", "title": "Terceiro"},
                ],
                "confirm": True,
                "stop_on_error": True,
            },
        )

    assert result.data["mode"] == "executed"
    assert result.data["failed_count"] == 1
    assert result.data["not_attempted_count"] == 1
    assert [item["status"] for item in result.data["results"]] == [
        "success",
        "failed",
        "not_attempted",
    ]


async def test_search_transactions_exposes_stable_cursor(no_api):
    no_api.get_transactions.return_value = [
        transaction(id="b", date="2026-07-02"),
        transaction(id="a", date="2026-07-02"),
        transaction(id="c", date="2026-07-01"),
    ]
    no_api.get_profile.return_value = {"current_profile_access_id": None}
    no_api.list_profile_access.return_value = {}

    async with Client(mcp) as client:
        first = await client.call_tool(
            "despezzas_search_transactions",
            {
                "date_start": "2026-07-01",
                "date_end": "2026-07-31",
                "order": "desc",
                "limit": 2,
            },
        )
        second = await client.call_tool(
            "despezzas_search_transactions",
            {
                "date_start": "2026-07-01",
                "date_end": "2026-07-31",
                "order": "desc",
                "limit": 2,
                "cursor": first.data["next_cursor"],
            },
        )

    assert first.data["total_count"] == 3
    assert first.data["has_more"] is True
    assert [item["id"] for item in first.data["transactions"]] == ["b", "a"]
    assert [item["id"] for item in second.data["transactions"]] == ["c"]
    assert second.data["next_cursor"] is None
