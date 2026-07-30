from datetime import date
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
    tools_module.TRANSACTION_LOOKUP_HINTS.clear()
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


async def test_search_schema_exposes_cursor_and_offset():
    async with Client(mcp) as client:
        listed = {tool.name: tool for tool in await client.list_tools()}
    properties = listed["despezzas_search_transactions"].inputSchema["properties"]
    assert properties["cursor"]["anyOf"][-1] == {"type": "null"}
    assert properties["offset"]["anyOf"][0] == {"minimum": 0, "type": "integer"}


async def test_credit_card_write_schemas_do_not_accept_calculated_available_limit():
    async with Client(mcp) as client:
        listed = {tool.name: tool for tool in await client.list_tools()}
    for name in ("despezzas_create_credit_card", "despezzas_update_credit_card"):
        assert "available_limit_cents" not in listed[name].inputSchema["properties"]
        assert "available_limit_cents é calculado e não é aceito" in listed[name].description


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
    assert "edition_date" not in payload
    assert "edition_type" not in payload


async def test_failed_transaction_validation_does_not_claim_persisted_update(no_api):
    before = transaction(date="2025-01-15T00:00:00.000Z")
    no_api.get_transactions.side_effect = [[before], [before]]
    no_api.update_transaction.return_value = before

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_update_transaction",
            {
                "id": "transaction",
                "date": "2025-01-16",
                "confirm": True,
            },
        )

    assert result.data["status"] == "failed_validation"
    assert result.data["ok"] is False
    assert result.data["updated"] is False
    assert result.data["api_called"] is True
    assert result.data["api_accepted"] is True


async def test_prepare_create_rejects_incompatible_category_pair(no_api):
    no_api.get_subcategories.return_value = [
        {
            "id": "supermarket",
            "category_id": "food",
        }
    ]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_prepare_create_transaction",
            {
                "title": "Mercado",
                "amount_cents": 100,
                "date": "2026-07-30",
                "account_id": "account",
                "category_id": "housing",
                "subcategory_id": "supermarket",
            },
        )

    assert result.data["ready"] is False
    assert result.data["issues"] == ["A subcategoria informada não pertence à categoria selecionada."]


async def test_create_blocks_incompatible_category_pair_before_write(no_api):
    no_api.get_subcategories.return_value = [
        {
            "id": "supermarket",
            "category_id": "food",
        }
    ]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_create_transaction",
            {
                "title": "Mercado",
                "amount_cents": 100,
                "date": "2026-07-30",
                "account_id": "account",
                "category_id": "housing",
                "subcategory_id": "supermarket",
                "confirm": True,
            },
        )

    assert "não pertence" in result.data["error"]
    no_api.create_transaction.assert_not_awaited()


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


async def test_prepare_update_finds_historical_transaction_by_date_and_account_type(no_api):
    historical = transaction(id="historical", date="2025-07-10T00:00:00.000Z")
    no_api.get_transactions.side_effect = [[], [], [historical]]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_prepare_update_transaction",
            {
                "id": "historical",
                "title": "Celesc | Energia elétrica",
                "edition_date": "2025-07-10",
            },
        )

    assert result.data["ready"] is True
    assert result.data["before"]["id"] == "historical"
    assert no_api.get_transactions.await_args_list[1].args == (
        {
            "account_type": "bank_account",
            "date_start": "2025-07-10",
            "date_end": "2025-07-11",
        },
    )
    assert no_api.get_transactions.await_args_list[2].args == (
        {
            "account_type": "credit_card",
            "date_start": "2025-07-10",
            "date_end": "2025-07-11",
        },
    )


async def test_search_hint_finds_historical_transaction_without_repeating_date(no_api):
    historical = transaction(id="historical", date="2025-07-10T00:00:00.000Z")
    no_api.get_transactions.side_effect = [[historical], [], [historical]]
    no_api.get_profile.return_value = {"current_profile_access_id": None}
    no_api.list_profile_access.return_value = {}

    async with Client(mcp) as client:
        search = await client.call_tool(
            "despezzas_search_transactions",
            {
                "date_start": "2025-07-10",
                "date_end": "2025-07-10",
            },
        )
        result = await client.call_tool(
            "despezzas_prepare_update_transaction",
            {
                "id": search.data["transactions"][0]["id"],
                "title": "Celesc | Energia elétrica",
            },
        )

    assert result.data["ready"] is True
    assert result.data["before"]["date"] == "2025-07-10"
    assert no_api.get_transactions.await_args_list[2].args == (
        {
            "account_type": "bank_account",
            "date_start": "2025-07-10",
            "date_end": "2025-07-11",
        },
    )
    assert no_api.get_transactions.await_count == 3


