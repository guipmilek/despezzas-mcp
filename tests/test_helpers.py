from despezzas_mcp.helpers import (
    build_update_plan,
    category_pair_issue,
    compact_transaction,
    decode_cursor,
    encode_cursor,
    locate_transaction,
    prepare_create_transaction,
    prepare_update_transaction,
    profile_context,
    redact,
    resolve_transfer_counterpart,
    summarize_transactions,
    validate_update_result,
)


def test_redaction_is_recursive():
    assert redact({"nested": {"access_token": "secret"}, "title": "safe"}) == {
        "nested": {"access_token": "[mascarado]"},
        "title": "safe",
    }


def test_prepare_rejects_ambiguous_destination():
    prepared = prepare_create_transaction(
        {
            "title": "Compra",
            "amount_cents": 100,
            "date": "2026-07-29",
            "kind": "expense",
            "account_id": "account",
            "credit_card_id": "card",
            "category_id": "category",
        }
    )
    assert prepared["ready"] is False
    assert "não ambos" in prepared["issues"][0]


def test_summary_uses_integer_cents():
    summary = summarize_transactions(
        [
            {"amount": 1000, "is_expense": True, "paid": True},
            {"amount": 2500, "is_expense": False, "paid": False},
        ]
    )
    assert summary["totals"] == {
        "expenses_cents": 1000,
        "revenues_cents": 2500,
        "net_cents": 1500,
        "paid_cents": 1000,
        "unpaid_cents": 2500,
    }


def test_personal_profile_and_compact_transaction_keep_nullable_ids():
    context = profile_context({"current_profile_access_id": None}, {})
    assert context["active_profile"]["id"] is None
    assert context["active_profile"]["type"] == "personal"
    assert compact_transaction({"amount": 100})["profile_id"] is None


def current_transaction():
    return {
        "id": "transaction",
        "title": "Conta de luz",
        "description": "Julho",
        "amount": 6682,
        "date": "2026-07-10T00:00:00.000Z",
        "is_expense": True,
        "type": "PARCELLED",
        "frequency": "MONTHLY",
        "installments": 12,
        "installment_number": 4,
        "is_full_amount": True,
        "account_id": "account",
        "credit_card_id": None,
        "category_id": "category",
        "subcategory_id": "subcategory",
        "paid": True,
    }


def test_partial_update_merges_current_state_and_preserves_subcategory():
    prepared = prepare_update_transaction({"id": "transaction", "description": "Conta Celesc"})
    plan = build_update_plan(current_transaction(), prepared)

    assert plan["ready"] is True
    assert plan["payload"]["description"] == "Conta Celesc"
    assert plan["payload"]["subcategory_id"] == "subcategory"
    assert plan["payload"]["amount"] == 6682
    assert plan["payload"]["date"] == "2026-07-10"
    assert plan["payload"]["installments"] == 12
    assert plan["payload"]["installment_number"] == 4
    assert plan["changed_fields"] == ["description"]


def test_explicit_null_clears_subcategory_but_omission_preserves_it():
    omitted = build_update_plan(
        current_transaction(),
        prepare_update_transaction({"id": "transaction", "title": "Novo título"}),
    )
    cleared = build_update_plan(
        current_transaction(),
        prepare_update_transaction({"id": "transaction", "subcategory_id": None}),
    )

    assert omitted["payload"]["subcategory_id"] == "subcategory"
    assert cleared["payload"]["subcategory_id"] is None
    assert cleared["after"].get("subcategory_id") is None
    assert cleared["changed_fields"] == ["subcategory_id"]


def test_changed_relation_id_removes_stale_derived_name_from_after():
    current = {
        **current_transaction(),
        "subcategory": {"id": "subcategory", "name": "iptu, ir ou ipva"},
    }
    plan = build_update_plan(
        current,
        prepare_update_transaction({"id": "transaction", "subcategory_id": None}),
    )

    assert plan["before"]["subcategory_name"] == "iptu, ir ou ipva"
    assert plan["after"].get("subcategory_id") is None
    assert plan["after"].get("subcategory_name") is None


def test_scope_all_uses_original_date_as_edition_anchor():
    plan = build_update_plan(
        current_transaction(),
        prepare_update_transaction({"id": "transaction", "scope": "ALL", "title": "Financiamento"}),
    )

    assert plan["payload"]["date"] == "2026-07-10"
    assert plan["payload"]["edition_date"] == "2026-07-10"
    assert plan["payload"]["edition_type"] == "ALL"
    assert "date" in plan["preserved_fields"]


def test_series_date_update_matches_official_frontend_field_direction():
    plan = build_update_plan(
        current_transaction(),
        prepare_update_transaction(
            {
                "id": "transaction",
                "scope": "ALL",
                "date": "2026-08-10",
            }
        ),
    )

    assert plan["payload"]["date"] == "2026-07-10"
    assert plan["payload"]["edition_date"] == "2026-08-10"


