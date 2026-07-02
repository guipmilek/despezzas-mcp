import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectHar, redact } from "../scripts/inspect-har.mjs";

describe("inspecao e redacao de HAR", () => {
  it("mascara credenciais, tokens e dados pessoais comuns", () => {
    const bearerToken = ["eyJhbGciOi", "fake_token_with", "dots_and-dashes"].join(".");
    const idToken = ["firebase", "id", "token", "secret"].join("-");
    const refreshToken = ["firebase", "refresh", "token", "secret"].join("-");
    const firebaseToken = ["custom", "firebase", "token", "secret"].join("-");
    const input = JSON.stringify({
      authorization: `Bearer ${bearerToken}`,
      idToken,
      refreshToken,
      firebase_token: firebaseToken,
      password: "senha-real",
      email: "user@example.com",
      subscription_token: "subscription-secret",
    });

    const output = redact(input);

    assert.doesNotMatch(output, new RegExp(bearerToken));
    assert.doesNotMatch(output, new RegExp(idToken));
    assert.doesNotMatch(output, new RegExp(refreshToken));
    assert.doesNotMatch(output, new RegExp(firebaseToken));
    assert.doesNotMatch(output, /senha-real/);
    assert.doesNotMatch(output, /user@example.com/);
    assert.doesNotMatch(output, /subscription-secret/);
    assert.match(output, /Bearer \[mascarado\]/);
  });

  it("retorna apenas chamadas para api.despezzas.com com corpo e resposta mascarados", () => {
    const firebaseToken = ["custom", "firebase", "token", "secret"].join("-");
    const lines = inspectHar({
      log: {
        entries: [
          {
            request: {
              method: "POST",
              url: "https://api.despezzas.com/v2/auth",
              postData: {
                text: '{"email":"user@example.com","password":"senha-real"}',
              },
            },
            response: {
              status: 200,
              content: {
                text: JSON.stringify({ firebase_token: firebaseToken }),
              },
            },
          },
          {
            request: {
              method: "GET",
              url: "https://example.com/not-despezzas",
            },
            response: {
              status: 200,
              content: {
                text: "ignored",
              },
            },
          },
        ],
      },
    });

    assert.equal(lines.length, 3);
    assert.equal(lines[0], "POST    200 /v2/auth");
    assert.match(lines[1], /"email":"\[mascarado\]"/);
    assert.match(lines[1], /"password":"\[mascarado\]"/);
    assert.match(lines[2], /"firebase_token":"\[mascarado\]"/);
    assert.doesNotMatch(lines.join("\n"), new RegExp(`example.com|senha-real|user@example.com|${firebaseToken}`));
  });
});
