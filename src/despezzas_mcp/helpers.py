from __future__ import annotations

import base64
import hashlib
import json
import math
import re
from collections import defaultdict
from collections.abc import Awaitable
from datetime import date
from typing import Any

from pydantic.experimental.missing_sentinel import MISSING

SENSITIVE_KEYS = {
    "password",
    "subscription_token",
    "subscription_id",
    "subscription_transaction_id",
    "password_reset_token",
    "auth_provider_uid",
    "external_token",
}
SENSITIVE_PATTERNS = ("token", "password", "secret", "credential", "authorization")
MAX_EXTRA_PROFILES = 3
TRANSACTION_FIELDS = (
    "title",
    "description",
    "amount",
    "date",
    "is_expense",
    "type",
    "frequency",
    "installments",
    "installment_number",
    "is_full_amount",
    "account_id",
    "credit_card_id",
    "category_id",
    "subcategory_id",
    "paid",
)
UPDATE_FIELD_MAP = {
    "title": "title",
    "description": "description",
    "amount_cents": "amount",
    "date": "date",
    "kind": "is_expense",
    "account_id": "account_id",
    "credit_card_id": "credit_card_id",
    "category_id": "category_id",
    "subcategory_id": "subcategory_id",
    "paid": "paid",
}


def redact(value: Any) -> Any:
    if isinstance(value, list):
        return [redact(item) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: "[mascarado]" if sensitive_key(key) else redact(child) for key, child in value.items()}


def sensitive_key(key: str) -> bool:
    normalized = key.lower()
    return normalized in SENSITIVE_KEYS or any(part in normalized for part in SENSITIVE_PATTERNS)


def clean(value: dict[str, Any]) -> dict[str, Any]:
    return {key: child for key, child in value.items() if child is not None}


def refusal(action: str) -> dict[str, Any]:
    message = (
        f"Recusando {action} porque confirm não foi true. Execute a ferramenta novamente com "
        "confirm: true depois de verificar os IDs de destino e o payload."
    )
    return {
        "refused": True,
        "action": action,
        "required_argument": "confirm",
        "required_value": True,
        "message": message,
    }


def public_error(error: Exception) -> str:
    status = getattr(error, "status", None)
    if isinstance(status, int):
        return f"A API Despezzas retornou HTTP {status}."
    return "A operação falhou sem expor detalhes internos."


def api_error_diagnostic(
    error: Exception,
    *,
    endpoint: str,
    method: str,
    fields_sent: list[str],
) -> dict[str, Any]:
    details = getattr(error, "details", None)
    details = details if isinstance(details, dict) else {}
    code = first_safe_detail(details, ("code", "error_code", "type"), 100)
    message = first_safe_detail(details, ("message", "error", "detail"), 300)
    request_id = safe_text(getattr(error, "request_id", None), 100) or first_safe_detail(
        details,
        ("request_id", "requestId", "trace_id", "traceId"),
        100,
    )
    return clean(
        {
            "endpoint": endpoint,
            "method": method,
            "fields_sent": sorted(fields_sent),
            "status": getattr(error, "status", None),
            "api": clean(
                {
                    "code": code,
                    "message": message,
                    "request_id": request_id,
                }
            ),
        }
    )


def first_safe_detail(details: dict[str, Any], keys: tuple[str, ...], max_length: int) -> str | None:
    for key in keys:
        value = safe_text(details.get(key), max_length)
        if value:
            return value
    return None


def safe_text(value: Any, max_length: int) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()[:max_length]
    text = re.sub(
        r"(?i)\b(token|password|secret|credential|authorization|bearer)\b\s*[:=]?\s*\S+",
        r"\1=[mascarado]",
        text,
    )
    text = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[mascarado]", text)
    return text


async def attempt(action: str, operation: Awaitable[Any]) -> Any:
    try:
        return redact(await operation)
    except Exception as error:
        return {"error": public_error(error), "action": action}


def current_month_range(today: date | None = None) -> tuple[str, str]:
    current = today or date.today()
    if current.month == 12:
        next_month = date(current.year + 1, 1, 1)
    else:
        next_month = date(current.year, current.month + 1, 1)
    return current.replace(day=1).isoformat(), date.fromordinal(next_month.toordinal() - 1).isoformat()


