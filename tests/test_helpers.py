from despezzas_mcp.helpers import (
    compact_transaction,
    prepare_create_transaction,
    profile_context,
    redact,
    summarize_transactions,
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
    assert compact_transaction({"amount": 100})["profile_id"] is None
