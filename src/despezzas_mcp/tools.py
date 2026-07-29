from __future__ import annotations

import asyncio
from datetime import date
from typing import Annotated, Any, Literal

from fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import BaseModel, ConfigDict, Field

from .client import DespezzasClient, client
from .helpers import (
    MAX_EXTRA_PROFILES,
    attempt,
    clean,
    compact_transaction,
    current_month_range,
    prepare_create_transaction,
    prepare_update_transaction,
    profile_context,
    profile_warning,
    redact,
    refusal,
    search_diagnostics,
    summarize_fields,
    summarize_transactions,
    transaction_filters,
    validate_profile_creation,
)

DateString = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]
Identifier = Annotated[str, Field(min_length=1)]
PositiveCents = Annotated[int, Field(gt=0)]
Scope = Literal["THIS", "THIS_AND_NEXT", "ALL"]
Frequency = Literal["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"]
Kind = Literal["expense", "income"]
TransactionType = Literal["unique", "recurring", "parcelled"]

READ_ONLY = ToolAnnotations(readOnlyHint=True)
WRITE = ToolAnnotations(readOnlyHint=False, destructiveHint=True)
TODAY = date.today().isoformat()


class ProfileInvite(BaseModel):
    email: Annotated[str, Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    role: Literal["editor", "viewer"] = "viewer"


class TransactionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Identifier
    title: Annotated[str, Field(min_length=1)] | None = None
    description: str | None = None
    amount_cents: Annotated[int, Field(gt=0)] | None = None
    date: DateString | None = None
    kind: Kind | None = None
    account_id: Identifier | None = None
    credit_card_id: Identifier | None = None
    category_id: Identifier | None = None
    subcategory_id: Identifier | None = None
    paid: bool | None = None
    scope: Scope | None = None
    edition_date: DateString | None = None


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
    async def despezzas_profile() -> Any:
        """Busca o perfil autenticado. Campos sensíveis são mascarados."""
        return await attempt("obter perfil", client.get_profile())

    @mcp.tool(name="despezzas_list_profiles", title="Listar Perfis do Despezzas", annotations=READ_ONLY)
    async def despezzas_list_profiles() -> dict[str, Any]:
        """Lista perfis de proprietário e membro e informa o perfil ativo."""
        try:
            access, profile = await asyncio.gather(client.list_profile_access(), client.get_profile())
            return redact(
                {
                    "profile_context": profile_context(profile, access),
                    "max_extra_profiles": MAX_EXTRA_PROFILES,
                    "extra_profile_types": ["pj", "family", "investments"],
                    **(access if isinstance(access, dict) else {"data": access}),
                }
            )
        except Exception as error:
            return {"error": str(error), "action": "listar perfis"}

    @mcp.tool(name="despezzas_switch_profile", title="Trocar Perfil Ativo", annotations=WRITE)
    async def despezzas_switch_profile(profile_id: str | None, confirm: bool = False) -> dict[str, Any]:
        """Troca o perfil ativo. Exige confirm=true."""
        if not confirm:
            return refusal("trocar o perfil ativo")
        result = await attempt("trocar perfil ativo", client.change_profile(profile_id))
        return {
            "switched": "error" not in result if isinstance(result, dict) else True,
            "active_profile_id": profile_id,
            "result": result,
            "note": "Chamadas futuras usarão este contexto de perfil ativo.",
        }

    @mcp.tool(name="despezzas_create_profile", title="Criar Perfil Compartilhado", annotations=WRITE)
    async def despezzas_create_profile(
        name: Annotated[str, Field(min_length=1, max_length=60)],
        type: Literal["pj", "family", "investments"],
        invites: Annotated[list[ProfileInvite], Field(max_length=5)] | None = None,
        confirm: bool = False,
    ) -> Any:
        """Cria um perfil extra PJ, família ou investimentos. Exige confirm=true."""
        if not confirm:
            return refusal("criar um perfil compartilhado")
        access = await client.list_profile_access()
        issue = validate_profile_creation(access, type)
        if issue:
            return {"error": issue, "action": "criar perfil compartilhado"}
        payload = {"name": name.strip(), "type": type, "invites": normalize_invites(invites)}
        return await attempt("criar perfil compartilhado", client.create_access_profile(payload))

    @mcp.tool(name="despezzas_update_profile_access", title="Editar Perfil Compartilhado", annotations=WRITE)
    async def despezzas_update_profile_access(
        id: Identifier,
        name: Annotated[str, Field(min_length=1, max_length=60)] | None = None,
        type: Literal["pj", "family", "investments"] | None = None,
        invites: Annotated[list[ProfileInvite], Field(max_length=5)] | None = None,
        confirm: bool = False,
    ) -> Any:
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

    @mcp.tool(name="despezzas_delete_profile", title="Excluir Perfil Compartilhado", annotations=WRITE)
    async def despezzas_delete_profile(id: Identifier, confirm: bool = False) -> dict[str, Any]:
        """Exclui um perfil compartilhado próprio. Exige confirm=true."""
        if not confirm:
            return refusal("excluir um perfil compartilhado")
        result = await attempt("excluir perfil compartilhado", client.delete_access_profile(id))
        return result if isinstance(result, dict) and "error" in result else {"deleted": True, "id": id}

    @mcp.tool(name="despezzas_leave_profile", title="Sair de Perfil Compartilhado", annotations=WRITE)
    async def despezzas_leave_profile(profile_id: Identifier, confirm: bool = False) -> Any:
        """Sai de um perfil em que a conta é membro. Exige confirm=true."""
        if not confirm:
            return refusal("sair de um perfil compartilhado")
        return await attempt("sair de perfil compartilhado", client.leave_access_profile(profile_id))

    @mcp.tool(name="despezzas_personal_config", title="Obter Configuração Pessoal", annotations=READ_ONLY)
    async def despezzas_personal_config() -> Any:
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
            return {"error": str(error), "action": "listar contas"}

    @mcp.tool(name="despezzas_list_banks", title="Listar Bancos/Logos de Conta", annotations=READ_ONLY)
    async def despezzas_list_banks() -> Any:
        """Lista opções de bancos e logos usadas em contas manuais."""
        return await attempt("listar bancos", client.get_banks())

    @mcp.tool(name="despezzas_create_account", title="Criar Conta Manual", annotations=WRITE)
    async def despezzas_create_account(
        name: Identifier,
        logo: Identifier,
        initial_balance_cents: int | None = None,
        include_total_balance: bool = True,
        confirm: bool = False,
    ) -> Any:
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

    @mcp.tool(name="despezzas_update_account", title="Editar Conta", annotations=WRITE)
    async def despezzas_update_account(
        id: Identifier,
        name: Identifier | None = None,
        logo: Identifier | None = None,
        balance_cents: int | None = None,
        include_total_balance: bool | None = None,
        confirm: bool = False,
    ) -> Any:
        """Edita conta manual. Exige confirm=true."""
        if not confirm:
            return refusal("editar uma conta")
        payload = clean(
            {"name": name, "logo": logo, "balance": balance_cents, "include_total_balance": include_total_balance}
        )
        return await attempt("editar conta", client.update_account(id, payload))

    @mcp.tool(name="despezzas_delete_account", title="Excluir Conta", annotations=WRITE)
    async def despezzas_delete_account(id: Identifier, confirm: bool = False) -> dict[str, Any]:
        """Exclui conta. Exige confirm=true."""
        if not confirm:
            return refusal("excluir uma conta")
        result = await attempt("excluir conta", client.delete_account(id))
        return result if isinstance(result, dict) and "error" in result else {"deleted": True, "id": id}

    @mcp.tool(name="despezzas_list_credit_cards", title="Listar Cartões de Crédito", annotations=READ_ONLY)
    async def despezzas_list_credit_cards() -> dict[str, Any]:
        """Lista cartões e o contexto do perfil ativo."""
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
            return {"error": str(error), "action": "listar cartões de crédito"}

    @mcp.tool(name="despezzas_create_credit_card", title="Criar Cartão de Crédito", annotations=WRITE)
    async def despezzas_create_credit_card(
        name: Identifier,
        logo: str | None = None,
        limit_cents: int | None = None,
        available_limit_cents: int | None = None,
        is_unlimited: bool | None = None,
        expiring_date: str | None = None,
        closing_date: str | None = None,
        account_id: Identifier | None = None,
        confirm: bool = False,
    ) -> Any:
        """Cria cartão manual. Exige confirm=true."""
        if not confirm:
            return refusal("criar um cartão de crédito")
        payload = clean(
            {
                "name": name,
                "logo": logo,
                "limit": limit_cents,
                "available_limit": available_limit_cents,
                "is_unlimited": is_unlimited,
                "expiring_date": expiring_date,
                "closing_date": closing_date,
                "account_id": account_id,
            }
        )
        return await attempt("criar cartão de crédito", client.create_credit_card(payload))

    @mcp.tool(name="despezzas_update_credit_card", title="Editar Cartão de Crédito", annotations=WRITE)
    async def despezzas_update_credit_card(
        id: Identifier,
        name: Identifier | None = None,
        logo: str | None = None,
        limit_cents: int | None = None,
        available_limit_cents: int | None = None,
        is_unlimited: bool | None = None,
        expiring_date: str | None = None,
        closing_date: str | None = None,
        account_id: Identifier | None = None,
        confirm: bool = False,
    ) -> Any:
        """Edita cartão manual. Exige confirm=true."""
        if not confirm:
            return refusal("editar um cartão de crédito")
        payload = clean(
            {
                "name": name,
                "logo": logo,
                "limit": limit_cents,
                "available_limit": available_limit_cents,
                "is_unlimited": is_unlimited,
                "expiring_date": expiring_date,
                "closing_date": closing_date,
                "account_id": account_id,
            }
        )
        return await attempt("editar cartão de crédito", client.update_credit_card(id, payload))

    @mcp.tool(name="despezzas_delete_credit_card", title="Excluir Cartão de Crédito", annotations=WRITE)
    async def despezzas_delete_credit_card(id: Identifier, confirm: bool = False) -> dict[str, Any]:
        """Exclui cartão. Exige confirm=true."""
        if not confirm:
            return refusal("excluir um cartão de crédito")
        result = await attempt("excluir cartão de crédito", client.delete_credit_card(id))
        return result if isinstance(result, dict) and "error" in result else {"deleted": True, "id": id}

    @mcp.tool(name="despezzas_list_categories", title="Listar Categorias", annotations=READ_ONLY)
    async def despezzas_list_categories(include_user: bool = True) -> Any:
        """Lista categorias padrão e do usuário."""
        return await attempt("listar categorias", client.get_categories(include_user))

    @mcp.tool(name="despezzas_list_subcategories", title="Listar Subcategorias", annotations=READ_ONLY)
    async def despezzas_list_subcategories(include_user: bool = True) -> Any:
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
        include_raw: bool = False,
    ) -> dict[str, Any]:
        """Lista transações filtradas; por padrão usa o mês atual e contas bancárias."""
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
            items = transactions if isinstance(transactions, list) else []
            returned = items[:limit]
            return {
                "profile_context": context,
                "filters": filters,
                "count": len(items),
                "returned": len(returned),
                "has_more": len(items) > limit,
                "diagnostics": search_diagnostics(items, returned, limit, filters),
                "transactions": redact(returned if include_raw else [compact_transaction(item) for item in returned]),
                "warning": profile_warning("transactions", len(items), context),
            }
        except Exception as error:
            return {"error": str(error), "action": "buscar transações"}

    @mcp.tool(name="despezzas_transaction_overview", title="Visão Geral de Transações", annotations=READ_ONLY)
    async def despezzas_transaction_overview(date: DateString = TODAY) -> Any:
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
            return {"error": str(error), "action": "resumir finanças"}

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
        paid: bool = True,
        transaction_type: TransactionType = "unique",
        frequency: Frequency | None = None,
        installments: Annotated[int, Field(ge=1)] | None = None,
        amount_mode: Literal["per_installment", "total"] = "per_installment",
        allow_uncategorized: bool = False,
    ) -> dict[str, Any]:
        """Monta e valida uma transação sem chamar a API."""
        return prepare_create_transaction(locals())

    @mcp.tool(name="despezzas_create_transaction", title="Criar Transação", annotations=WRITE)
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
        paid: bool = True,
        transaction_type: TransactionType = "unique",
        frequency: Frequency | None = None,
        installments: Annotated[int, Field(ge=1)] | None = None,
        amount_mode: Literal["per_installment", "total"] = "per_installment",
        allow_uncategorized: bool = False,
        confirm: bool = False,
    ) -> Any:
        """Cria transação. Exige confirm=true e recomenda prepare primeiro."""
        if not confirm:
            return refusal("criar uma transação")
        prepared = prepare_create_transaction(locals())
        if not prepared["ready"]:
            return {"error": f"Payload não está pronto: {' '.join(prepared['issues'])}", "action": "criar transação"}
        transaction = await attempt("criar transação", client.create_transaction(prepared["payload"]))
        return (
            transaction
            if isinstance(transaction, dict) and "error" in transaction
            else {"created": True, "payload": prepared["payload"], "transaction": transaction}
        )

    @mcp.tool(name="despezzas_prepare_update_transaction", title="Preparar Edição de Transação", annotations=READ_ONLY)
    async def despezzas_prepare_update_transaction(
        id: Identifier,
        title: Identifier | None = None,
        description: str | None = None,
        amount_cents: Annotated[int, Field(gt=0)] | None = None,
        date: DateString | None = None,
        kind: Kind | None = None,
        account_id: Identifier | None = None,
        credit_card_id: Identifier | None = None,
        category_id: Identifier | None = None,
        subcategory_id: Identifier | None = None,
        paid: bool | None = None,
        scope: Scope | None = None,
        edition_date: DateString | None = None,
    ) -> dict[str, Any]:
        """Monta e valida uma edição sem chamar a API."""
        return prepare_update_transaction(locals())

    @mcp.tool(name="despezzas_update_transaction", title="Editar Transação", annotations=WRITE)
    async def despezzas_update_transaction(
        id: Identifier,
        title: Identifier | None = None,
        description: str | None = None,
        amount_cents: Annotated[int, Field(gt=0)] | None = None,
        date: DateString | None = None,
        kind: Kind | None = None,
        account_id: Identifier | None = None,
        credit_card_id: Identifier | None = None,
        category_id: Identifier | None = None,
        subcategory_id: Identifier | None = None,
        paid: bool | None = None,
        scope: Scope | None = None,
        edition_date: DateString | None = None,
        confirm: bool = False,
    ) -> Any:
        """Edita transação. Exige confirm=true."""
        if not confirm:
            return refusal("editar uma transação")
        prepared = prepare_update_transaction(locals())
        if not prepared["ready"]:
            return {"error": f"Payload não está pronto: {' '.join(prepared['issues'])}", "action": "editar transação"}
        transaction = await attempt("editar transação", client.update_transaction(id, prepared["payload"]))
        return (
            transaction
            if isinstance(transaction, dict) and "error" in transaction
            else {"updated": True, "id": id, "payload": prepared["payload"], "transaction": transaction}
        )

    @mcp.tool(name="despezzas_batch_update_transactions", title="Editar Transações em Lote", annotations=WRITE)
    async def despezzas_batch_update_transactions(
        updates: Annotated[list[TransactionUpdate], Field(min_length=1, max_length=50)],
        confirm: bool = False,
        stop_on_error: bool = True,
    ) -> dict[str, Any]:
        """Pré-visualiza ou edita até 50 transações. Exige confirm=true para escrever."""
        preview = []
        for index, update in enumerate(updates):
            preview.append({"index": index, **prepare_update_transaction(update.model_dump(exclude_none=True))})
        ready_count = sum(bool(item["ready"]) for item in preview)
        if not confirm or ready_count != len(preview):
            return {
                "confirmed": False,
                "total": len(preview),
                "ready_count": ready_count,
                "all_ready": ready_count == len(preview),
                "requires_confirm": True,
                "preview": preview,
                "note": "Nenhuma chamada de API foi feita. Revise os payloads e repita com confirm:true.",
            }
        results = []
        for item in preview:
            try:
                value = await client.update_transaction(item["id"], item["payload"])
                results.append(
                    {
                        "index": item["index"],
                        "id": item["id"],
                        "ok": True,
                        "payload": item["payload"],
                        "transaction": redact(value),
                    }
                )
            except Exception as error:
                results.append({"index": item["index"], "id": item["id"], "ok": False, "error": str(error)})
                if stop_on_error:
                    break
        return {
            "confirmed": True,
            "total": len(preview),
            "ready_count": ready_count,
            "all_ready": True,
            "preview": preview,
            "updated_count": sum(bool(item["ok"]) for item in results),
            "results": results,
            "note": "Edições concluídas; revise results para falhas.",
        }

    @mcp.tool(
        name="despezzas_prepare_delete_transaction", title="Preparar Exclusão de Transação", annotations=READ_ONLY
    )
    async def despezzas_prepare_delete_transaction(id: Identifier, scope: Scope = "THIS") -> dict[str, Any]:
        """Mostra alvo e escopo sem excluir."""
        return {
            "ready": True,
            "id": id,
            "scope": scope,
            "endpoint": f"/v1/transactions/{id}",
            "method": "DELETE",
            "body": {"type": scope},
            "note": "Nenhuma chamada de API foi feita.",
        }

    @mcp.tool(name="despezzas_delete_transaction", title="Excluir Transação", annotations=WRITE)
    async def despezzas_delete_transaction(
        id: Identifier, scope: Scope = "THIS", confirm: bool = False
    ) -> dict[str, Any]:
        """Exclui transação. Exige confirm=true."""
        if not confirm:
            return refusal("excluir uma transação")
        result = await attempt("excluir transação", client.delete_transaction(id, scope))
        return result if isinstance(result, dict) and "error" in result else {"deleted": True, "id": id, "scope": scope}

    @mcp.tool(name="despezzas_duplicate_transaction", title="Duplicar Transação", annotations=WRITE)
    async def despezzas_duplicate_transaction(id: Identifier, confirm: bool = False) -> Any:
        """Duplica transação. Exige confirm=true."""
        if not confirm:
            return refusal("duplicar uma transação")
        return await attempt("duplicar transação", client.duplicate_transaction(id))

    @mcp.tool(name="despezzas_toggle_transaction_paid", title="Alternar Pagamento da Transação", annotations=WRITE)
    async def despezzas_toggle_transaction_paid(
        id: Identifier,
        date: DateString = TODAY,
        confirm: bool = False,
    ) -> Any:
        """Alterna pagamento na data. Exige confirm=true."""
        if not confirm:
            return refusal("alternar status de pagamento da transação")
        return await attempt("alternar status de pagamento", client.toggle_paid(id, date))

    @mcp.tool(name="despezzas_create_transfer", title="Criar Transferência", annotations=WRITE)
    async def despezzas_create_transfer(
        amount_cents: PositiveCents,
        date: DateString,
        sent_account_id: Identifier,
        received_account_id: Identifier,
        paid: bool = True,
        title: str | None = None,
        description: str | None = None,
        confirm: bool = False,
    ) -> Any:
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
            return {"error": str(error), "action": "exportar transações"}

    @mcp.tool(name="despezzas_raw_api", title="Chamada Bruta à API Despezzas", annotations=WRITE)
    async def despezzas_raw_api(
        path: Annotated[str, Field(pattern=r"^/v\d+/")],
        method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "GET",
        query: dict[str, Any] | None = None,
        body: Any = None,
        allow_destructive: bool = False,
        confirm: bool = False,
    ) -> Any:
        """Executa GET bruto; outros métodos exigem allow_destructive=true e confirm=true."""
        if method != "GET" and (not allow_destructive or not confirm):
            return {
                "error": (f"Recusando {method} {path} porque allow_destructive e confirm não foram true."),
                "action": f"{method} {path}",
            }
        return await attempt("chamar API bruta do Despezzas", client.request(path, method, body, query))


async def safe_profile_context() -> dict[str, Any]:
    try:
        profile, access = await asyncio.gather(client.get_profile(), client.list_profile_access())
        return profile_context(profile, access)
    except Exception as error:
        return {"error": f"Não foi possível carregar o contexto do perfil ativo: {error}"}


def normalize_invites(invites: list[ProfileInvite] | None) -> list[dict[str, str]]:
    return [{"email": invite.email.strip().lower(), "role": invite.role} for invite in (invites or [])]


async def async_value(value: Any) -> Any:
    return value