async def test_prepare_update_finds_imported_transaction_without_process_hint(no_api):
    current_year = date.today().year
    imported = transaction(
        id="imported",
        external_id="imported",
        is_remote=True,
        date=f"{current_year}-06-10T03:00:00.000Z",
    )
    no_api.get_transactions.side_effect = [[], [imported]]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_prepare_update_transaction",
            {
                "id": "imported",
                "title": "iFood | Pedido via delivery",
            },
        )

    assert result.data["ready"] is True
    assert result.data["before"]["id"] == "imported"
    assert result.data["before"]["editable"] is True
    assert no_api.get_transactions.await_args_list[1].args == (
        {
            "account_type": "bank_account",
            "date_start": f"{current_year}-01-01",
            "date_end": f"{current_year + 1}-01-01",
        },
    )


async def test_batch_preview_resolves_manual_and_imported_transactions_together(no_api):
    current_year = date.today().year
    manual = transaction(id="manual")
    imported_expense = transaction(
        id="imported-expense",
        external_id="imported-expense",
        is_remote=True,
        date=f"{current_year}-06-10T03:00:00.000Z",
    )
    imported_income = transaction(
        id="imported-income",
        external_id="imported-income",
        is_remote=True,
        is_expense=False,
        date=f"{current_year}-05-02T03:00:00.000Z",
    )
    no_api.get_transactions.side_effect = [[manual], [imported_expense, imported_income]]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_prepare_batch_update_transactions",
            {
                "updates": [
                    {"id": "manual", "title": "Manual atualizado"},
                    {"id": "imported-expense", "title": "Despesa importada atualizada"},
                    {"id": "imported-income", "title": "Entrada importada atualizada"},
                ]
            },
        )

    assert result.data["all_ready"] is True
    assert result.data["ready_count"] == 3
    assert [item["before"]["id"] for item in result.data["preview"]] == [
        "manual",
        "imported-expense",
        "imported-income",
    ]


async def test_unchanged_update_does_not_call_write_api(no_api):
    no_api.get_transactions.return_value = [transaction()]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_update_transaction",
            {"id": "transaction", "title": "Conta de luz", "confirm": True},
        )

    assert result.data["status"] == "unchanged"
    assert result.data["updated"] is False
    assert result.data["api_called"] is False
    no_api.update_transaction.assert_not_awaited()


async def test_unchanged_batch_reports_without_writes(no_api):
    no_api.get_transactions.return_value = [
        transaction(id="one"),
        transaction(id="two"),
    ]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_batch_update_transactions",
            {
                "updates": [
                    {"id": "one", "title": "Conta de luz"},
                    {"id": "two", "title": "Conta de luz"},
                ],
                "confirm": True,
            },
        )

    assert result.data["updated_count"] == 0
    assert result.data["api_updated_count"] == 0
    assert result.data["unchanged_count"] == 2
    assert [item["status"] for item in result.data["results"]] == ["unchanged", "unchanged"]
    no_api.update_transaction.assert_not_awaited()


async def test_manual_account_update_merges_full_current_payload_and_validates(no_api):
    before = {
        "id": "account",
        "name": "Conta teste",
        "logo": "wallet.svg",
        "balance": 100,
        "include_total_balance": True,
        "type": "OTHER",
    }
    after = {**before, "name": "Conta atualizada"}
    no_api.get_accounts.side_effect = [[before], [after]]
    no_api.update_account.return_value = after

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_update_account",
            {
                "id": "account",
                "name": "Conta atualizada",
                "confirm": True,
            },
        )

    payload = no_api.update_account.await_args.args[1]
    assert payload["logo"] == "wallet.svg"
    assert payload["balance"] == 100
    assert payload["include_total_balance"] is True
    assert result.data["status"] == "success"
    assert result.data["updated"] is True
    assert result.data["validation"]["ok"] is True


async def test_account_update_returns_sanitized_api_diagnostic(no_api):
    no_api.get_accounts.return_value = [
        {
            "id": "account",
            "name": "Conta teste",
            "logo": "wallet.svg",
            "balance": 100,
            "include_total_balance": True,
        }
    ]
    no_api.update_account.side_effect = DespezzasApiError(
        "secret-token",
        400,
        {
            "code": "VALIDATION_ERROR",
            "message": "logo required token=secret-token",
            "authorization": "Bearer secret-token",
        },
        request_id="request-123",
    )

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_update_account",
            {
                "id": "account",
                "name": "Conta atualizada",
                "confirm": True,
            },
        )

    assert result.data["updated"] is False
    assert result.data["diagnostic"]["endpoint"] == "/v1/accounts/account"
    assert result.data["diagnostic"]["method"] == "PUT"
    assert result.data["diagnostic"]["status"] == 400
    assert result.data["diagnostic"]["api"]["code"] == "VALIDATION_ERROR"
    assert result.data["diagnostic"]["api"]["request_id"] == "request-123"
    assert "secret-token" not in str(result.data)


