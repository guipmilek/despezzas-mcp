from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import date, timedelta
from typing import Annotated, Any, Literal

from fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import BaseModel, ConfigDict, Field
from pydantic.experimental.missing_sentinel import MISSING

from .client import DespezzasClient, client
from .helpers import (
    MAX_EXTRA_PROFILES,
    api_error_diagnostic,
    attempt,
    build_update_plan,
    category_pair_issue,
    clean,
    compact_transaction,
    current_month_range,
    cursor_fingerprint,
    decode_cursor,
    encode_cursor,
    locate_transaction,
    prepare_create_transaction,
    prepare_update_transaction,
    profile_context,
    profile_warning,
    public_error,
    public_update_plan,
    redact,
    refusal,
    resolve_transfer_counterpart,
    search_diagnostics,
    stable_sort_transactions,
    summarize_fields,
    summarize_transactions,
    transaction_filters,
    transaction_internal_id,
    transaction_items,
    validate_profile_creation,
    validate_update_result,
)

DateString = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
Identifier = Annotated[str, Field(min_length=1)]
PositiveCents = Annotated[int, Field(gt=0)]
Scope = Literal["THIS", "THIS_AND_NEXT", "ALL"]
Frequency = Literal["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"]
Kind = Literal["expense", "income"]
TransactionType = Literal["unique", "recurring", "parcelled"]
JsonResponse = dict[str, Any] | list[Any] | None

READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
STATE_CHANGE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
CREATE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=False,
    openWorldHint=False,
)
UPDATE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=True,
    idempotentHint=True,
    openWorldHint=False,
)
DELETE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=True,
    idempotentHint=True,
    openWorldHint=False,
)
TOGGLE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=True,
    idempotentHint=False,
    openWorldHint=False,
)
ADVANCED_WRITE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=True,
    idempotentHint=False,
    openWorldHint=False,
)
TODAY = date.today().isoformat()
MAX_TRANSACTION_LOOKUP_HINTS = 5000
TRANSACTION_LOOKUP_HINTS: dict[str, dict[str, str]] = {}
TRANSACTION_LOOKUP_EARLIEST_YEAR = 1970
TRANSACTION_LOOKUP_RECENT_YEARS = 5
TRANSACTION_LOOKUP_FUTURE_YEARS = 20
RAW_CREDIT_CARD_LIMIT_WARNING = (
    "credit_card.available_limit em transações brutas pode estar desatualizado. "
    "Use despezzas_list_credit_cards como fonte confiável do limite disponível."
)


