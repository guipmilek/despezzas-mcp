import type { AuthStatus } from "./auth.js";

interface LoginPageOptions {
  status?: AuthStatus;
  error?: string;
  success?: string;
  email?: string;
  action?: string;
  hidden?: Record<string, string | undefined>;
}

export function renderLoginPage(options: LoginPageOptions = {}): string {
  const email = escapeHtml(options.email ?? "");
  const action = escapeHtml(options.action ?? "/login");
  const hidden = Object.entries(options.hidden ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value ?? "")}" />`)
    .join("");
  const error = options.error ? `<p class="alert alert-error">${escapeHtml(options.error)}</p>` : "";
  const success = options.success ? `<p class="alert alert-success">${escapeHtml(options.success)}</p>` : "";
  const authDetails = options.status
    ? `<dl class="status">
        <div><dt>Session</dt><dd>${options.status.hasSession ? "Saved" : "Missing"}</dd></div>
        <div><dt>Refresh</dt><dd>${options.status.canRefresh ? "Available" : "Unavailable"}</dd></div>
        <div><dt>Expires</dt><dd>${escapeHtml(options.status.expiresAt ?? "Unknown")}</dd></div>
      </dl>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Entrar no Despezzas MCP</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f7f8fa;
        color: #111111;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        width: min(100%, 464px);
        border: 1px solid #dde2ea;
        border-radius: 8px;
        background: #ffffff;
        padding: 32px 24px;
        box-shadow: 0 1px 2px rgba(17, 24, 39, 0.04);
      }
      .mark {
        width: 48px;
        height: 48px;
        display: grid;
        place-items: center;
        border: 1px solid #dde2ea;
        border-radius: 8px;
        font-size: 24px;
        font-weight: 900;
        letter-spacing: 0;
        margin-bottom: 28px;
      }
      h1 {
        margin: 0;
        font-size: 24px;
        line-height: 1.2;
        letter-spacing: 0;
      }
      .subtitle {
        margin: 8px 0 28px;
        color: #68738a;
        line-height: 1.5;
      }
      label {
        display: block;
        font-size: 13px;
        font-weight: 700;
        margin: 16px 0 8px;
      }
      input {
        width: 100%;
        height: 54px;
        border: 2px solid #e1e6ee;
        border-radius: 27px;
        padding: 0 18px;
        font: inherit;
        outline: none;
      }
      input:focus { border-color: #111111; }
      button {
        width: 100%;
        height: 48px;
        margin-top: 24px;
        border: 0;
        border-radius: 24px;
        background: #171717;
        color: #ffffff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      button:hover { background: #000000; }
      .alert {
        border-radius: 8px;
        padding: 12px 14px;
        margin: 0 0 16px;
        font-size: 14px;
        line-height: 1.4;
      }
      .alert-error {
        background: #fff1f2;
        color: #9f1239;
      }
      .alert-success {
        background: #ecfdf5;
        color: #065f46;
      }
      .status {
        display: grid;
        gap: 8px;
        margin: 18px 0 0;
        color: #68738a;
        font-size: 13px;
      }
      .status div {
        display: flex;
        justify-content: space-between;
        gap: 16px;
      }
      .status dt { font-weight: 700; }
      .status dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
      .logout {
        display: inline-block;
        margin-top: 18px;
        color: #111111;
        font-size: 14px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">Z</div>
      <h1>Entrar no Despezzas</h1>
      <p class="subtitle">Efetue login para autorizar o MCP a acessar sua conta.</p>
      ${error}
      ${success}
      <form method="post" action="${action}" autocomplete="on">
        ${hidden}
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" value="${email}" placeholder="Insira seu e-mail" autocomplete="username" required />
        <label for="password">Senha</label>
        <input id="password" name="password" type="password" placeholder="Insira sua senha" autocomplete="current-password" required />
        <button type="submit">Entrar</button>
      </form>
      ${authDetails}
      <a class="logout" href="/logout">Sair desta sessão MCP</a>
    </main>
  </body>
</html>`;
}

export function renderLoginSuccessPage(status: AuthStatus): string {
  return renderLoginPage({
    status,
    success: "Login concluído. Você já pode voltar ao ChatGPT e chamar as ferramentas do Despezzas.",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
