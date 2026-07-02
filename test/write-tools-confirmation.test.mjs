import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServer } from "../dist/server.js";

const WRITE_TOOL_CASES = [
  ["despezzas_switch_profile", { profile_id: null }],
  ["despezzas_create_profile", { name: "Familia", type: "family" }],
  ["despezzas_update_profile_access", { id: "profile-1", name: "Familia" }],
  ["despezzas_delete_profile", { id: "profile-1" }],
  ["despezzas_leave_profile", { profile_id: "profile-1" }],
  ["despezzas_create_account", { name: "Conta", logo: "bank-logo", initial_balance_cents: 100 }],
  ["despezzas_update_account", { id: "account-1", name: "Conta" }],
  ["despezzas_delete_account", { id: "account-1" }],
  ["despezzas_create_credit_card", { name: "Cartao", limit_cents: 100000, closing_day: 1, due_day: 10 }],
  ["despezzas_update_credit_card", { id: "card-1", name: "Cartao" }],
  ["despezzas_delete_credit_card", { id: "card-1" }],
  [
    "despezzas_create_transaction",
    {
      title: "Teste",
      amount_cents: 100,
      date: "2026-07-01",
      kind: "expense",
      account_id: "account-1",
      category_id: "category-1",
    },
  ],
  ["despezzas_update_transaction", { id: "tx-1", amount_cents: 100, kind: "expense" }],
  ["despezzas_batch_update_transactions", { updates: [{ id: "tx-1", amount_cents: 100, kind: "expense" }] }],
  ["despezzas_delete_transaction", { id: "tx-1", scope: "THIS" }],
  ["despezzas_duplicate_transaction", { id: "tx-1" }],
  ["despezzas_toggle_transaction_paid", { id: "tx-1", date: "2026-07-01" }],
  [
    "despezzas_create_transfer",
    {
      amount_cents: 100,
      date: "2026-07-01",
      sent_account_id: "account-1",
      received_account_id: "account-2",
    },
  ],
];

describe("runtime write-tool confirmation guards", () => {
  it("registered write/destructive tools expose confirm and do not call the client without it", async () => {
    const calls = [];
    const server = createServer(fakeClient(calls));
    const tools = registeredTools(server);

    for (const [name, args] of WRITE_TOOL_CASES) {
      const tool = tools[name];
      assert.ok(tool, `${name} should be registered`);
      assert.ok(schemaKeys(tool.inputSchema).includes("confirm"), `${name} should expose confirm input`);

      const response = await tool.handler(args);

      if (name === "despezzas_batch_update_transactions") {
        assert.equal(response.structuredContent.requires_confirm, true, `${name} should require confirmation`);
      } else {
        assert.equal(response.isError, true, `${name} should refuse without confirm`);
        assert.equal(response.structuredContent.required_argument, "confirm", `${name} should name confirm`);
      }
    }

    assert.deepEqual(calls, [], "write tools must not call the API client before confirmation");
  });

  it("raw API non-GET calls are refused unless allow_destructive is true", async () => {
    const calls = [];
    const server = createServer(fakeClient(calls));
    const tool = registeredTools(server).despezzas_raw_api;

    assert.ok(tool, "despezzas_raw_api should be registered");
    assert.ok(schemaKeys(tool.inputSchema).includes("allow_destructive"));

    const response = await tool.handler({
      method: "POST",
      path: "/v1/transactions",
      body: { title: "Teste" },
    });

    assert.equal(response.isError, true);
    assert.match(response.structuredContent.error, /allow_destructive/);
    assert.deepEqual(calls, [], "raw API must not call the client before destructive confirmation");
  });
});

function registeredTools(server) {
  return server._registeredTools;
}

function schemaKeys(schema) {
  const shape = schema?.shape ?? schema?._def?.shape?.();
  return shape ? Object.keys(shape) : [];
}

function fakeClient(calls) {
  return new Proxy(
    {},
    {
      get(_target, property) {
        return (...args) => {
          calls.push({ method: String(property), args });
          throw new Error(`Unexpected fake client call: ${String(property)}`);
        };
      },
    },
  );
}