class ProfileInvite(BaseModel):
    email: Annotated[str, Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    role: Literal["editor", "viewer"] = "viewer"


class TransactionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier
    title: Annotated[str, Field(min_length=1)] | MISSING = MISSING
    description: str | None | MISSING = MISSING
    amount_cents: Annotated[int, Field(gt=0)] | MISSING = MISSING
    date: DateString | MISSING = MISSING
    kind: Kind | MISSING = MISSING
    account_id: Identifier | None | MISSING = MISSING
    credit_card_id: Identifier | None | MISSING = MISSING
    category_id: Identifier | None | MISSING = MISSING
    subcategory_id: Identifier | None | MISSING = MISSING
    paid: bool | MISSING = MISSING
    scope: Scope | MISSING = MISSING
    edition_date: DateString | MISSING = MISSING


def register_tools(mcp: FastMCP, api: DespezzasClient = client) -> None:
    global client
    client = api

    @mcp.tool(name="despezzas_status", title="Status do Despezzas MCP", annotations=READ_ONLY)
    async def despezzas_status() -> dict[str, Any]:
        """Verifica se o servidor tem credenciais ou token do Despezzas."""
        status = await client.auth_status()
        configured = bool(status["hasManualToken"] or status["hasEnvCredentials"] or status["hasSession"])
        context = await safe_profile_context() if configured else None
        return {
            "configured": configured,
            "auth": status,
            "profile_context": context,
            "login_url": None,
            "note": (
                "A autenticação do Despezzas está disponível."
                if configured
                else (
                    "Configure os secrets DESPEZZAS_TOKEN ou DESPEZZAS_EMAIL/"
                    "DESPEZZAS_PASSWORD/DESPEZZAS_FIREBASE_API_KEY."
                )
            ),
        }

    @mcp.tool(name="despezzas_profile", title="Obter Perfil do Despezzas", annotations=READ_ONLY)
    async def despezzas_profile() -> JsonResponse:
        """Busca o perfil autenticado. Campos sensíveis são mascarados."""
        return await attempt("obter perfil", client.get_profile())

    @mcp.tool(name="despezzas_list_profiles", title="Listar Perfis do Despezzas", annotations=READ_ONLY)
    async def despezzas_list_profiles() -> dict[str, Any]:
        """Lista perfis de proprietário e membro e informa o perfil ativo."""
        try:
            access, profile = await asyncio.gather(client.list_profile_access(), client.get_profile())
            context = profile_context(profile, access)
            return {
                "active_profile": context["active_profile"],
                "profiles": context["available_profiles"],
                "owner_profile_count": context["owner_profile_count"],
                "member_profile_count": context["member_profile_count"],
                "max_extra_profiles": MAX_EXTRA_PROFILES,
                "extra_profile_types": ["pj", "family", "investments"],
            }
        except Exception as error:
            return {"error": public_error(error), "action": "listar perfis"}

    @mcp.tool(name="despezzas_switch_profile", title="Trocar Perfil Ativo", annotations=STATE_CHANGE)
    async def despezzas_switch_profile(profile_id: str | None, confirm: bool = False) -> dict[str, Any]:
        """Troca o perfil ativo. Exige confirm=true."""
        if not confirm:
            return refusal("trocar o perfil ativo")
        try:
            await client.change_profile(profile_id)
            context = await safe_profile_context()
            active = context.get("active_profile") if isinstance(context, dict) else None
            return {
                "switched": True,
                "active_profile": active if isinstance(active, dict) else {"id": profile_id},
                "note": "Chamadas futuras usarão este contexto de perfil ativo.",
            }
        except Exception as error:
            return {"switched": False, "error": public_error(error), "action": "trocar perfil ativo"}

    @mcp.tool(name="despezzas_create_profile", title="Criar Perfil Compartilhado", annotations=CREATE)
    async def despezzas_create_profile(
        name: Annotated[str, Field(min_length=1, max_length=60)],
        type: Literal["pj", "family", "investments"],
        invites: Annotated[list[ProfileInvite], Field(max_length=5)] | None = None,
        confirm: bool = False,
    ) -> JsonResponse:
        """Cria um perfil extra PJ, família ou investimentos. Exige confirm=true."""
        if not confirm:
            return refusal("criar um perfil compartilhado")
        access = await client.list_profile_access()
        issue = validate_profile_creation(access, type)
        if issue:
            return {"error": issue, "action": "criar perfil compartilhado"}
        payload = {"name": name.strip(), "type": type, "invites": normalize_invites(invites)}
        return await attempt("criar perfil compartilhado", client.create_access_profile(payload))

    @mcp.tool(name="despezzas_update_profile_access", title="Editar Perfil Compartilhado", annotations=UPDATE)
    async def despezzas_update_profile_access(
        id: Identifier,
        name: Annotated[str, Field(min_length=1, max_length=60)] | None = None,
        type: Literal["pj", "family", "investments"] | None = None,
        invites: Annotated[list[ProfileInvite], Field(max_length=5)] | None = None,
        confirm: bool = False,
    ) -> JsonResponse:
        """Edita perfil compartilhado; invites substitui a lista atual. Exige confirm=true."""
        if not confirm:
            return refusal("editar um perfil compartilhado")
        payload = clean(
            {
                "name": name.strip() if name else None,
                "type": type,
                "invites": normalize_invites(invites) if invites is not None else None,
            }
        )
        if not payload:
            return {
                "error": "Informe pelo menos um dos campos name, type ou invites.",
                "action": "editar perfil compartilhado",
            }
        return await attempt("editar perfil compartilhado", client.update_access_profile(id, payload))

    @mcp.tool(name="despezzas_delete_profile", title="Excluir Perfil Compartilhado", annotations=DELETE)
    async def despezzas_delete_profile(id: Identifier, confirm: bool = False) -> dict[str, Any]:
        """Exclui um perfil compartilhado próprio. Exige confirm=true."""
        if not confirm:
            return refusal("excluir um perfil compartilhado")
        result = await attempt("excluir perfil compartilhado", client.delete_access_profile(id))
        return result if isinstance(result, dict) and "error" in result else {"deleted": True, "id": id}

    @mcp.tool(name="despezzas_leave_profile", title="Sair de Perfil Compartilhado", annotations=DELETE)
    async def despezzas_leave_profile(profile_id: Identifier, confirm: bool = False) -> JsonResponse:
        """Valida o vínculo e sai de um perfil em que a conta é membro. Exige confirm=true."""
        if not confirm:
            return refusal("sair de um perfil compartilhado")
        try:
            before = await client.list_profile_access()
        except Exception as error:
            return {
                "status": "failed_lookup",
                "left": False,
                "api_called": False,
                "profile_id": profile_id,
                "error": public_error(error),
            }
        if locate_member_profile(before, profile_id) is None:
            return {
                "status": "not_found",
                "left": False,
                "api_called": False,
                "profile_id": profile_id,
                "error": "O perfil não existe entre os vínculos de membro da conta ativa.",
            }
        try:
            await client.leave_access_profile(profile_id)
        except Exception as error:
            return {
                "status": "failed_request",
                "left": False,
                "api_called": True,
                "api_accepted": False,
                "profile_id": profile_id,
                "error": public_error(error),
            }
        try:
            after = await client.list_profile_access()
        except Exception as error:
            return {
                "status": "failed_validation",
                "left": None,
                "api_called": True,
                "api_accepted": True,
                "profile_id": profile_id,
                "validation": {
                    "ok": False,
                    "reason": f"O vínculo não pôde ser relido: {public_error(error)}",
                },
            }
        still_linked = locate_member_profile(after, profile_id) is not None
        return {
            "status": "failed_validation" if still_linked else "success",
            "left": not still_linked,
            "api_called": True,
            "api_accepted": True,
            "profile_id": profile_id,
            "validation": {
                "ok": not still_linked,
                "still_linked": still_linked,
            },
        }

    @mcp.tool(name="despezzas_personal_config", title="Obter Configuração Pessoal", annotations=READ_ONLY)
    async def despezzas_personal_config() -> JsonResponse:
        """Busca preferências de visibilidade financeira."""
        return await attempt("obter configuração pessoal", client.get_personal_config())

    @mcp.tool(name="despezzas_list_accounts", title="Listar Contas", annotations=READ_ONLY)
    async def despezzas_list_accounts() -> dict[str, Any]:
        """Lista contas e o contexto do perfil ativo."""
        try:
            accounts, context = await asyncio.gather(client.get_accounts(), safe_profile_context())
            items = accounts if isinstance(accounts, list) else []
            return {
                "profile_context": context,
                "count": len(items),
                "accounts": redact(items),
                "warning": profile_warning("accounts", len(items), context),
            }
        except Exception as error:
            return {"error": public_error(error), "action": "listar contas"}

    @mcp.tool(name="despezzas_list_banks", title="Listar Bancos/Logos de Conta", annotations=READ_ONLY)
    async def despezzas_list_banks() -> JsonResponse:
        """Lista opções de bancos e logos usadas em contas manuais."""
        return await attempt("listar bancos", client.get_banks())

    @mcp.tool(name="despezzas_create_account", title="Criar Conta Manual", annotations=CREATE)
    async def despezzas_create_account(
        name: Identifier,
        logo: Identifier,
        initial_balance_cents: int | None = None,
        include_total_balance: bool = True,
        confirm: bool = False,
    ) -> JsonResponse:
        """Cria conta manual. Exige confirm=true."""
        if not confirm:
            return refusal("criar uma conta")
        payload = clean(
            {
                "name": name,
                "logo": logo,
                "balance": initial_balance_cents,
                "include_total_balance": include_total_balance,
            }
        )
        return await attempt("criar conta", client.create_account(payload))

    @mcp.tool(name="despezzas_update_account", title="Editar Conta", annotations=UPDATE)
    async def despezzas_update_account(
        id: Identifier,
        name: Identifier | None = None,
        logo: Identifier | None = None,
        balance_cents: int | None = None,
        include_total_balance: bool | None = None,
        confirm: bool = False,
    ) -> JsonResponse:
        """Edita conta manual. Exige confirm=true."""
        if not confirm:
            return refusal("editar uma conta")
        payload = clean(
            {"name": name, "logo": logo, "balance": balance_cents, "include_total_balance": include_total_balance}
        )
        if not payload:
            return {"error": "Informe pelo menos um campo para editar.", "action": "editar conta"}
        return await execute_account_update(id, payload)

    @mcp.tool(name="despezzas_delete_account", title="Excluir Conta", annotations=DELETE)
    async def despezzas_delete_account(id: Identifier, confirm: bool = False) -> dict[str, Any]:
        """Exclui conta. Exige confirm=true."""
        if not confirm:
            return refusal("excluir uma conta")
        result = await attempt("excluir conta", client.delete_account(id))
        return result if isinstance(result, dict) and "error" in result else {"deleted": True, "id": id}

    @mcp.tool(name="despezzas_list_credit_cards", title="Listar Cartões de Crédito", annotations=READ_ONLY)
    async def despezzas_list_credit_cards() -> dict[str, Any]:
        """Lista cartões; é a fonte confiável para available_limit_cents."""
        try:
            cards, context = await asyncio.gather(client.get_credit_cards(), safe_profile_context())
            items = cards if isinstance(cards, list) else []
            return {
                "profile_context": context,
                "count": len(items),
                "credit_cards": redact(items),
                "warning": profile_warning("credit_cards", len(items), context),
            }
        except Exception as error:
            return {"error": public_error(error), "action": "listar cartões de crédito"}

    @mcp.tool(name="despezzas_create_credit_card", title="Criar Cartão de Crédito", annotations=CREATE)
    async def despezzas_create_credit_card(
        name: Identifier,
        logo: str | None = None,
        limit_cents: int | None = None,
        is_unlimited: bool | None = None,
        expiring_date: str | None = None,
        closing_date: str | None = None,
        account_id: Identifier | None = None,
        confirm: bool = False,
    ) -> JsonResponse:
        """Cria cartão manual. available_limit_cents é calculado e não é aceito. Exige confirm=true."""
        if not confirm:
            return refusal("criar um cartão de crédito")
        payload = clean(
            {
                "name": name,
                "logo": logo,
                "limit": limit_cents,
                "is_unlimited": is_unlimited,
                "expiring_date": expiring_date,
                "closing_date": closing_date,
                "account_id": account_id,
            }
        )
        return await execute_credit_card_create(payload)

    @mcp.tool(name="despezzas_update_credit_card", title="Editar Cartão de Crédito", annotations=UPDATE)
    async def despezzas_update_credit_card(
        id: Identifier,
        name: Identifier | None = None,
        logo: str | None = None,
        limit_cents: int | None = None,
        is_unlimited: bool | None = None,
        expiring_date: str | None = None,
        closing_date: str | None = None,
        account_id: Identifier | None = None,
        confirm: bool = False,
    ) -> JsonResponse:
        """Edita cartão manual. available_limit_cents é calculado e não é aceito. Exige confirm=true."""
        if not confirm:
            return refusal("editar um cartão de crédito")
        payload = clean(
            {
                "name": name,
                "logo": logo,
                "limit": limit_cents,
                "is_unlimited": is_unlimited,
                "expiring_date": expiring_date,
                "closing_date": closing_date,
                "account_id": account_id,
            }
        )
        if not payload:
            return {"error": "Informe pelo menos um campo para editar.", "action": "editar cartão de crédito"}
        return await execute_credit_card_update(id, payload)

    @mcp.tool(name="despezzas_delete_credit_card", title="Excluir Cartão de Crédito", annotations=DELETE)
    async def despezzas_delete_credit_card(id: Identifier, confirm: bool = False) -> dict[str, Any]:
        """Exclui cartão. Exige confirm=true."""
        if not confirm:
            return refusal("excluir um cartão de crédito")
        result = await attempt("excluir cartão de crédito", client.delete_credit_card(id))
        return result if isinstance(result, dict) and "error" in result else {"deleted": True, "id": id}

    @mcp.tool(name="despezzas_list_categories", title="Listar Categorias", annotations=READ_ONLY)
    async def despezzas_list_categories(include_user: bool = True) -> JsonResponse:
        """Lista categorias padrão e do usuário."""
        return await attempt("listar categorias", client.get_categories(include_user))

    @mcp.tool(name="despezzas_list_subcategories", title="Listar Subcategorias", annotations=READ_ONLY)
    async def despezzas_list_subcategories(include_user: bool = True) -> JsonResponse:
        """Lista subcategorias padrão e do usuário."""
        return await attempt("listar subcategorias", client.get_subcategories(include_user))

    register_transaction_tools(mcp)


def register_transaction_tools(mcp: FastMCP) -> None:
    @mcp.tool(name="despezzas_search_transactions", title="Buscar Transações", annotations=READ_ONLY)
    async def despezzas_search_transactions(
        date_start: DateString | None = None,
        date_end: DateString | None = None,
        account_type: Literal["bank_account", "credit_card"] | None = None,
        account_ids: list[Identifier] | None = None,
        credit_card_ids: list[Identifier] | None = None,
        category_ids: list[Identifier] | None = None,
        subcategory_ids: list[Identifier] | None = None,
        is_paid: bool | None = None,
        is_expense: bool | None = None,
        min_amount_cents: Annotated[int, Field(gt=0)] | None = None,
        search: str | None = None,
        order_by: Literal["date", "title", "amount"] = "date",
        order: Literal["asc", "desc"] = "desc",
        limit: Annotated[int, Field(ge=1, le=500)] = 100,
        offset: Annotated[int, Field(ge=0)] | None = None,
        cursor: str | None = None,
        include_raw: bool = False,
    ) -> dict[str, Any]:
        """Lista transações; limites de cartão brutos devem ser relidos em list_credit_cards."""
        start, end = current_month_range()
        filters = transaction_filters(
            date_start=date_start or start,
            date_end=date_end or end,
            account_type=account_type or "bank_account",
            account_ids=account_ids,
            credit_card_ids=credit_card_ids,
            category_ids=category_ids,
            subcategory_ids=subcategory_ids,
            is_paid=is_paid,
            is_expense=is_expense,
            min_amount_cents=min_amount_cents,
            search=search,
            order_by=order_by,
            order=order,
        )
        try:
            transactions, context = await asyncio.gather(client.get_transactions(filters), safe_profile_context())
            items = stable_sort_transactions(transaction_items(transactions), order_by, order)
            remember_transaction_lookup_hints(items)
            fingerprint = cursor_fingerprint(filters)
            if cursor and offset is not None:
                return {
                    "error": "Informe cursor ou offset, não ambos.",
                    "action": "buscar transações",
                }
            page_offset = decode_cursor(cursor, fingerprint) if cursor else offset or 0
            returned = items[page_offset : page_offset + limit]
            next_offset = page_offset + len(returned)
            has_more = next_offset < len(items)
            return {
                "profile_context": context,
                "filters": filters,
                "count": len(items),
                "total_count": len(items),
                "returned": len(returned),
                "offset": page_offset,
                "next_cursor": encode_cursor(next_offset, fingerprint) if has_more else None,
                "has_more": has_more,
                "diagnostics": search_diagnostics(items, returned, limit, filters),
                "transactions": redact(returned if include_raw else [compact_transaction(item) for item in returned]),
                "warning": profile_warning("transactions", len(items), context),
                "raw_data_warnings": (
                    [RAW_CREDIT_CARD_LIMIT_WARNING]
                    if include_raw and any(isinstance(item.get("credit_card"), dict) for item in returned)
                    else []
                ),
            }
        except ValueError as error:
            return {"error": str(error), "action": "buscar transações"}
        except Exception as error:
            return {"error": public_error(error), "action": "buscar transações"}

    @mcp.tool(name="despezzas_transaction_overview", title="Visão Geral de Transações", annotations=READ_ONLY)
    async def despezzas_transaction_overview(date: DateString = TODAY) -> JsonResponse:
        """Obtém totais e saldos para uma data."""
        return await attempt("obter visão geral de transações", client.get_overview(date))

    @mcp.tool(name="despezzas_finance_summary", title="Resumo Financeiro", annotations=READ_ONLY)
    async def despezzas_finance_summary(
        date_start: DateString | None = None,
        date_end: DateString | None = None,
        account_type: Literal["bank_account", "credit_card"] | None = None,
        include_transactions: bool = False,
        limit: Annotated[int, Field(ge=1, le=200)] = 50,
    ) -> dict[str, Any]:
        """Resume receitas, despesas, pagamentos e categorias; padrão mês atual."""
        start, end = current_month_range()
        filters = transaction_filters(
            date_start=date_start or start,
            date_end=date_end or end,
            account_type=account_type or "bank_account",
            order_by="amount",
            order="desc",
        )
        try:
            transactions, context = await asyncio.gather(client.get_transactions(filters), safe_profile_context())
            items = transactions if isinstance(transactions, list) else []
            return clean(
                {
                    "profile_context": context,
                    "filters": filters,
                    **summarize_transactions(items),
                    "transactions": [compact_transaction(item) for item in items[:limit]]
                    if include_transactions
                    else None,
                    "warning": profile_warning("transactions", len(items), context),
                }
            )
        except Exception as error:
            return {"error": public_error(error), "action": "resumir finanças"}

    @mcp.tool(name="despezzas_prepare_create_transaction", title="Preparar Criação de Transação", annotations=READ_ONLY)
    async def despezzas_prepare_create_transaction(
        title: Identifier,
        amount_cents: PositiveCents,
        date: DateString,
        description: str | None = None,
        kind: Kind = "expense",
        account_id: Identifier | None = None,
        credit_card_id: Identifier | None = None,
        category_id: Identifier | None = None,
        subcategory_id: Identifier | None = None,
        paid: Annotated[
            bool,
            Field(description="Em compras no cartão, o Despezzas sempre normaliza este campo para true."),
        ] = True,
        transaction_type: TransactionType = "unique",
        frequency: Frequency | None = None,
        installments: Annotated[int, Field(ge=1)] | None = None,
        amount_mode: Literal["per_installment", "total"] = "per_installment",
        allow_uncategorized: bool = False,
    ) -> dict[str, Any]:
        """Monta a criação; recorrências mensais nos dias 29-31 são bloqueadas por segurança."""
        return await prepare_create_transaction_plan(locals())

    @mcp.tool(name="despezzas_create_transaction", title="Criar Transação", annotations=CREATE)
    async def despezzas_create_transaction(
        title: Identifier,
        amount_cents: PositiveCents,
        date: DateString,
        description: str | None = None,
        kind: Kind = "expense",
        account_id: Identifier | None = None,
        credit_card_id: Identifier | None = None,
        category_id: Identifier | None = None,
        subcategory_id: Identifier | None = None,
        paid: Annotated[
            bool,
            Field(description="Em compras no cartão, o Despezzas sempre normaliza este campo para true."),
        ] = True,
        transaction_type: TransactionType = "unique",
        frequency: Frequency | None = None,
        installments: Annotated[int, Field(ge=1)] | None = None,
        amount_mode: Literal["per_installment", "total"] = "per_installment",
        allow_uncategorized: bool = False,
        confirm: bool = False,
    ) -> JsonResponse:
        """Cria transação; cartão força paid=true e recorrência mensal insegura é bloqueada."""
        if not confirm:
            return refusal("criar uma transação")
        prepared = await prepare_create_transaction_plan(locals())
        if not prepared["ready"]:
            return {"error": f"Payload não está pronto: {' '.join(prepared['issues'])}", "action": "criar transação"}
        transaction = await attempt("criar transação", client.create_transaction(prepared["payload"]))
        return (
            transaction
            if isinstance(transaction, dict) and "error" in transaction
            else {
                "created": True,
                "payload": prepared["payload"],
                "warnings": prepared["warnings"],
                "series_preview": prepared["series_preview"],
                "transaction": transaction,
            }
        )

    @mcp.tool(name="despezzas_prepare_update_transaction", title="Preparar Edição de Transação", annotations=READ_ONLY)
    async def despezzas_prepare_update_transaction(
        id: Identifier,
        title: Identifier | MISSING = MISSING,
        description: str | None | MISSING = MISSING,
        amount_cents: Annotated[int, Field(gt=0)] | MISSING = MISSING,
        date: DateString | MISSING = MISSING,
        kind: Kind | MISSING = MISSING,
        account_id: Identifier | None | MISSING = MISSING,
        credit_card_id: Identifier | None | MISSING = MISSING,
        category_id: Identifier | None | MISSING = MISSING,
        subcategory_id: Identifier | None | MISSING = MISSING,
        paid: bool | MISSING = MISSING,
        scope: Scope | MISSING = MISSING,
        edition_date: DateString | MISSING = MISSING,
    ) -> dict[str, Any]:
        """Lê o estado atual e mostra o diff seguro sem executar escrita."""
        plan = (await prepare_update_plans([locals()]))[0]
        return {
            "mode": "preview",
            **public_update_plan(plan),
            "note": "Apenas leituras foram realizadas; nenhuma atualização foi enviada à API.",
        }

    @mcp.tool(
        name="despezzas_prepare_batch_update_transactions",
        title="Preparar Edição de Transações em Lote",
        annotations=READ_ONLY,
    )
    async def despezzas_prepare_batch_update_transactions(
        updates: Annotated[list[TransactionUpdate], Field(min_length=1, max_length=50)],
    ) -> dict[str, Any]:
        """Lê o estado atual e mostra diffs de até 50 edições sem escrever."""
        arguments = [update.model_dump(exclude_unset=True) for update in updates]
        plans = await prepare_update_plans(arguments)
        return {
            "mode": "preview",
            "total": len(plans),
            "ready_count": sum(bool(plan["ready"]) for plan in plans),
            "all_ready": all(bool(plan["ready"]) for plan in plans),
            "preview": [{"index": index, **public_update_plan(plan)} for index, plan in enumerate(plans)],
            "note": "Apenas leituras foram realizadas; nenhuma atualização foi enviada à API.",
        }

    @mcp.tool(name="despezzas_update_transaction", title="Editar Transação", annotations=UPDATE)
    async def despezzas_update_transaction(
        id: Identifier,
        title: Identifier | MISSING = MISSING,
        description: str | None | MISSING = MISSING,
        amount_cents: Annotated[int, Field(gt=0)] | MISSING = MISSING,
        date: DateString | MISSING = MISSING,
        kind: Kind | MISSING = MISSING,
        account_id: Identifier | None | MISSING = MISSING,
        credit_card_id: Identifier | None | MISSING = MISSING,
        category_id: Identifier | None | MISSING = MISSING,
        subcategory_id: Identifier | None | MISSING = MISSING,
        paid: bool | MISSING = MISSING,
        scope: Scope | MISSING = MISSING,
        edition_date: DateString | MISSING = MISSING,
        confirm: bool = False,
    ) -> JsonResponse:
        """Edita uma transação com merge e validação posterior. Exige confirm=true."""
        if not confirm:
            return refusal("editar uma transação")
        plan = (await prepare_update_plans([locals()]))[0]
        if not plan["ready"]:
            return {
                "mode": "blocked",
                "updated": False,
                **public_update_plan(plan),
                "error": f"Edição bloqueada: {' '.join(plan['issues'])}",
            }
        return await execute_update_plan(plan)

    @mcp.tool(name="despezzas_batch_update_transactions", title="Editar Transações em Lote", annotations=UPDATE)
    async def despezzas_batch_update_transactions(
        updates: Annotated[list[TransactionUpdate], Field(min_length=1, max_length=50)],
        confirm: bool = False,
        stop_on_error: bool = True,
    ) -> dict[str, Any]:
        """Edita até 50 transações sequencialmente, com retry e validação. Exige confirm=true."""
        arguments = [update.model_dump(exclude_unset=True) for update in updates]
        if not confirm:
            return {
                "mode": "confirmation_required",
                "confirmed": False,
                "total": len(arguments),
                "requires_confirm": True,
                "requested_changes": [
                    {"index": index, **public_update_plan(prepare_update_transaction(arguments_item))}
                    for index, arguments_item in enumerate(arguments)
                ],
                "preview_tool": "despezzas_prepare_batch_update_transactions",
                "note": (
                    "Nenhuma chamada de API foi feita. Use a ferramenta de preparação para revisar "
                    "before/after e depois repita com confirm:true."
                ),
            }
        plans = await prepare_update_plans(arguments)
        ready_count = sum(bool(plan["ready"]) for plan in plans)
        if ready_count != len(plans):
            return {
                "mode": "blocked",
                "confirmed": True,
                "total": len(plans),
                "ready_count": ready_count,
                "all_ready": False,
                "preview": [{"index": index, **public_update_plan(plan)} for index, plan in enumerate(plans)],
                "updated_count": 0,
                "failed_count": len(plans) - ready_count,
                "not_attempted_count": ready_count,
                "note": "O lote foi bloqueado antes da primeira escrita porque nem todas as edições estão válidas.",
            }

        results = []
        stopped = False
        stopped_at_index = None
        stop_reason = None
        for index, plan in enumerate(plans):
            if stopped:
                results.append(
                    {
                        "index": index,
                        "id": plan.get("id") or plan.get("requested_id"),
                        "status": "not_attempted",
                        "ok": False,
                    }
                )
                continue
            try:
                value = await execute_update_plan(plan)
                ok = bool(value.get("ok"))
                results.append(
                    {
                        "index": index,
                        "id": plan["id"],
                        "status": value.get("status", "success" if ok else "failed"),
                        "ok": ok,
                        "result": value,
                    }
                )
            except Exception as error:
                results.append(
                    {
                        "index": index,
                        "id": plan["id"],
                        "status": "failed_request",
                        "ok": False,
                        "error": public_error(error),
                    }
                )
                if stop_on_error:
                    stopped = True
            if stop_on_error and results[-1]["ok"] is False:
                stopped = True
                stopped_at_index = index
                result_status = results[-1]["status"]
                stop_reason = {
                    "partially_updated": "partial_update_validation_failure",
                    "failed_validation": "validation_failure",
                }.get(result_status, "request_failure")
        success_count = sum(item["status"] == "success" for item in results)
        partial_success_count = sum(item["status"] == "partially_updated" for item in results)
        unchanged_count = sum(item["status"] == "unchanged" for item in results)
        failed_count = sum(
            item["status"] not in {"success", "partially_updated", "unchanged", "not_attempted"} for item in results
        )
        not_attempted_count = sum(item["status"] == "not_attempted" for item in results)
        attempted_count = len(results) - not_attempted_count
        api_called_count = sum(
            isinstance(item.get("result"), dict) and item["result"].get("api_called") is True for item in results
        )
        api_accepted_count = sum(
            isinstance(item.get("result"), dict) and item["result"].get("api_accepted") is True for item in results
        )
        api_updated_count = sum(
            isinstance(item.get("result"), dict) and item["result"].get("updated") is True for item in results
        )
        return {
            "mode": "executed",
            "confirmed": True,
            "total": len(plans),
            "ready_count": ready_count,
            "all_ready": True,
            "attempted_count": attempted_count,
            "api_called_count": api_called_count,
            "api_accepted_count": api_accepted_count,
            "updated_count": success_count + partial_success_count,
            "api_updated_count": api_updated_count,
            "success_count": success_count,
            "fully_updated_count": success_count,
            "partial_success_count": partial_success_count,
            "partially_updated_count": partial_success_count,
            "unchanged_count": unchanged_count,
            "failed_count": failed_count,
            "not_attempted_count": not_attempted_count,
            "stopped": stopped,
            "stopped_at_index": stopped_at_index,
            "stop_reason": stop_reason,
            "has_persisted_changes": api_updated_count > 0,
            "results": results,
            "note": "Execução concluída; itens interrompidos aparecem como not_attempted e podem ser retomados.",
        }

    @mcp.tool(
        name="despezzas_prepare_delete_transaction", title="Preparar Exclusão de Transação", annotations=READ_ONLY
    )
    async def despezzas_prepare_delete_transaction(
        id: Identifier,
        scope: Scope = "THIS",
        edition_date: DateString | None = None,
    ) -> dict[str, Any]:
        """Mostra alvo, contraparte de transferência e escopo sem excluir."""
        plan = await prepare_delete_transaction_plan(id, scope, edition_date)
        return {**plan, "note": "Apenas leituras foram realizadas; nenhuma exclusão foi enviada à API."}

    @mcp.tool(name="despezzas_delete_transaction", title="Excluir Transação", annotations=DELETE)
    async def despezzas_delete_transaction(
        id: Identifier,
        scope: Scope = "THIS",
        edition_date: DateString | None = None,
        confirm: bool = False,
    ) -> dict[str, Any]:
        """Exclui transação. Exige confirm=true."""
        if not confirm:
            return refusal("excluir uma transação")
        plan = await prepare_delete_transaction_plan(id, scope, edition_date)
        if not plan["ready"]:
            return {
                "status": "blocked",
                "deleted": False,
                **plan,
                "error": f"Exclusão bloqueada: {' '.join(plan['issues'])}",
            }
        return await execute_delete_transaction_plan(plan)

    @mcp.tool(name="despezzas_duplicate_transaction", title="Duplicar Transação", annotations=CREATE)
    async def despezzas_duplicate_transaction(id: Identifier, confirm: bool = False) -> JsonResponse:
        """Duplica transação. Exige confirm=true."""
        if not confirm:
            return refusal("duplicar uma transação")
        return await attempt("duplicar transação", client.duplicate_transaction(id))

    @mcp.tool(name="despezzas_toggle_transaction_paid", title="Alternar Pagamento da Transação", annotations=TOGGLE)
    async def despezzas_toggle_transaction_paid(
        id: Identifier,
        date: DateString = TODAY,
        confirm: bool = False,
    ) -> JsonResponse:
        """Alterna pagamento na data. Exige confirm=true."""
        if not confirm:
            return refusal("alternar status de pagamento da transação")
        return await attempt("alternar status de pagamento", client.toggle_paid(id, date))

    @mcp.tool(name="despezzas_create_transfer", title="Criar Transferência", annotations=CREATE)
    async def despezzas_create_transfer(
        amount_cents: PositiveCents,
        date: DateString,
        sent_account_id: Identifier,
        received_account_id: Identifier,
        paid: bool = True,
        title: str | None = None,
        description: str | None = None,
        confirm: bool = False,
    ) -> JsonResponse:
        """Cria transferência entre contas. Exige confirm=true."""
        if not confirm:
            return refusal("criar uma transferência")
        payload = clean(
            {
                "amount": amount_cents,
                "date": date,
                "sent_account_id": sent_account_id,
                "received_account_id": received_account_id,
                "paid": paid,
                "title": title,
                "description": description,
            }
        )
        return await attempt("criar transferência", client.create_transfer(payload))

    @mcp.tool(name="despezzas_export_transactions", title="Exportar Transações", annotations=READ_ONLY)
    async def despezzas_export_transactions(
        date_start: DateString,
        date_end: DateString,
        account_ids: list[Identifier] | None = None,
        credit_card_ids: list[Identifier] | None = None,
        count_only: bool = True,
        include_field_summary: bool = True,
        sample_limit: Annotated[int, Field(ge=1, le=50)] = 10,
    ) -> dict[str, Any]:
        """Conta e inspeciona campos; count_only=false chama o endpoint de exportação."""
        filters = transaction_filters(
            date_start=date_start, date_end=date_end, account_ids=account_ids, credit_card_ids=credit_card_ids
        )
        try:
            context, count_result, sample = await asyncio.gather(
                safe_profile_context(),
                client.count_exportable_transactions(filters),
                client.get_transactions(filters) if include_field_summary else async_value([]),
            )
            items = sample if isinstance(sample, list) else []
            result = {
                "profile_context": context,
                "filters": filters,
                "mode": "count_and_field_summary" if count_only else "export_endpoint",
                "export_count_result": count_result,
                "sample_count": len(items),
                "field_summary": summarize_fields(items) if include_field_summary else None,
                "sample_transactions": [compact_transaction(item) for item in items[:sample_limit]]
                if include_field_summary
                else None,
            }
            if not count_only:
                result["export_result"] = redact(await client.export_transactions(filters))
            return redact(clean(result))
        except Exception as error:
            return {"error": public_error(error), "action": "exportar transações"}

    @mcp.tool(name="despezzas_raw_api", title="Chamada Bruta à API Despezzas", annotations=ADVANCED_WRITE)
    async def despezzas_raw_api(
        path: Annotated[str, Field(pattern=r"^/v\d+/")],
        method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "GET",
        query: dict[str, Any] | None = None,
        body: Any = None,
        allow_destructive: bool = False,
        confirm: bool = False,
    ) -> JsonResponse:
        """Executa API bruta; limites de cartão aninhados podem estar desatualizados."""
        if method != "GET" and (not allow_destructive or not confirm):
            return {
                "error": (f"Recusando {method} {path} porque allow_destructive e confirm não foram true."),
                "action": f"{method} {path}",
            }
        return await attempt("chamar API bruta do Despezzas", client.request(path, method, body, query))


async def prepare_update_plans(arguments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    prepared_items = [prepare_update_transaction(item) for item in arguments]
    if not any(item["ready"] for item in prepared_items):
        return [
            {
                **prepared,
                "before": {},
                "after": {},
                "requested_fields": list(prepared["changes"]),
                "changed_fields": [],
                "preserved_fields": [],
            }
            for prepared in prepared_items
        ]

    try:
        items = transaction_items(await client.get_transactions())
        items = await expand_transaction_lookup(items, prepared_items)
    except Exception as error:
        issue = public_error(error)
        return [
            {
                **prepared,
                "ready": False,
                "issues": [*prepared["issues"], f"Não foi possível ler a transação atual: {issue}"],
                "before": {},
                "after": {},
                "requested_fields": list(prepared["changes"]),
                "changed_fields": [],
                "preserved_fields": [],
            }
            for prepared in prepared_items
        ]

    plans = []
    for prepared in prepared_items:
        if not prepared["ready"]:
            plans.append(
                {
                    **prepared,
                    "before": {},
                    "after": {},
                    "requested_fields": list(prepared["changes"]),
                    "changed_fields": [],
                    "preserved_fields": [],
                }
            )
            continue
        lookup = locate_transaction(items, prepared["id"])
        if not lookup["found"] or not lookup["editable"]:
            plans.append(
                {
                    **prepared,
                    "ready": False,
                    "issues": [*prepared["issues"], lookup["reason"]],
                    "lookup": {key: value for key, value in lookup.items() if key != "transaction"},
                    "before": {},
                    "after": {},
                    "requested_fields": list(prepared["changes"]),
                    "changed_fields": [],
                    "preserved_fields": [],
                }
            )
            continue
        plans.append(build_update_plan(lookup["transaction"], prepared))

    requires_catalog = any(
        plan["ready"]
        and plan["after"].get("subcategory_id")
        and {"category_id", "subcategory_id"} & set(plan["requested_fields"])
        for plan in plans
    )
    if requires_catalog:
        try:
            catalog = await client.get_subcategories(True)
            for plan in plans:
                if not plan["ready"]:
                    continue
                issue = category_pair_issue(
                    plan["after"].get("category_id"),
                    plan["after"].get("subcategory_id"),
                    catalog,
                )
                if issue:
                    plan["issues"].append(issue)
                    plan["ready"] = False
        except Exception as error:
            issue = f"Não foi possível validar categoria e subcategoria: {public_error(error)}"
            for plan in plans:
                if plan["ready"] and {"category_id", "subcategory_id"} & set(plan["requested_fields"]):
                    plan["issues"].append(issue)
                    plan["ready"] = False
    return plans


async def prepare_create_transaction_plan(arguments: dict[str, Any]) -> dict[str, Any]:
    prepared = prepare_create_transaction(arguments)
    category_id = prepared["payload"].get("category_id")
    subcategory_id = prepared["payload"].get("subcategory_id")
    if not prepared["ready"] or not subcategory_id:
        return prepared
    try:
        issue = category_pair_issue(category_id, subcategory_id, await client.get_subcategories(True))
    except Exception as error:
        issue = f"Não foi possível validar categoria e subcategoria: {public_error(error)}"
    if issue:
        prepared["issues"].append(issue)
        prepared["ready"] = False
    return prepared


def entity_items(value: Any, keys: tuple[str, ...]) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    for key in keys:
        child = value.get(key)
        if isinstance(child, list):
            return [item for item in child if isinstance(item, dict)]
    return []


def locate_member_profile(access: Any, profile_id: str) -> dict[str, Any] | None:
    members = entity_items(access, ("member_profiles",))
    return locate_entity(members, profile_id)


def locate_entity(items: list[dict[str, Any]], entity_id: str) -> dict[str, Any] | None:
    return next((item for item in items if item.get("id") == entity_id), None)


def compact_account(item: dict[str, Any]) -> dict[str, Any]:
    return clean(
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "logo": item.get("logo"),
            "balance_cents": item.get("balance"),
            "include_total_balance": item.get("include_total_balance"),
            "external_id": item.get("external_id"),
        }
    )


def compact_credit_card(item: dict[str, Any]) -> dict[str, Any]:
    return clean(
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "logo": item.get("logo"),
            "limit_cents": item.get("limit"),
            "available_limit_cents": item.get("available_limit"),
            "is_unlimited": item.get("is_unlimited"),
            "expiring_date": item.get("expiring_date"),
            "closing_date": item.get("closing_date"),
            "account_id": item.get("account_id"),
            "external_id": item.get("external_id"),
        }
    )