async def test_credit_card_update_uses_writable_fields_and_validates(no_api):
    before = {
        "id": "card",
        "name": "Cartão teste",
        "logo": "card.svg",
        "account_id": "account",
        "limit": 10000,
        "available_limit": 9000,
        "is_unlimited": False,
        "closing_date": "5",
        "expiring_date": "10",
    }
    after = {**before, "limit": 12000, "available_limit": 11000}
    no_api.get_credit_cards.side_effect = [[before], [after]]
    no_api.update_credit_card.return_value = after

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_update_credit_card",
            {
                "id": "card",
                "limit_cents": 12000,
                "confirm": True,
            },
        )

    payload = no_api.update_credit_card.await_args.args[1]
    assert payload["name"] == "Cartão teste"
    assert payload["account_id"] == "account"
    assert payload["limit"] == 12000
    assert "available_limit" not in payload
    assert result.data["status"] == "success"
    assert result.data["validation"]["ok"] is True


async def test_credit_card_create_reloads_and_validates_writable_fields(no_api):
    created = {
        "id": "card",
        "name": "Cartão teste",
        "logo": "card.svg",
        "account_id": "account",
        "limit": 10000,
        "available_limit": 10000,
        "is_unlimited": False,
        "closing_date": "5",
        "expiring_date": "10",
    }
    no_api.create_credit_card.return_value = created
    no_api.get_credit_cards.return_value = [created]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_create_credit_card",
            {
                "name": "Cartão teste",
                "logo": "card.svg",
                "account_id": "account",
                "limit_cents": 10000,
                "is_unlimited": False,
                "closing_date": "5",
                "expiring_date": "10",
                "confirm": True,
            },
        )

    payload = no_api.create_credit_card.await_args.args[0]
    assert "available_limit" not in payload
    assert result.data["status"] == "success"
    assert result.data["created"] is True
    assert result.data["validation"]["ok"] is True


async def test_switch_profile_returns_only_minimal_normalized_context(no_api):
    no_api.change_profile.return_value = {
        "email": "private@example.com",
        "subscription_token": "secret-token",
    }
    no_api.get_profile.return_value = {
        "current_profile_access_id": "legacy-family",
        "current_profile_role": "owner",
    }
    no_api.list_profile_access.return_value = {
        "owner_profiles": [
            {
                "id": "legacy-family",
                "name": "Perfil familiar",
                "type": "pf",
                "email": "private@example.com",
            }
        ]
    }

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_switch_profile",
            {"profile_id": "legacy-family", "confirm": True},
        )

    assert result.data["switched"] is True
    assert result.data["active_profile"] == {
        "id": "legacy-family",
        "name": "Perfil familiar",
        "type": "family",
        "role": "owner",
        "is_active": True,
        "is_personal_profile": False,
    }
    assert "result" not in result.data
    assert "private@example.com" not in str(result.data)
    assert "secret-token" not in str(result.data)


async def test_list_profiles_returns_compact_normalized_profiles(no_api):
    no_api.get_profile.return_value = {
        "current_profile_access_id": "legacy-family",
        "email": "private@example.com",
    }
    no_api.list_profile_access.return_value = {
        "owner_profiles": [
            {
                "id": "legacy-family",
                "name": "Perfil familiar",
                "type": "pf",
                "email": "private@example.com",
                "subscription": {"status": "active"},
            }
        ],
        "authentication": {"token": "secret-token"},
    }

    async with Client(mcp) as client:
        result = await client.call_tool("despezzas_list_profiles", {})

    assert result.data["active_profile"]["type"] == "family"
    assert result.data["profiles"] == [
        {
            "id": "legacy-family",
            "name": "Perfil familiar",
            "type": "family",
            "role": "owner",
            "is_active": True,
        }
    ]
    assert "private@example.com" not in str(result.data)
    assert "secret-token" not in str(result.data)


