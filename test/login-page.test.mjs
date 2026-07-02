import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderLoginPage } from "../dist/loginPage.js";

describe("página de login MCP", () => {
  it("mantém apenas os elementos necessários para autorização do MCP", () => {
    const html = renderLoginPage();

    assert.match(html, /Entre para autorizar o MCP do Despezzas/);
    assert.match(html, /Entrar e autorizar/);
    assert.doesNotMatch(html, /back-button/);
    assert.doesNotMatch(html, /rememberMe/);
    assert.doesNotMatch(html, /Não tem uma conta/);
    assert.doesNotMatch(html, /Esqueceu a senha/);
  });

  it("inclui tokens compatíveis com os temas claro e escuro do Despezzas", () => {
    const html = renderLoginPage();

    assert.match(html, /prefers-color-scheme: dark/);
    assert.match(html, /--background: #ffffff/);
    assert.match(html, /--background: #0b0f13/);
    assert.match(html, /--card: #161b22/);
    assert.match(html, /--input: #2a323c/);
  });
});