def transaction_filters(**args: Any) -> dict[str, Any]:
    return clean(
        {
            "account_type": args.get("account_type"),
            "account_ids": args.get("account_ids"),
            "credit_card_ids": args.get("credit_card_ids"),
            "category_ids": args.get("category_ids"),
            "subcategory_ids": args.get("subcategory_ids"),
            "date_start": args.get("date_start"),
            "date_end": args.get("date_end"),
            "is_paid": args.get("is_paid"),
            "is_expense": args.get("is_expense"),
            "value": (args.get("min_amount_cents") if args.get("min_amount_cents") is not None else args.get("value")),
            "search": (args.get("search") or "").strip() or None,
            "order_by": args.get("order_by"),
            "order": args.get("order"),
        }
    )


def prepare_create_transaction(args: dict[str, Any]) -> dict[str, Any]:
    issues: list[str] = []
    if not args.get("account_id") and not args.get("credit_card_id"):
        issues.append("account_id ou credit_card_id é obrigatório.")
    if args.get("account_id") and args.get("credit_card_id"):
        issues.append("Informe account_id ou credit_card_id, não ambos.")
    if not args.get("category_id") and not args.get("allow_uncategorized"):
        issues.append("category_id é obrigatório, a menos que allow_uncategorized seja true.")
    if args.get("subcategory_id") and not args.get("category_id"):
        issues.append("subcategory_id exige category_id.")
    if args.get("transaction_type") == "parcelled" and (args.get("installments") or 0) < 2:
        issues.append("Transações parceladas exigem installments >= 2.")
    payload = build_transaction_payload(args)
    return {
        "ready": not issues,
        "issues": issues,
        "payload": payload,
        "endpoint": "/v1/transactions",
        "method": "POST",
        "note": (
            "Nenhuma chamada de API foi feita. Se ready for true, chame "
            "despezzas_create_transaction com os mesmos campos e confirm:true."
        ),
    }


def build_transaction_payload(args: dict[str, Any]) -> dict[str, Any]:
    transaction_type = args.get("transaction_type", "unique")
    api_type = (
        "RECURRENT" if transaction_type == "recurring" else "PARCELLED" if transaction_type == "parcelled" else "FIXED"
    )
    return clean(
        {
            "title": args["title"],
            "description": (args["description"] if args.get("description") is not None else args["title"]),
            "amount": args["amount_cents"],
            "date": args["date"],
            "is_expense": args.get("kind", "expense") == "expense",
            "type": api_type,
            "frequency": args.get("frequency") or "MONTHLY",
            "installments": args.get("installments") if api_type == "PARCELLED" else 1,
            "is_full_amount": args.get("amount_mode", "per_installment") != "total"
            if api_type == "PARCELLED"
            else True,
            "account_id": args.get("account_id"),
            "credit_card_id": args.get("credit_card_id"),
            "category_id": args.get("category_id"),
            "subcategory_id": args.get("subcategory_id"),
            "paid": True if args.get("credit_card_id") else args.get("paid", True),
        }
    )


def prepare_update_transaction(args: dict[str, Any]) -> dict[str, Any]:
    transaction_id = args["id"]
    changes: dict[str, Any] = {}
    api_changes: dict[str, Any] = {}
    for public_name, api_name in UPDATE_FIELD_MAP.items():
        value = args.get(public_name, MISSING)
        if value is MISSING:
            continue
        if public_name == "description" and isinstance(value, str) and not value.strip():
            value = None
        changes[public_name] = value
        api_changes[api_name] = value == "expense" if public_name == "kind" else value

    scope = args.get("scope", MISSING)
    edition_date = args.get("edition_date", MISSING)
    issues: list[str] = []
    if not changes:
        issues.append("Informe pelo menos um campo de transação para editar.")
    if changes.get("account_id") and changes.get("credit_card_id"):
        issues.append("Informe account_id ou credit_card_id, não ambos.")
    return {
        "ready": not issues,
        "issues": issues,
        "id": transaction_id,
        "changes": changes,
        "api_changes": api_changes,
        "scope": "THIS" if scope is MISSING else scope,
        "edition_date": None if edition_date is MISSING else edition_date,
        "endpoint": f"/v1/transactions/{transaction_id}",
        "method": "PUT (merge seguro)",
    }


