import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { __test } from "../dist/tools.js";

describe("preparo de criação de transação", () => {
  it("monta o payload padrão alinhado ao frontend para uma transação bancária pronta", () => {
    const prepared = __test.prepareCreateTransaction({
      title: "MCP TEST",
      amount_cents: 1234,
      date: "2026-07-01",
      kind: "expense",
      account_id: "account-1",
      category_id: "category-1",
      subcategory_id: "subcategory-1",
      paid: true,
      transaction_type: "unique",
    });

    assert.equal(prepared.ready, true);
    assert.deepEqual(prepared.issues, []);
    assert.deepEqual(prepared.payload, {
      title: "MCP TEST",
      description: "MCP TEST",
      amount: 1234,
      date: "2026-07-01",
      is_expense: true,
      type: "FIXED",
      frequency: "MONTHLY",
      installments: 1,
      is_full_amount: true,
      account_id: "account-1",
      category_id: "category-1",
      subcategory_id: "subcategory-1",
      paid: true,
    });
  });

  it("recusa por padrão payloads de criação ambíguos ou sem categoria", () => {
    const prepared = __test.prepareCreateTransaction({
      title: "Criacao invalida",
      amount_cents: 100,
      date: "2026-07-01",
      kind: "expense",
      account_id: "account-1",
      credit_card_id: "card-1",
      subcategory_id: "subcategory-1",
    });

    assert.equal(prepared.ready, false);
    assert.deepEqual(prepared.issues, [
      "Informe account_id ou credit_card_id, não ambos.",
      "category_id é obrigatório, a menos que allow_uncategorized seja true.",
      "subcategory_id exige category_id.",
    ]);
  });

  it("exige pelo menos duas parcelas para transações parceladas", () => {
    const prepared = __test.prepareCreateTransaction({
      title: "Parcelada",
      amount_cents: 100,
      date: "2026-07-01",
      kind: "expense",
      credit_card_id: "card-1",
      category_id: "category-1",
      transaction_type: "parcelled",
      installments: 1,
    });

    assert.equal(prepared.ready, false);
    assert.ok(prepared.issues.includes("Transações parceladas exigem installments >= 2."));
  });

  it("diferencia valores totais parcelados de valores por parcela", () => {
    const prepared = __test.prepareCreateTransaction({
      title: "Parcelada total",
      amount_cents: 9000,
      date: "2026-07-01",
      kind: "expense",
      credit_card_id: "card-1",
      category_id: "category-1",
      transaction_type: "parcelled",
      installments: 3,
      amount_mode: "total",
    });

    assert.equal(prepared.ready, true);
    assert.equal(prepared.payload.type, "PARCELLED");
    assert.equal(prepared.payload.installments, 3);
    assert.equal(prepared.payload.is_full_amount, false);
    assert.equal(prepared.payload.paid, true);
  });
});

describe("preparo de edição de transação", () => {
  it("monta payloads de edição com escopo sem adivinhar campos não alterados", () => {
    const prepared = __test.prepareUpdateTransaction("tx-1", 4995, "expense", "THIS", undefined, {
      date: "2026-07-02",
      category_id: "category-2",
      subcategory_id: "subcategory-2",
    });

    assert.equal(prepared.ready, true);
    assert.deepEqual(prepared.payload, {
      date: "2026-07-02",
      category_id: "category-2",
      subcategory_id: "subcategory-2",
      amount: 4995,
      is_expense: true,
      edition_type: "THIS",
      edition_date: "2026-07-02",
    });
  });

  it("recusa edições vazias e misturadas entre conta/cartão", () => {
    const empty = __test.prepareUpdateTransaction("tx-1", undefined, undefined, undefined, undefined, {});
    assert.equal(empty.ready, false);
    assert.deepEqual(empty.issues, ["Informe pelo menos um campo de transação para editar."]);

    const mixed = __test.prepareUpdateTransaction("tx-1", undefined, undefined, undefined, undefined, {
      account_id: "account-1",
      credit_card_id: "card-1",
    });
    assert.equal(mixed.ready, false);
    assert.deepEqual(mixed.issues, ["Informe account_id ou credit_card_id, não ambos."]);
  });

  it("prepara edições de transação em lote com validação por item", () => {
    const batch = __test.prepareBatchUpdateTransactions([
      {
        id: "tx-1",
        amount_cents: 1500,
        kind: "expense",
        scope: "THIS",
        edition_date: "2026-07-02",
      },
      {
        id: "tx-2",
        account_id: "account-1",
        credit_card_id: "card-1",
      },
    ]);

    assert.equal(batch.length, 2);
    assert.equal(batch[0].index, 0);
    assert.equal(batch[0].ready, true);
    assert.deepEqual(batch[0].payload, {
      amount: 1500,
      is_expense: true,
      edition_type: "THIS",
      edition_date: "2026-07-02",
    });
    assert.equal(batch[1].index, 1);
    assert.equal(batch[1].ready, false);
    assert.deepEqual(batch[1].issues, ["Informe account_id ou credit_card_id, não ambos."]);
  });
});