def test_unique_date_update_omits_series_edition_fields():
    current = {**current_transaction(), "type": "FIXED", "installments": 1}
    plan = build_update_plan(
        current,
        prepare_update_transaction({"id": "transaction", "date": "2026-08-10"}),
    )

    assert plan["payload"]["date"] == "2026-08-10"
    assert "edition_date" not in plan["payload"]
    assert "edition_type" not in plan["payload"]


def test_legacy_extra_pf_profile_is_normalized_to_family():
    context = profile_context(
        {"current_profile_access_id": "legacy-family"},
        {
            "owner_profiles": [
                {
                    "id": "legacy-family",
                    "name": "Perfil familiar",
                    "type": "pf",
                }
            ]
        },
    )

    assert context["active_profile"]["type"] == "family"
    assert context["active_profile"]["role"] == "owner"


def test_personal_profile_entry_with_null_id_is_not_normalized_to_family():
    context = profile_context(
        {"current_profile_access_id": None},
        {
            "owner_profiles": [
                {
                    "id": None,
                    "name": "Perfil Principal",
                    "type": "pf",
                },
                {
                    "id": "legacy-family",
                    "name": "Perfil familiar",
                    "type": "pf",
                },
            ]
        },
    )

    assert context["active_profile"]["type"] == "personal"
    assert context["active_profile"]["is_personal_profile"] is True
    assert [profile["type"] for profile in context["available_profiles"]] == ["personal", "family"]


def test_transfer_counterpart_resolves_connected_raw_api_id_to_internal_id():
    source = {
        "internal_id": "sent-internal",
        "id": "sent-api",
        "type": "TRANSFER",
        "connected_transaction_id": "received-api",
    }
    counterpart = {
        "internal_id": "received-internal",
        "id": "received-api",
        "type": "TRANSFER",
        "connected_transaction_id": "sent-api",
    }

    result = resolve_transfer_counterpart([source, counterpart], source)

    assert result["found"] is True
    assert result["id"] == "received-internal"
    assert result["match_modes"] == [
        "connected_to_counterpart_id",
        "counterpart_connected_to_source_id",
    ]


def test_transfer_counterpart_resolves_shared_connection_group():
    source = {
        "id": "sent",
        "type": "TRANSFER",
        "connected_transaction_id": "transfer-group",
    }
    counterpart = {
        "id": "received",
        "type": "TRANSFER",
        "connected_transaction_id": "transfer-group",
    }

    result = resolve_transfer_counterpart([source, counterpart], source)

    assert result["found"] is True
    assert result["id"] == "received"
    assert result["match_modes"] == ["shared_connection_id"]


def test_transfer_counterpart_rejects_ambiguous_shared_connection_group():
    source = {
        "id": "sent",
        "type": "TRANSFER",
        "connected_transaction_id": "transfer-group",
    }
    candidates = [
        {
            "id": candidate_id,
            "type": "TRANSFER",
            "connected_transaction_id": "transfer-group",
        }
        for candidate_id in ("received-one", "received-two")
    ]

    result = resolve_transfer_counterpart([source, *candidates], source)

    assert result["found"] is False
    assert "Mais de uma contraparte possível" in result["reason"]
    assert result["candidate_ids"] == ["received-one", "received-two"]


def test_category_pair_rejects_incompatible_subcategory():
    catalog = [{"id": "subcategory", "category_id": "other-category"}]
    assert "não pertence" in category_pair_issue("category", "subcategory", catalog)


def test_category_pair_rejects_subcategory_without_parent_metadata():
    catalog = [{"id": "subcategory", "name": "Sem categoria-pai"}]
    assert "não possui uma categoria associada" in category_pair_issue("category", "subcategory", catalog)


def test_external_id_is_not_mistaken_for_editable_internal_id():
    located = locate_transaction(
        [{"id": "internal", "external_id": "provider-123", "title": "IOF"}],
        "provider-123",
    )
    assert located["editable"] is False
    assert located["id_type"] == "external_id"
    assert located["internal_id"] == "internal"


def test_cursor_round_trip_and_filter_mismatch():
    cursor = encode_cursor(500, "fingerprint")
    assert decode_cursor(cursor, "fingerprint") == 500
    try:
        decode_cursor(cursor, "other")
    except ValueError as error:
        assert "incompatível" in str(error)
    else:
        raise AssertionError("cursor incompatível deveria falhar")


def test_post_update_validation_detects_silent_field_loss():
    plan = build_update_plan(
        current_transaction(),
        prepare_update_transaction({"id": "transaction", "description": "Nova descrição"}),
    )
    actual = {**current_transaction(), "description": "Nova descrição", "subcategory_id": None}
    validation = validate_update_result(plan, actual)

    assert validation["ok"] is False
    assert validation["mismatches"] == [{"field": "subcategory_id", "expected": "subcategory", "received": None}]