def compact_transaction(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict):
        return {"value": item}

    def nested(key: str) -> str | None:
        value = item.get(key)
        if not isinstance(value, dict) or not isinstance(value.get("name"), str):
            return None
        selected_id = item.get(f"{key}_id")
        nested_id = value.get("id")
        if f"{key}_id" in item and (selected_id is None or (nested_id is not None and selected_id != nested_id)):
            return None
        return value["name"]

    raw_date = item.get("date")
    internal_id = transaction_internal_id(item)
    external_id = transaction_external_id(item)
    editable_value = item.get("editable", item.get("is_editable"))
    editable = editable_value if isinstance(editable_value, bool) else internal_id is not None
    return {
        "profile_id": (item.get("profile_id") if isinstance(item.get("profile_id"), str) else None),
        **clean(
            {
                "id": internal_id,
                "external_id": external_id,
                "editable": editable,
                "editability_reason": (
                    string_value(item.get("editability_reason"))
                    or string_value(item.get("non_editable_reason"))
                    or (None if editable else "A API não informou um ID interno editável.")
                ),
                "date": raw_date[:10] if isinstance(raw_date, str) else None,
                "title": string_value(item.get("title")),
                "description": string_value(item.get("description")),
                "amount_cents": int(number_value(item.get("amount"))),
                "kind": "expense" if item.get("is_expense") is True else "income",
                "paid": item.get("paid") if isinstance(item.get("paid"), bool) else None,
                "type": string_value(item.get("type")),
                "frequency": string_value(item.get("frequency")),
                "installments": item.get("installments") if isinstance(item.get("installments"), int | float) else None,
                "installment_number": item.get("installment_number")
                if isinstance(item.get("installment_number"), int | float)
                else None,
                "is_full_amount": (
                    item.get("is_full_amount") if isinstance(item.get("is_full_amount"), bool) else None
                ),
                "account_id": string_value(item.get("account_id")),
                "account_name": nested("account"),
                "credit_card_id": string_value(item.get("credit_card_id")),
                "credit_card_name": nested("credit_card"),
                "category_id": string_value(item.get("category_id")),
                "category_name": nested("category"),
                "subcategory_id": string_value(item.get("subcategory_id")),
                "subcategory_name": nested("subcategory"),
            }
        ),
    }