def validate_entity_update(
    before: dict[str, Any],
    actual: dict[str, Any],
    requested_api_fields: list[str],
    field_map: dict[str, str],
) -> dict[str, Any]:
    mismatches = []
    for api_field in requested_api_fields:
        public_field = field_map.get(api_field, api_field)
        expected = before.get(public_field)
        received = actual.get(public_field)
        if expected != received:
            mismatches.append({"field": public_field, "expected": expected, "received": received})
    return {
        "ok": not mismatches,
        "checked_fields": [field_map.get(key, key) for key in requested_api_fields],
        "mismatches": mismatches,
    }


async def execute_account_update(account_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    endpoint = f"/v1/accounts/{account_id}"
    try:
        current = locate_entity(entity_items(await client.get_accounts(), ("accounts", "data", "items")), account_id)
    except Exception as error:
        return {"status": "blocked", "updated": False, "api_called": False, "error": public_error(error)}
    if current is None:
        return {
            "status": "blocked",
            "updated": False,
            "api_called": False,
            "error": "A conta não existe no perfil ativo.",
        }

    before = compact_account(current)
    expected = compact_account({**current, **changes})
    changed_fields = [key for key in expected if key != "id" and before.get(key) != expected.get(key)]
    if not changed_fields:
        return {
            "status": "unchanged",
            "ok": True,
            "updated": False,
            "api_called": False,
            "id": account_id,
            "before": before,
            "after": expected,
            "changed_fields": [],
        }

    payload = {**current, **changes}
    try:
        response = await client.update_account(account_id, payload)
    except Exception as error:
        return {
            "status": "failed",
            "ok": False,
            "updated": False,
            "api_called": True,
            "api_accepted": False,
            "id": account_id,
            "error": public_error(error),
            "diagnostic": api_error_diagnostic(
                error,
                endpoint=endpoint,
                method="PUT",
                fields_sent=list(payload),
            ),
        }

    try:
        actual_raw = locate_entity(entity_items(await client.get_accounts(), ("accounts", "data", "items")), account_id)
    except Exception:
        actual_raw = None
    if actual_raw is None and isinstance(response, dict) and response.get("id") == account_id:
        actual_raw = response
    actual = compact_account(actual_raw or {})
    validation = validate_entity_update(expected, actual, changed_fields, {})
    return {
        "status": "success" if validation["ok"] else "failed_validation",
        "ok": validation["ok"],
        "updated": validation["ok"],
        "api_called": True,
        "api_accepted": True,
        "id": account_id,
        "before": before,
        "after": actual,
        "changed_fields": changed_fields,
        "validation": validation,
    }


async def execute_credit_card_update(card_id: str, changes: dict[str, Any]) -> dict[str, Any]:
    endpoint = f"/v1/credit-card/{card_id}"
    try:
        current = locate_entity(
            entity_items(await client.get_credit_cards(), ("credit_cards", "cards", "data", "items")),
            card_id,
        )
    except Exception as error:
        return {"status": "blocked", "updated": False, "api_called": False, "error": public_error(error)}
    if current is None:
        return {
            "status": "blocked",
            "updated": False,
            "api_called": False,
            "error": "O cartão não existe no perfil ativo.",
        }

    supported_fields = (
        "name",
        "logo",
        "limit",
        "is_unlimited",
        "expiring_date",
        "closing_date",
        "account_id",
    )
    payload = {key: changes.get(key, current.get(key)) for key in supported_fields}
    payload = clean(payload)
    before = compact_credit_card(current)
    expected = compact_credit_card({**current, **changes})
    field_map = {"limit": "limit_cents"}
    requested_fields = [field_map.get(key, key) for key in changes]
    changed_fields = [field for field in requested_fields if before.get(field) != expected.get(field)]
    if not changed_fields:
        return {
            "status": "unchanged",
            "ok": True,
            "updated": False,
            "api_called": False,
            "id": card_id,
            "before": before,
            "after": expected,
            "changed_fields": [],
        }

    try:
        response = await client.update_credit_card(card_id, payload)
    except Exception as error:
        return {
            "status": "failed",
            "ok": False,
            "updated": False,
            "api_called": True,
            "api_accepted": False,
            "id": card_id,
            "error": public_error(error),
            "diagnostic": api_error_diagnostic(
                error,
                endpoint=endpoint,
                method="PUT",
                fields_sent=list(payload),
            ),
        }

    try:
        actual_raw = locate_entity(
            entity_items(await client.get_credit_cards(), ("credit_cards", "cards", "data", "items")),
            card_id,
        )
    except Exception:
        actual_raw = None
    if actual_raw is None and isinstance(response, dict) and response.get("id") == card_id:
        actual_raw = response
    actual = compact_credit_card(actual_raw or {})
    validation = validate_entity_update(expected, actual, changed_fields, {})
    return {
        "status": "success" if validation["ok"] else "failed_validation",
        "ok": validation["ok"],
        "updated": validation["ok"],
        "api_called": True,
        "api_accepted": True,
        "id": card_id,
        "before": before,
        "after": actual,
        "changed_fields": changed_fields,
        "validation": validation,
    }


async def execute_credit_card_create(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        response = await client.create_credit_card(payload)
    except Exception as error:
        return {
            "status": "failed",
            "ok": False,
            "created": False,
            "api_called": True,
            "api_accepted": False,
            "error": public_error(error),
            "diagnostic": api_error_diagnostic(
                error,
                endpoint="/v1/credit-card",
                method="POST",
                fields_sent=list(payload),
            ),
        }

    response_card = response if isinstance(response, dict) and response.get("id") else None
    if response_card is None and isinstance(response, dict):
        for key in ("credit_card", "card", "data", "result"):
            child = response.get(key)
            if isinstance(child, dict) and child.get("id"):
                response_card = child
                break
    card_id = response_card.get("id") if isinstance(response_card, dict) else None
    actual_raw = None
    if isinstance(card_id, str):
        try:
            actual_raw = locate_entity(
                entity_items(await client.get_credit_cards(), ("credit_cards", "cards", "data", "items")),
                card_id,
            )
        except Exception:
            actual_raw = None
    actual_raw = actual_raw or response_card
    if not isinstance(actual_raw, dict):
        return {
            "status": "unverified",
            "ok": False,
            "created": False,
            "api_called": True,
            "api_accepted": True,
            "validation": {
                "ok": False,
                "reason": "A API aceitou a criação, mas o cartão não pôde ser identificado para releitura.",
            },
        }

    expected = compact_credit_card({**payload, "id": card_id})
    actual = compact_credit_card(actual_raw)
    field_map = {"limit": "limit_cents"}
    requested_fields = [field_map.get(key, key) for key in payload]
    validation = validate_entity_update(expected, actual, requested_fields, {})
    return {
        "status": "success" if validation["ok"] else "failed_validation",
        "ok": validation["ok"],
        "created": validation["ok"],
        "api_called": True,
        "api_accepted": True,
        "id": card_id,
        "credit_card": actual,
        "validation": validation,
    }


async def prepare_delete_transaction_plan(
    transaction_id: str,
    scope: Scope,
    edition_date: str | None,
) -> dict[str, Any]:
    try:
        prepared = [{"id": transaction_id, "ready": True, "edition_date": edition_date}]
        items = transaction_items(await client.get_transactions())
        items = await expand_transaction_lookup(items, prepared)
    except Exception as error:
        return {
            "ready": False,
            "issues": [f"Não foi possível localizar a transação: {public_error(error)}"],
            "id": transaction_id,
            "scope": scope,
            "affected_transactions": [],
        }

    lookup = locate_transaction(items, transaction_id)
    if not lookup["found"] or not lookup["editable"]:
        return {
            "ready": False,
            "issues": [lookup["reason"]],
            "id": transaction_id,
            "scope": scope,
            "affected_transactions": [],
        }

    transaction = lookup["transaction"]
    transaction_type = transaction.get("type")
    raw_date = transaction.get("date")
    lookup_date = raw_date[:10] if isinstance(raw_date, str) else edition_date
    targets = [{"id": transaction_id, "scope": scope, "edition_date": lookup_date}]
    issues: list[str] = []
    relationship_match: list[str] = []
    if transaction_type == "TRANSFER":
        counterpart = resolve_transfer_counterpart(items, transaction)
        if not counterpart["found"] and lookup_date:
            try:
                lookup_window = transaction_lookup_window(lookup_date)
                for account_type in ("bank_account", "credit_card"):
                    if lookup_window is None:
                        break
                    additions = transaction_items(
                        await client.get_transactions(
                            {
                                "account_type": account_type,
                                "date_start": lookup_window[0],
                                "date_end": lookup_window[1],
                            }
                        )
                    )
                    add_transaction_items(items, additions)
                counterpart = resolve_transfer_counterpart(items, transaction)
            except Exception:
                pass
        if not counterpart["found"]:
            issues.append(counterpart["reason"])
        else:
            connected_id = counterpart["id"]
            relationship_match = counterpart["match_modes"]
            targets = [
                {"id": transaction_id, "scope": "THIS", "edition_date": lookup_date},
                {"id": connected_id, "scope": "THIS", "edition_date": lookup_date},
            ]

    return {
        "ready": not issues,
        "issues": issues,
        "id": transaction_id,
        "scope": "THIS" if transaction_type == "TRANSFER" else scope,
        "transaction_type": transaction_type,
        "relationship_match": relationship_match,
        "affected_transactions": [target["id"] for target in targets],
        "targets": targets,
        "method": "DELETE",
        "body": {"type": "THIS" if transaction_type == "TRANSFER" else scope},
    }


async def execute_delete_transaction_plan(plan: dict[str, Any]) -> dict[str, Any]:
    results = []
    for target in plan["targets"]:
        try:
            await client.delete_transaction(target["id"], target["scope"])
            results.append({"id": target["id"], "status": "success", "api_called": True})
        except Exception as error:
            results.append(
                {
                    "id": target["id"],
                    "status": "failed",
                    "api_called": True,
                    "error": public_error(error),
                }
            )

    failed = [item for item in results if item["status"] == "failed"]
    remaining: list[str] = []
    validation_error = None
    try:
        prepared = [
            {"id": target["id"], "ready": True, "edition_date": target["edition_date"]} for target in plan["targets"]
        ]
        items = transaction_items(await client.get_transactions())
        items = await expand_transaction_lookup(items, prepared, allow_historical_scan=False)
        remaining = [target["id"] for target in plan["targets"] if locate_transaction(items, target["id"])["found"]]
    except Exception as error:
        validation_error = public_error(error)

    validation = {
        "ok": not failed and not remaining and validation_error is None,
        "remaining_transaction_ids": remaining,
        **({"reason": validation_error} if validation_error else {}),
    }
    status = "success" if validation["ok"] else "partial" if len(failed) < len(results) else "failed"
    return {
        "status": status,
        "ok": validation["ok"],
        "deleted": validation["ok"],
        "transaction_type": plan["transaction_type"],
        "affected_transactions": plan["affected_transactions"],
        "results": results,
        "validation": validation,
    }


async def execute_update_plan(plan: dict[str, Any]) -> dict[str, Any]:
    if not plan["changed_fields"]:
        return {
            "mode": "executed",
            "status": "unchanged",
            "ok": True,
            "updated": False,
            "api_called": False,
            "id": plan["id"],
            "before": plan["before"],
            "after": plan["after"],
            "changed_fields": [],
            "preserved_fields": plan["preserved_fields"],
            "validation": {
                "ok": True,
                "skipped": True,
                "reason": "Nenhuma alteração efetiva foi detectada; a API não foi chamada.",
            },
        }

    serialized = json.dumps(
        {"id": plan["id"], "payload": plan["payload"]},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    idempotency_key = f"despezzas-mcp-{hashlib.sha256(serialized.encode()).hexdigest()[:32]}"
    try:
        response = await client.update_transaction(plan["id"], plan["payload"], idempotency_key=idempotency_key)
    except Exception as error:
        status = getattr(error, "status", None)
        error_type = "transaction_not_found" if status == 404 else "rate_limited" if status == 429 else "api_error"
        return {
            "mode": "executed",
            "status": "failed_request",
            "ok": False,
            "updated": False,
            "api_called": True,
            "api_accepted": False,
            "id": plan["id"],
            "error_type": error_type,
            "error": public_error(error),
            "before": plan["before"],
            "after": plan["after"],
            "changed_fields": plan["changed_fields"],
        }

    result = {
        "mode": "executed",
        "status": "success",
        "ok": False,
        "updated": False,
        "api_called": True,
        "api_accepted": True,
        "id": plan["id"],
        "before": plan["before"],
        "after": plan["after"],
        "changed_fields": plan["changed_fields"],
        "preserved_fields": plan["preserved_fields"],
    }

    actual = await read_updated_transaction(
        plan["id"],
        response,
        lookup_date=plan["after"].get("date") or plan["edition_date"],
    )
    if actual is None:
        result.update(
            {
                "status": "failed_validation",
                "ok": False,
                "validation": {
                    "ok": False,
                    "mismatches": [],
                    "reason": "A escrita respondeu, mas a transação não pôde ser relida para validação.",
                },
            }
        )
        return result

    validation = validate_update_result(plan, actual)
    partially_updated = not validation["ok"] and bool(validation["api_changed_fields"])
    result.update(
        {
            "status": (
                "success" if validation["ok"] else "partially_updated" if partially_updated else "failed_validation"
            ),
            "ok": validation["ok"],
            "updated": validation["ok"] or partially_updated,
            "partially_updated": partially_updated,
            "persisted_fields": validation["persisted_fields"],
            "failed_fields": validation["failed_fields"],
            "null_clear_failed_fields": validation["null_clear_failed_fields"],
            "unexpectedly_changed_fields": validation["unexpectedly_changed_fields"],
            "transaction": compact_transaction(actual),
            "validation": validation,
        }
    )
    if validation["null_clear_failed_fields"]:
        result["error_type"] = "explicit_null_not_persisted"
    if partially_updated:
        result["retry"] = {
            "safe_to_retry_automatically": False,
            "remaining_fields": validation["failed_fields"],
            "instruction": (
                "Releia a transação e prepare uma nova atualização; não repita automaticamente o payload anterior."
            ),
        }
    return result


async def read_updated_transaction(
    transaction_id: str,
    response: Any = None,
    lookup_date: str | None = None,
) -> dict[str, Any] | None:
    try:
        items = transaction_items(await client.get_transactions())
        items = await expand_transaction_lookup(
            items,
            [
                {
                    "id": transaction_id,
                    "ready": True,
                    "edition_date": lookup_date,
                }
            ],
            allow_historical_scan=False,
        )
        lookup = locate_transaction(items, transaction_id)
        if lookup["found"] and lookup["editable"]:
            return lookup["transaction"]
    except Exception:
        pass
    if isinstance(response, dict):
        if any(key in response for key in ("id", "transaction_id", "title", "amount", "date")):
            return response
        for key in ("transaction", "data", "result"):
            child = response.get(key)
            if isinstance(child, dict):
                return child
    return None


async def expand_transaction_lookup(
    items: list[dict[str, Any]],
    prepared_items: list[dict[str, Any]],
    *,
    allow_historical_scan: bool = True,
) -> list[dict[str, Any]]:
    remember_transaction_lookup_hints(items)
    queries: list[dict[str, str]] = []
    for prepared in prepared_items:
        if not prepared["ready"] or locate_transaction(items, prepared["id"])["found"]:
            continue
        hint = TRANSACTION_LOOKUP_HINTS.get(prepared["id"], {})
        lookup_date = prepared.get("edition_date") or hint.get("date")
        if not lookup_date:
            continue
        lookup_window = transaction_lookup_window(lookup_date)
        if lookup_window is None:
            continue
        preferred_type = hint.get("account_type")
        account_types = ["bank_account", "credit_card"]
        if preferred_type == "credit_card":
            account_types.reverse()
        for account_type in account_types:
            query = {
                "account_type": account_type,
                "date_start": lookup_window[0],
                "date_end": lookup_window[1],
            }
            if query not in queries:
                queries.append(query)

    for query in queries:
        query_date = query["date_start"]
        has_unresolved_for_date = any(
            prepared["ready"]
            and not locate_transaction(items, prepared["id"])["found"]
            and (prepared.get("edition_date") or TRANSACTION_LOOKUP_HINTS.get(prepared["id"], {}).get("date"))
            == query_date
            for prepared in prepared_items
        )
        if not has_unresolved_for_date:
            continue
        try:
            add_transaction_items(items, transaction_items(await client.get_transactions(query)))
        except Exception:
            continue

    if allow_historical_scan:
        for date_start, date_end in transaction_lookup_ranges():
            for account_type in ("bank_account", "credit_card"):
                if not unresolved_transaction_ids(items, prepared_items):
                    break
                query = {
                    "account_type": account_type,
                    "date_start": date_start,
                    "date_end": date_end,
                }
                if query in queries:
                    continue
                try:
                    add_transaction_items(items, transaction_items(await client.get_transactions(query)))
                except Exception:
                    continue
            if not unresolved_transaction_ids(items, prepared_items):
                break

    remember_transaction_lookup_hints(items)
    return items


def transaction_lookup_window(value: str) -> tuple[str, str] | None:
    try:
        start = date.fromisoformat(value)
        end = start + timedelta(days=1)
    except (OverflowError, ValueError):
        return None
    return start.isoformat(), end.isoformat()


def transaction_lookup_ranges(today: date | None = None) -> list[tuple[str, str]]:
    current_year = (today or date.today()).year
    ranges = [(f"{current_year:04d}-01-01", f"{current_year + 1:04d}-01-01")]

    recent_start = max(TRANSACTION_LOOKUP_EARLIEST_YEAR, current_year - TRANSACTION_LOOKUP_RECENT_YEARS)
    if recent_start < current_year:
        ranges.append((f"{recent_start:04d}-01-01", f"{current_year:04d}-01-01"))
    if recent_start > TRANSACTION_LOOKUP_EARLIEST_YEAR:
        ranges.append((f"{TRANSACTION_LOOKUP_EARLIEST_YEAR:04d}-01-01", f"{recent_start:04d}-01-01"))

    future_end = current_year + TRANSACTION_LOOKUP_FUTURE_YEARS + 1
    ranges.append((f"{current_year + 1:04d}-01-01", f"{future_end:04d}-01-01"))
    return ranges


def unresolved_transaction_ids(
    items: list[dict[str, Any]],
    prepared_items: list[dict[str, Any]],
) -> set[str]:
    return {
        prepared["id"]
        for prepared in prepared_items
        if prepared["ready"] and not locate_transaction(items, prepared["id"])["found"]
    }


def add_transaction_items(items: list[dict[str, Any]], additions: list[dict[str, Any]]) -> None:
    known_ids = {transaction_internal_id(item) for item in items}
    for item in additions:
        item_id = transaction_internal_id(item)
        if item_id and item_id not in known_ids:
            items.append(item)
            known_ids.add(item_id)


def remember_transaction_lookup_hints(items: list[dict[str, Any]]) -> None:
    for item in items:
        transaction_id = transaction_internal_id(item)
        raw_date = item.get("date")
        if not transaction_id or not isinstance(raw_date, str):
            continue
        TRANSACTION_LOOKUP_HINTS.pop(transaction_id, None)
        TRANSACTION_LOOKUP_HINTS[transaction_id] = {
            "date": raw_date[:10],
            "account_type": "credit_card" if item.get("credit_card_id") else "bank_account",
        }
    while len(TRANSACTION_LOOKUP_HINTS) > MAX_TRANSACTION_LOOKUP_HINTS:
        TRANSACTION_LOOKUP_HINTS.pop(next(iter(TRANSACTION_LOOKUP_HINTS)))


async def safe_profile_context() -> dict[str, Any]:
    try:
        profile, access = await asyncio.gather(client.get_profile(), client.list_profile_access())
        return profile_context(profile, access)
    except Exception as error:
        return {"error": f"Não foi possível carregar o contexto do perfil ativo: {public_error(error)}"}


def normalize_invites(invites: list[ProfileInvite] | None) -> list[dict[str, str]]:
    return [{"email": invite.email.strip().lower(), "role": invite.role} for invite in (invites or [])]


async def async_value(value: Any) -> Any:
    return value
