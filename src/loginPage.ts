import type { AuthStatus } from "./auth.js";

interface LoginPageOptions {
  status?: AuthStatus;
  error?: string;
  success?: string;
  email?: string;
  action?: string;
  hidden?: Record<string, string | undefined>;
  ownerCodeRequired?: boolean;
  credentialsOptional?: boolean;
}

export function renderLoginPage(options: LoginPageOptions = {}): string {
  const email = escapeHtml(options.email ?? "");
  const action = escapeHtml(options.action ?? "/login");
  const credentialRequired = options.credentialsOptional ? "" : " required";
  const hidden = Object.entries(options.hidden ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value ?? "")}" />`)
    .join("");
  const ownerCode = options.ownerCodeRequired
    ? `<div class="field">
          <label for="owner_code">Código de acesso MCP</label>
          <input id="owner_code" name="owner_code" type="password" placeholder="Insira o código de acesso" autocomplete="one-time-code" required />
        </div>`
    : "";
  const error = options.error ? `<p class="alert alert-error">${escapeHtml(options.error)}</p>` : "";
  const success = options.success ? `<p class="alert alert-success">${escapeHtml(options.success)}</p>` : "";
  const authDetails =
    options.status && options.success
      ? `<dl class="status">
        <div><dt>Sessão</dt><dd>${options.status.hasSession ? "Salva" : "Ausente"}</dd></div>
        <div><dt>Refresh</dt><dd>${options.status.canRefresh ? "Disponível" : "Indisponível"}</dd></div>
        <div><dt>Expira em</dt><dd>${escapeHtml(options.status.expiresAt ?? "Desconhecido")}</dd></div>
      </dl>`
      : "";
  const logout =
    options.status?.hasSession && options.success ? `<a class="logout" href="/logout">Sair desta sessão MCP</a>` : "";
  const mcpDetails = authDetails || logout ? `<div class="mcp-details">${authDetails}${logout}</div>` : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Despezzas: controle financeiro grátis | Despezzas</title>
    <style>
      @font-face {
        font-family: "Plus Jakarta Sans";
        font-style: normal;
        font-weight: 200 800;
        font-display: swap;
        src: url("https://despezzas.com/_next/static/media/fba5a26ea33df6a3-s.p.0eehd8tgys7nv.woff2") format("woff2");
      }
      :root {
        color-scheme: light;
        font-family: "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #ffffff;
        color: #0a0a0a;
        --background: #ffffff;
        --foreground: #0a0a0a;
        --card: #ffffff;
        --muted-foreground: #6b7485;
        --border: #e7eaee;
        --input: #e7eaee;
        --ring: #0a0a0a;
        --primary: #171717;
        --primary-foreground: #fafafa;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          color-scheme: dark;
          --background: #0b0f13;
          --foreground: #fafafa;
          --card: #161b22;
          --muted-foreground: #9ca3b0;
          --border: #2a323c;
          --input: #2a323c;
          --ring: #d4d4d4;
          --primary: #fafafa;
          --primary-foreground: #171717;
        }
      }
      :root.dark,
      html.dark {
        color-scheme: dark;
        --background: #0b0f13;
        --foreground: #fafafa;
        --card: #161b22;
        --muted-foreground: #9ca3b0;
        --border: #2a323c;
        --input: #2a323c;
        --ring: #d4d4d4;
        --primary: #fafafa;
        --primary-foreground: #171717;
      }
      * { box-sizing: border-box; }
      body {
        height: 100vh;
        min-height: 100vh;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 64px 16px;
        background: var(--background);
        color: var(--foreground);
        font-family: "Plus Jakarta Sans", "Plus Jakarta Sans Fallback", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 16px;
        line-height: 24px;
        overflow: auto;
      }
      body,
      button,
      input {
        font-family: inherit;
      }
      p,
      h1,
      dl {
        margin: 0;
      }
      .shell {
        position: relative;
        width: 100%;
        max-width: 384px;
        height: fit-content;
      }
      main {
        width: 100%;
        max-width: 464px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--card);
        padding: 24px 16px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
      }
      .content {
        width: 100%;
        display: flex;
        flex-direction: column;
      }
      .intro {
        width: 100%;
        display: flex;
        flex-direction: column;
        padding-bottom: 40px;
      }
      .mark {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--border);
        color: var(--foreground);
        border-radius: 8px;
        padding: 8px;
        margin-bottom: 24px;
      }
      .mark svg {
        width: 26px;
        height: 16px;
        display: block;
      }
      h1 {
        font-size: 24px;
        line-height: 32px;
        font-weight: 700;
        letter-spacing: 0;
        padding-bottom: 8px;
      }
      .subtitle {
        color: var(--muted-foreground);
        font-size: 14px;
        font-weight: 400;
        line-height: 20px;
      }
      form {
        width: 100%;
      }
      .form-stack {
        width: 100%;
        display: flex;
        flex-direction: column;
      }
      .field {
        width: 100%;
        display: flex;
        flex-direction: column;
        margin-bottom: 16px;
      }
      label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--foreground);
        font-size: 12px;
        font-weight: 700;
        line-height: 12px;
        margin: 0 0 12px;
        user-select: none;
      }
      input:not([type="checkbox"]) {
        width: 100%;
        min-width: 0;
        height: 52px;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        color: var(--foreground);
        box-shadow: 0 0 0 2px var(--input);
        padding: 4px 20px;
        font-size: 14px;
        line-height: 20px;
        outline: none;
        transition: box-shadow 150ms ease;
      }
      input::placeholder {
        color: var(--muted-foreground);
      }
      input:not([type="checkbox"]):focus {
        box-shadow: 0 0 0 2px var(--ring), 0 0 0 5px color-mix(in srgb, var(--ring) 18%, transparent);
      }
      button {
        width: 100%;
        height: 48px;
        border: 0;
        border-radius: 9999px;
        background: var(--primary);
        color: var(--primary-foreground);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 8px 0 0;
        font-size: 16px;
        font-weight: 400;
        line-height: 24px;
        cursor: pointer;
        transition: opacity 150ms ease;
      }
      button:hover {
        opacity: 0.9;
      }
      .alert {
        border-radius: 8px;
        padding: 12px 14px;
        margin: 0 0 20px;
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
      .mcp-details {
        width: 100%;
        margin-top: 24px;
      }
      .status {
        display: grid;
        gap: 8px;
        color: var(--muted-foreground);
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
        color: var(--foreground);
        font-size: 14px;
        font-weight: 600;
        text-decoration: underline;
      }
      @media (min-width: 640px) {
        body {
          padding: 80px 32px;
        }
        main {
          padding: 32px 24px;
        }
        .shell {
          max-width: 448px;
        }
        .subtitle {
          font-size: 16px;
          line-height: 24px;
        }
      }
      @media (min-width: 1024px) {
        main {
          width: 464px;
          height: 40.8rem;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <main>
        <div class="content">
          <div class="intro">
            <span class="mark" aria-hidden="true">
              <svg width="26" height="16" viewBox="0 0 26 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.913 12.5887L25.9405 3.14688V0H0.413039V3.44094H8.1834L0 12.8828V16H26V12.5887H17.913ZM5.31832 12.5887L13.0958 3.44094H20.7793L12.8506 12.5887H5.31832Z" fill="currentColor" />
              </svg>
            </span>
            <h1>Entrar no Despezzas</h1>
            <p class="subtitle">Entre para autorizar o MCP do Despezzas a acessar sua conta.</p>
          </div>
          ${error}
          ${success}
          <form method="post" action="${action}" autocomplete="on">
            ${hidden}
            <div class="form-stack">
              ${ownerCode}
              <div class="field">
                <label for="email">E-mail</label>
                <input id="email" name="email" type="email" value="${email}" placeholder="Insira seu e-mail" autocomplete="username"${credentialRequired} />
              </div>
              <div class="field">
                <label for="password">Senha</label>
                <input id="password" name="password" type="password" placeholder="Insira sua senha" autocomplete="current-password"${credentialRequired} />
              </div>
              <button type="submit">Entrar e autorizar</button>
            </div>
          </form>
          ${mcpDetails}
        </div>
      </main>
    </div>
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