def transaction_items(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    for key in ("transactions", "data", "results", "items"):
        child = value.get(key)
        if isinstance(child, list):
            return [item for item in child if isinstance(item, dict)]
    return []


def transaction_internal_id(item: dict[str, Any]) -> str | None:
    return (
        string_value(item.get("internal_id"))
        or string_value(item.get("id"))
        or string_value(item.get("transaction_id"))
    )


def transaction_external_id(item: dict[str, Any]) -> str | None:
    explicit = (
        string_value(item.get("external_id"))
        or string_value(item.get("external_transaction_id"))
        or string_value(item.get("provider_transaction_id"))
    )
    raw_id = string_value(item.get("id"))
    internal_id = string_value(item.get("internal_id"))
    if explicit:
        return explicit
    return raw_id if internal_id and raw_id != internal_id else None


def transaction_identifiers(item: dict[str, Any]) -> set[str]:
    fields = (
        "internal_id",
        "id",
        "transaction_id",
        "external_id",
        "external_transaction_id",
        "provider_transaction_id",
    )
    return {value for field in fields if (value := string_value(item.get(field)))}


def transfer_connection_identifiers(item: dict[str, Any]) -> set[str]:
    value = item.get("connected_transaction_id")
    if isinstance(value, str) and value:
        return {value}
    if isinstance(value, dict):
        return transaction_identifiers(value)
    return set()


def resolve_transfer_counterpart(items: list[dict[str, Any]], source: dict[str, Any]) -> dict[str, Any]:
    source_id = transaction_internal_id(source)
    source_ids = transaction_identifiers(source)
    source_connections = transfer_connection_identifiers(source)
    if not source_connections:
        return {
            "found": False,
            "reason": "A transferência não informa connected_transaction_id; a exclusão foi bloqueada.",
        }

    matches = []
    for candidate in items:
        candidate_id = transaction_internal_id(candidate)
        if candidate is source or (source_id and candidate_id == source_id):
            continue
        if candidate.get("type") != "TRANSFER" or not candidate_id:
            continue
        candidate_ids = transaction_identifiers(candidate)
        candidate_connections = transfer_connection_identifiers(candidate)
        modes = []
        if source_connections & candidate_ids:
            modes.append("connected_to_counterpart_id")
        if candidate_connections & source_ids:
            modes.append("counterpart_connected_to_source_id")
        if source_connections & candidate_connections:
            modes.append("shared_connection_id")
        if modes:
            matches.append(
                {
                    "transaction": candidate,
                    "id": candidate_id,
                    "match_modes": modes,
                }
            )

    if len(matches) == 1:
        return {"found": True, **matches[0]}
    if len(matches) > 1:
        return {
            "found": False,
            "reason": "Mais de uma contraparte possível foi encontrada; a exclusão foi bloqueada.",
            "candidate_ids": [match["id"] for match in matches],
        }
    return {
        "found": False,
        "reason": "A contraparte da transferência não pôde ser localizada para exclusão conjunta.",
    }


def locate_transaction(items: list[dict[str, Any]], requested_id: str) -> dict[str, Any]:
    for item in items:
        if transaction_internal_id(item) == requested_id:
            editable_value = item.get("editable", item.get("is_editable"))
            if editable_value is False:
                return {
                    "found": True,
                    "editable": False,
                    "id": requested_id,
                    "code": "TRANSACTION_NOT_EDITABLE",
                    "reason": (
                        string_value(item.get("editability_reason"))
                        or string_value(item.get("non_editable_reason"))
                        or "A API marcou esta transação como não editável."
                    ),
                }
            return {
                "found": True,
                "editable": True,
                "id": requested_id,
                "code": None,
                "transaction": item,
            }
    for item in items:
        if transaction_external_id(item) == requested_id:
            return {
                "found": True,
                "editable": False,
                "id": requested_id,
                "id_type": "external_id",
                "internal_id": transaction_internal_id(item),
                "code": "TRANSACTION_ID_MAPPING_ERROR",
                "reason": "Foi enviado um ID externo; use o campo id interno retornado pela busca.",
            }
    return {
        "found": False,
        "editable": False,
        "id": requested_id,
        "code": "TRANSACTION_NOT_FOUND",
        "reason": "A transação não existe no perfil ativo, foi excluída ou não está disponível para edição.",
    }


def transaction_api_snapshot(item: dict[str, Any]) -> dict[str, Any]:
    snapshot: dict[str, Any] = {}
    for key in TRANSACTION_FIELDS:
        if key in item:
            snapshot[key] = item[key]
    for relation in ("account", "credit_card", "category", "subcategory"):
        key = f"{relation}_id"
        nested = item.get(relation)
        if key not in snapshot and isinstance(nested, dict):
            nested_id = string_value(nested.get("id"))
            if nested_id:
                snapshot[key] = nested_id
    raw_date = snapshot.get("date")
    if isinstance(raw_date, str):
        snapshot["date"] = raw_date[:10]
    return snapshot


def build_update_plan(current: dict[str, Any], prepared: dict[str, Any]) -> dict[str, Any]:
    before_api = transaction_api_snapshot(current)
    issues = list(prepared["issues"])
    original_date = before_api.get("date")
    if not isinstance(original_date, str):
        issues.append("A transação atual não possui uma data válida para ancorar a edição.")

    after_api = {**before_api, **prepared["api_changes"]}
    if after_api.get("account_id") and after_api.get("credit_card_id"):
        issues.append("A transação resultante não pode ter account_id e credit_card_id ao mesmo tempo.")
    if after_api.get("subcategory_id") and not after_api.get("category_id"):
        issues.append("A transação resultante não pode ter subcategoria sem categoria.")

    scope = prepared["scope"]
    lookup_date = prepared["edition_date"] or original_date
    is_series = before_api.get("type") in {"PARCELLED", "RECURRENT"}
    payload = {**after_api}
    if is_series:
        payload.update(
            {
                "date": original_date,
                "edition_type": scope,
                "edition_date": after_api.get("date") or original_date,
            }
        )
    internal_id = transaction_internal_id(current)
    before = compact_transaction(current)
    merged_after = {**current, **after_api, "id": internal_id}
    for relation in ("account", "credit_card", "category", "subcategory"):
        id_field = f"{relation}_id"
        if id_field in prepared["api_changes"] and before_api.get(id_field) != after_api.get(id_field):
            merged_after.pop(relation, None)
            merged_after.pop(f"{relation}_name", None)
    after = compact_transaction(merged_after)
    requested_fields = list(prepared["changes"])
    changed_fields = [field for field in requested_fields if before.get(field) != after.get(field)]
    nullable_clear_fields = [field for field in changed_fields if after.get(field) is None]
    protected_fields = [
        "title",
        "description",
        "date",
        "amount_cents",
        "kind",
        "paid",
        "type",
        "frequency",
        "installment_number",
        "installments",
        "is_full_amount",
        "account_id",
        "credit_card_id",
        "category_id",
        "subcategory_id",
    ]
    preserved_fields = [field for field in protected_fields if field not in requested_fields]
    return {
        "ready": not issues,
        "issues": issues,
        "id": internal_id,
        "requested_id": prepared["id"],
        "scope": scope,
        "edition_date": lookup_date,
        "is_series": is_series,
        "before": before,
        "after": after,
        "requested_fields": requested_fields,
        "changed_fields": changed_fields,
        "nullable_clear_fields": nullable_clear_fields,
        "preserved_fields": preserved_fields,
        "payload": payload,
        "endpoint": f"/v1/transactions/{internal_id or prepared['id']}",
        "method": "PUT (merge seguro)",
    }


def public_update_plan(plan: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in plan.items() if key not in {"payload", "api_changes"}}


def validate_update_result(plan: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
    compact_actual = compact_transaction(actual)
    mismatches = []
    for field in plan["changed_fields"] + plan["preserved_fields"]:
        expected_source = plan["after"] if field in plan["changed_fields"] else plan["before"]
        expected = expected_source.get(field)
        received = compact_actual.get(field)
        if expected != received:
            mismatches.append({"field": field, "expected": expected, "received": received})
    persisted_fields = [
        field for field in plan["changed_fields"] if compact_actual.get(field) == plan["after"].get(field)
    ]
    failed_fields = [field for field in plan["changed_fields"] if field not in persisted_fields]
    null_clear_failed_fields = [field for field in failed_fields if plan["after"].get(field) is None]
    api_changed_fields = [
        field
        for field in plan["changed_fields"] + plan["preserved_fields"]
        if compact_actual.get(field) != plan["before"].get(field)
    ]
    unexpectedly_changed_fields = [field for field in plan["preserved_fields"] if field in api_changed_fields]
    return {
        "ok": not mismatches,
        "checked_changed_fields": plan["changed_fields"],
        "checked_preserved_fields": plan["preserved_fields"],
        "persisted_fields": persisted_fields,
        "failed_fields": failed_fields,
        "null_clear_failed_fields": null_clear_failed_fields,
        "api_changed_fields": api_changed_fields,
        "unexpectedly_changed_fields": unexpectedly_changed_fields,
        "mismatches": mismatches,
    }


def flatten_catalog(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    result = []
    for child in value.values():
        if isinstance(child, list):
            result.extend(item for item in child if isinstance(item, dict))
    return result


def category_pair_issue(category_id: str | None, subcategory_id: str | None, catalog: Any) -> str | None:
    if not subcategory_id:
        return None
    subcategory = next(
        (item for item in flatten_catalog(catalog) if string_value(item.get("id")) == subcategory_id),
        None,
    )
    if subcategory is None:
        return "A subcategoria informada não existe no catálogo do perfil ativo."
    parent_id = (
        string_value(subcategory.get("category_id"))
        or string_value(subcategory.get("parent_id"))
        or (string_value(subcategory["category"].get("id")) if isinstance(subcategory.get("category"), dict) else None)
    )
    if parent_id is None:
        return "A subcategoria informada não possui uma categoria associada no catálogo."
    if parent_id != category_id:
        return "A subcategoria informada não pertence à categoria selecionada."
    return None


def stable_sort_transactions(items: list[dict[str, Any]], order_by: str, order: str) -> list[dict[str, Any]]:
    def key(item: dict[str, Any]) -> tuple[Any, str, str]:
        if order_by == "amount":
            primary: Any = number_value(item.get("amount"))
        elif order_by == "title":
            primary = (string_value(item.get("title")) or "").lower()
        else:
            primary = string_value(item.get("date")) or ""
        return (
            primary,
            string_value(item.get("date")) or "",
            transaction_internal_id(item) or transaction_external_id(item) or "",
        )

    return sorted(items, key=key, reverse=order == "desc")


def cursor_fingerprint(filters: dict[str, Any]) -> str:
    serialized = json.dumps(filters, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(serialized.encode()).hexdigest()[:16]


def encode_cursor(offset: int, fingerprint: str) -> str:
    value = json.dumps({"offset": offset, "fingerprint": fingerprint}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def decode_cursor(cursor: str, fingerprint: str) -> int:
    try:
        padding = "=" * (-len(cursor) % 4)
        value = json.loads(base64.urlsafe_b64decode(cursor + padding))
        offset = value["offset"]
        if value["fingerprint"] != fingerprint or not isinstance(offset, int) or offset < 0:
            raise ValueError
        return offset
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ValueError("Cursor inválido ou incompatível com os filtros informados.") from error


def summarize_transactions(transactions: list[Any]) -> dict[str, Any]:
    expenses = revenues = paid = unpaid = 0
    categories: dict[str, dict[str, int]] = defaultdict(lambda: {"amount_cents": 0, "count": 0})
    for item in transactions:
        if not isinstance(item, dict):
            continue
        amount = int(number_value(item.get("amount")))
        if item.get("is_expense") is True:
            expenses += amount
        else:
            revenues += amount
        if item.get("paid") is True:
            paid += amount
        else:
            unpaid += amount
        category = item.get("category")
        name = category.get("name") if isinstance(category, dict) else item.get("category_id") or "sem categoria"
        categories[str(name)]["amount_cents"] += amount
        categories[str(name)]["count"] += 1
    top = sorted(
        ({"category": category, **values} for category, values in categories.items()),
        key=lambda item: item["amount_cents"],
        reverse=True,
    )
    return {
        "count": len(transactions),
        "totals": {
            "expenses_cents": expenses,
            "revenues_cents": revenues,
            "net_cents": revenues - expenses,
            "paid_cents": paid,
            "unpaid_cents": unpaid,
        },
        "top_categories": top[:10],
    }


def summarize_fields(transactions: list[Any]) -> dict[str, Any]:
    fields: dict[str, dict[str, Any]] = defaultdict(lambda: {"present_count": 0, "types": set()})

    def collect(value: dict[str, Any], prefix: str = "") -> None:
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else key
            fields[path]["present_count"] += 1
            fields[path]["types"].add(value_type(child))
            if isinstance(child, dict) and not prefix:
                collect(child, path)

    for item in transactions:
        if isinstance(item, dict):
            collect(item)
    return {
        "sampled_transactions": len(transactions),
        "fields": [
            {"name": name, "present_count": value["present_count"], "types": sorted(value["types"])}
            for name, value in sorted(fields.items())
        ],
    }


def value_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, list):
        return "array"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, dict):
        return "object"
    return "string" if isinstance(value, str) else type(value).__name__


def number_value(value: Any) -> int | float:
    return value if isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value) else 0


def string_value(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def normalize_profile_type(value: Any, *, personal: bool = False) -> str | None:
    if personal:
        return "personal"
    profile_type = string_value(value)
    return "family" if profile_type == "pf" else profile_type


def profile_context(profile: Any, access: Any) -> dict[str, Any]:
    profile = profile if isinstance(profile, dict) else {}
    access = access if isinstance(access, dict) else {}
    active_id = string_value(profile.get("current_profile_access_id"))
    active_role = string_value(profile.get("current_profile_role"))
    owners = [item for item in access.get("owner_profiles", []) if isinstance(item, dict)]
    members = [item for item in access.get("member_profiles", []) if isinstance(item, dict)]
    available = []
    for item, default_role in [*((item, "owner") for item in owners), *((item, "member") for item in members)]:
        item_id = string_value(item.get("id"))
        is_personal = item_id is None and default_role == "owner"
        available.append(
            {
                "id": item_id,
                **clean(
                    {
                        "name": string_value(item.get("name")),
                        "type": normalize_profile_type(item.get("type"), personal=is_personal),
                        "role": string_value(item.get("role")) or default_role,
                        "is_active": item_id == active_id,
                    }
                ),
            }
        )
    active = next((item for item in available if item["is_active"]), None) or {
        "id": active_id,
        **clean(
            {
                "name": "Perfil Principal" if active_id is None else None,
                "type": normalize_profile_type(None, personal=active_id is None),
                "role": active_role or ("owner" if active_id is None else None),
                "is_active": True,
            }
        ),
    }
    return {
        "active_profile": {
            **active,
            "role": active.get("role") or active_role,
            "is_personal_profile": active_id is None,
        },
        "available_profiles": available,
        "owner_profile_count": len(owners),
        "member_profile_count": len(members),
        "hint": (
            "Usando Perfil Principal. Ferramentas de conta, cartão e transação "
            "devem retornar dados financeiros pessoais."
            if active_id is None
            else (
                f'Usando perfil compartilhado "{active.get("name") or active_id}". Resultados vazios de '
                "contas/cartões/transações podem indicar que este perfil não tem dados; troque para "
                "profile_id:null para consultar o Perfil Principal."
            )
        ),
    }


def profile_warning(resource: str, count: int, context: dict[str, Any]) -> str | None:
    active = context.get("active_profile")
    if count or not isinstance(active, dict) or active.get("id") is None:
        return None
    labels = {"accounts": "contas", "credit_cards": "cartões de crédito", "transactions": "transações"}
    name = active.get("name") or active["id"]
    return (
        f'Nenhum resultado de {labels.get(resource, resource)} foi retornado para o perfil ativo "{name}". '
        "Use despezzas_switch_profile com profile_id:null e confirm:true se a intenção era consultar "
        "dados financeiros pessoais do Perfil Principal."
    )


def validate_profile_creation(access: Any, profile_type: str) -> str | None:
    profiles = access.get("owner_profiles", []) if isinstance(access, dict) else []
    extras = [item for item in profiles if isinstance(item, dict) and item.get("id") is not None]
    if len(extras) >= MAX_EXTRA_PROFILES:
        return f"O Despezzas permite no máximo {MAX_EXTRA_PROFILES} perfis extras."
    if any(normalize_profile_type(item.get("type")) == profile_type for item in extras):
        return f"Um perfil {profile_type} já existe. O Despezzas normalmente permite um perfil extra por tipo."
    return None


def search_diagnostics(
    transactions: list[Any],
    returned: list[Any],
    limit: int,
    filters: dict[str, Any],
) -> dict[str, Any]:
    field = filters.get("order_by") or "date"
    order = filters.get("order") or "desc"
    comparable = 0
    mismatch = None

    def sort_value(item: Any) -> Any:
        if not isinstance(item, dict):
            return None
        if field == "amount":
            return number_value(item.get("amount"))
        if field == "title":
            value = string_value(item.get("title"))
            return value.lower() if value else None
        return item.get("date")

    for index in range(1, len(returned)):
        previous, current = sort_value(returned[index - 1]), sort_value(returned[index])
        if previous is None or current is None:
            continue
        comparable += 1
        if (order == "asc" and previous > current) or (order == "desc" and previous < current):
            mismatch = index - 1
            break
    sort_check = {
        "field": field,
        "order": order,
        "ok": mismatch is None,
        "checked_pairs": comparable,
    }
    if mismatch is not None:
        sort_check["first_mismatch_index"] = mismatch
    return {
        "requested_limit": limit,
        "api_returned_count": len(transactions),
        "returned_count_after_limit": len(returned),
        "truncated_by_mcp_limit": len(transactions) > limit,
        "sort_check": sort_check,
        "note": (
            "O Despezzas retorna uma única lista para estes filtros; o MCP aplica limit localmente "
            "e informa has_more quando o limite oculta linhas."
        ),
    }