describe("diagnósticos de busca de transações", () => {
  it("informa truncamento local e valida ordenação por data com sucesso", () => {
    const transactions = [
      { id: "1", date: "2026-07-03T00:00:00.000Z", amount: 300, title: "C" },
      { id: "2", date: "2026-07-02T00:00:00.000Z", amount: 200, title: "B" },
      { id: "3", date: "2026-07-01T00:00:00.000Z", amount: 100, title: "A" },
    ];
    const returned = transactions.slice(0, 2);

    assert.deepEqual(
      __test.transactionSearchDiagnostics(transactions, returned, 2, { order_by: "date", order: "desc" }),
      {
        requested_limit: 2,
        api_returned_count: 3,
        returned_count_after_limit: 2,
        truncated_by_mcp_limit: true,
        sort_check: {
          field: "date",
          order: "desc",
          ok: true,
          checked_pairs: 1,
        },
        note: "O Despezzas atualmente retorna uma única lista correspondente para esses filtros; este MCP aplica limit localmente e informa has_more/truncated_by_mcp_limit quando o limite local oculta linhas.",
      },
    );
  });

  it("detecta divergências de ordenação", () => {
    const diagnostics = __test.transactionSearchDiagnostics(
      [
        { id: "1", amount: 100 },
        { id: "2", amount: 300 },
      ],
      [
        { id: "1", amount: 100 },
        { id: "2", amount: 300 },
      ],
      10,
      { order_by: "amount", order: "desc" },
    );

    assert.deepEqual(diagnostics.sort_check, {
      field: "amount",
      order: "desc",
      ok: false,
      checked_pairs: 1,
      first_mismatch_index: 0,
    });
  });
});

describe("helpers de exportação e perfil", () => {
  it("resume campos aninhados de transação sem retornar exportações completas", () => {
    const summary = __test.summarizeFields([
      {
        id: "tx-1",
        amount: 100,
        paid: true,
        category: { id: "cat-1", name: "alimentacao" },
      },
      {
        id: "tx-2",
        amount: 200,
        category: null,
      },
    ]);

    assert.deepEqual(summary, {
      sampled_transactions: 2,
      fields: [
        { name: "amount", present_count: 2, types: ["number"] },
        { name: "category", present_count: 2, types: ["null", "object"] },
        { name: "category.id", present_count: 1, types: ["string"] },
        { name: "category.name", present_count: 1, types: ["string"] },
        { name: "id", present_count: 2, types: ["string"] },
        { name: "paid", present_count: 1, types: ["boolean"] },
      ],
    });
  });

  it("normaliza contexto de perfil e avisa em coleções vazias de perfil compartilhado", () => {
    const context = __test.profileContextFrom(
      { current_profile_access_id: "family-1", current_profile_role: "owner" },
      {
        owner_profiles: [{ id: "family-1", name: "Familia", type: "family", role: "owner" }],
        member_profiles: [],
      },
    );

    assert.equal(context.active_profile.id, "family-1");
    assert.equal(context.active_profile.name, "Familia");
    assert.equal(context.active_profile.is_personal_profile, false);
    assert.equal(context.owner_profile_count, 1);
    assert.match(context.hint, /Usando perfil compartilhado/);
    assert.equal(
      __test.emptyProfileWarning("transactions", 0, context),
      'Nenhum resultado de transações foi retornado para o perfil ativo "Familia". Use despezzas_switch_profile com profile_id:null e confirm:true se a intenção era consultar dados financeiros pessoais do Perfil Principal.',
    );
  });

  it("omite strings de filtro vazias e mapeia min_amount_cents para o value do Despezzas", () => {
    assert.deepEqual(
      __test.toTransactionFilters({
        account_type: "bank_account",
        search: "   ",
        min_amount_cents: 123,
        order_by: "date",
        order: "desc",
      }),
      {
        account_type: "bank_account",
        value: 123,
        order_by: "date",
        order: "desc",
      },
    );
  });
});