async def test_update_and_batch_block_incompatible_category_pair(no_api):
    no_api.get_transactions.return_value = [transaction()]
    no_api.get_subcategories.return_value = [
        {
            "id": "supermarket",
            "category_id": "food",
        }
    ]
    incompatible = {
        "id": "transaction",
        "category_id": "housing",
        "subcategory_id": "supermarket",
    }

    async with Client(mcp) as client:
        preview = await client.call_tool("despezzas_prepare_update_transaction", incompatible)
        update = await client.call_tool(
            "despezzas_update_transaction",
            {**incompatible, "confirm": True},
        )
        batch_preview = await client.call_tool(
            "despezzas_prepare_batch_update_transactions",
            {"updates": [incompatible]},
        )
        batch = await client.call_tool(
            "despezzas_batch_update_transactions",
            {"updates": [incompatible], "confirm": True},
        )

    assert preview.data["ready"] is False
    assert preview.data["issues"] == ["A subcategoria informada não pertence à categoria selecionada."]
    assert update.data["mode"] == "blocked"
    assert update.data["updated"] is False
    assert batch_preview.data["all_ready"] is False
    assert batch.data["mode"] == "blocked"
    assert batch.data["updated_count"] == 0
    no_api.update_transaction.assert_not_awaited()


async def test_transfer_delete_previews_and_removes_both_sides(no_api):
    sent = transaction(
        id="sent-api",
        internal_id="sent",
        type="TRANSFER",
        connected_transaction_id="received-api",
        date="2026-07-30T00:00:00.000Z",
    )
    received = transaction(
        id="received-api",
        internal_id="received",
        type="TRANSFER",
        connected_transaction_id="sent-api",
        date="2026-07-30T00:00:00.000Z",
    )
    no_api.get_transactions.side_effect = [[sent, received], [sent, received], [], [], []]
    no_api.delete_transaction.return_value = {}

    async with Client(mcp) as client:
        preview = await client.call_tool(
            "despezzas_prepare_delete_transaction",
            {"id": "sent"},
        )
        result = await client.call_tool(
            "despezzas_delete_transaction",
            {"id": "sent", "confirm": True},
        )

    assert preview.data["transaction_type"] == "TRANSFER"
    assert preview.data["affected_transactions"] == ["sent", "received"]
    assert preview.data["relationship_match"] == [
        "connected_to_counterpart_id",
        "counterpart_connected_to_source_id",
    ]
    assert [call.args[:2] for call in no_api.delete_transaction.await_args_list] == [
        ("sent", "THIS"),
        ("received", "THIS"),
    ]
    assert result.data["status"] == "success"
    assert result.data["deleted"] is True
    assert result.data["validation"]["remaining_transaction_ids"] == []


async def test_transfer_preview_fetches_counterpart_by_date_and_uses_internal_id(no_api):
    sent = transaction(
        id="sent-api",
        internal_id="sent",
        type="TRANSFER",
        connected_transaction_id="received-api",
        date="2026-07-30T00:00:00.000Z",
    )
    received = transaction(
        id="received-api",
        internal_id="received",
        type="TRANSFER",
        connected_transaction_id="sent-api",
        date="2026-07-30T00:00:00.000Z",
    )
    no_api.get_transactions.side_effect = [[sent], [sent, received], []]

    async with Client(mcp) as client:
        preview = await client.call_tool(
            "despezzas_prepare_delete_transaction",
            {"id": "sent"},
        )

    assert preview.data["ready"] is True
    assert preview.data["affected_transactions"] == ["sent", "received"]
    assert no_api.get_transactions.await_args_list[1].args == (
        {
            "account_type": "bank_account",
            "date_start": "2026-07-30",
            "date_end": "2026-07-31",
        },
    )
    assert no_api.get_transactions.await_args_list[2].args == (
        {
            "account_type": "credit_card",
            "date_start": "2026-07-30",
            "date_end": "2026-07-31",
        },
    )


async def test_transfer_delete_blocks_nonreciprocal_counterpart(no_api):
    sent = transaction(
        id="sent",
        type="TRANSFER",
        connected_transaction_id="unrelated",
        date="2026-07-30T00:00:00.000Z",
    )
    unrelated = transaction(
        id="unrelated",
        type="FIXED",
        date="2026-07-30T00:00:00.000Z",
    )
    no_api.get_transactions.return_value = [sent, unrelated]

    async with Client(mcp) as client:
        result = await client.call_tool(
            "despezzas_delete_transaction",
            {"id": "sent", "confirm": True},
        )

    assert result.data["status"] == "blocked"
    assert result.data["deleted"] is False
    assert "não pôde ser localizada" in result.data["error"]
    no_api.delete_transaction.assert_not_awaited()


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
