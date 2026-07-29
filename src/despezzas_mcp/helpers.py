from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Awaitable
from datetime import date
from typing import Any

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
    rest = {
        key: value
        for key, value in args.items()
        if key not in {"id", "amount_cents", "kind", "scope", "edition_date", "confirm"}
    }
    payload = clean(
        {
            **rest,
            "amount": args.get("amount_cents"),
            "is_expense": None if args.get("kind") is None else args["kind"] == "expense",
            "edition_type": args.get("scope"),
            "edition_date": args.get("edition_date") or args.get("date"),
        }
    )
    issues = []
    if not payload:
        issues.append("Informe pelo menos um campo de transação para editar.")
    if args.get("account_id") and args.get("credit_card_id"):
        issues.append("Informe account_id ou credit_card_id, não ambos.")
    return {
        "ready": not issues,
        "issues": issues,
        "id": transaction_id,
        "payload": payload,
        "endpoint": f"/v1/transactions/{transaction_id}",
        "method": "PUT",
        "note": (
            "Nenhuma chamada de API foi feita. Se ready for true, chame "
            "despezzas_update_transaction com os mesmos campos e confirm:true."
        ),
    }


def compact_transaction(item: Any) -> dict[str, Any]:
    if not isinstance(item, dict):
        return {"value": item}

    def nested(key: str) -> str | None:
        value = item.get(key)
        return value.get("name") if isinstance(value, dict) and isinstance(value.get("name"), str) else None

    raw_date = item.get("date")
    return {
        "profile_id": (item.get("profile_id") if isinstance(item.get("profile_id"), str) else None),
        **clean(
            {
                "id": string_value(item.get("id")),
                "date": raw_date[:10] if isinstance(raw_date, str) else None,
                "title": string_value(item.get("title")),
                "description": string_value(item.get("description")),
                "amount_cents": number_value(item.get("amount")),
                "kind": "expense" if item.get("is_expense") is True else "income",
                "paid": item.get("paid") if isinstance(item.get("paid"), bool) else None,
                "type": string_value(item.get("type")),
                "installments": item.get("installments") if isinstance(item.get("installments"), int | float) else None,
                "installment_number": item.get("installment_number")
                if isinstance(item.get("installment_number"), int | float)
                else None,
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


def summarize_transactions(transactions: list[Any]) -> dict[str, Any]:
    expenses = revenues = paid = unpaid = 0
    categories: dict[str, dict[str, int]] = defaultdict(lambda: {"amount_cents": 0, "count": 0})
    for item in transactions:
        if not isinstance(item, dict):
            continue
        amount = number_value(item.get("amount"))
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


def profile_context(profile: Any, access: Any) -> dict[str, Any]:
    profile = profile if isinstance(profile, dict) else {}
    access = access if isinstance(access, dict) else {}
    active_id = string_value(profile.get("current_profile_access_id"))
    active_role = string_value(profile.get("current_profile_role"))
    owners = [item for item in access.get("owner_profiles", []) if isinstance(item, dict)]
    members = [item for item in access.get("member_profiles", []) if isinstance(item, dict)]
    available = []
    for item in owners + members:
        item_id = string_value(item.get("id"))
        available.append(
            {
                "id": item_id,
                **clean(
                    {
                        "name": string_value(item.get("name")),
                        "type": string_value(item.get("type")),
                        "role": string_value(item.get("role")),
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
                "type": "pf" if active_id is None else None,
                "role": active_role,
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
    if any(item.get("type") == profile_type for item in extras):
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
