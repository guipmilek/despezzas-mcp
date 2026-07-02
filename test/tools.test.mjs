import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { __test } from "../dist/tools.js";

describe("transaction create preparation", () => {
  it("builds the frontend-aligned default payload for a ready bank transaction", () => {
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

  it("refuses ambiguous or uncategorized create payloads by default", () => {
    const prepared = __test.prepareCreateTransaction({
      title: "Bad create",
      amount_cents: 100,
      date: "2026-07-01",
      kind: "expense",
      account_id: "account-1",
      credit_card_id: "card-1",
      subcategory_id: "subcategory-1",
    });

    assert.equal(prepared.ready, false);
    assert.deepEqual(prepared.issues, [
      "Provide either account_id or credit_card_id, not both.",
      "category_id is required unless allow_uncategorized is true.",
      "subcategory_id requires category_id.",
    ]);
  });

  it("requires at least two installments for parcelled transactions", () => {
    const prepared = __test.prepareCreateTransaction({
      title: "Parcelled",
      amount_cents: 100,
      date: "2026-07-01",
      kind: "expense",
      credit_card_id: "card-1",
      category_id: "category-1",
      transaction_type: "parcelled",
      installments: 1,
    });

    assert.equal(prepared.ready, false);
    assert.ok(prepared.issues.includes("Parcelled transactions require installments >= 2."));
  });

  it("marks total parcelled amounts distinctly from per-installment amounts", () => {
    const prepared = __test.prepareCreateTransaction({
      title: "Parcelled total",
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

describe("transaction update preparation", () => {
  it("builds scoped update payloads without guessing untouched fields", () => {
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

  it("refuses empty and mixed account/card updates", () => {
    const empty = __test.prepareUpdateTransaction("tx-1", undefined, undefined, undefined, undefined, {});
    assert.equal(empty.ready, false);
    assert.deepEqual(empty.issues, ["Provide at least one transaction field to update."]);

    const mixed = __test.prepareUpdateTransaction("tx-1", undefined, undefined, undefined, undefined, {
      account_id: "account-1",
      credit_card_id: "card-1",
    });
    assert.equal(mixed.ready, false);
    assert.deepEqual(mixed.issues, ["Provide either account_id or credit_card_id, not both."]);
  });
});

describe("transaction search diagnostics", () => {
  it("reports local truncation and successful date sort checks", () => {
    const transactions = [
      { id: "1", date: "2026-07-03T00:00:00.000Z", amount: 300, title: "C" },
      { id: "2", date: "2026-07-02T00:00:00.000Z", amount: 200, title: "B" },
      { id: "3", date: "2026-07-01T00:00:00.000Z", amount: 100, title: "A" },
    ];
    const returned = transactions.slice(0, 2);

    assert.deepEqual(__test.transactionSearchDiagnostics(transactions, returned, 2, { order_by: "date", order: "desc" }), {
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
      note:
        "Despezzas currently returns a single matching list for these filters; this MCP applies limit locally and reports has_more/truncated_by_mcp_limit when the local limit hides rows.",
    });
  });

  it("detects sort mismatches", () => {
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

describe("export and profile helpers", () => {
  it("summarizes nested transaction fields without returning full exports", () => {
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

  it("normalizes profile context and warns on empty shared-profile collections", () => {
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
    assert.match(context.hint, /Using shared profile/);
    assert.equal(
      __test.emptyProfileWarning("transactions", 0, context),
      'No transactions were returned for active profile "Familia". Use despezzas_switch_profile with profile_id:null and confirm:true if you intended to query Perfil Principal personal finance data.',
    );
  });

  it("omits empty filter strings and maps min_amount_cents to Despezzas value", () => {
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
