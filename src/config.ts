export type McpTransport = "stdio" | "http";

export interface Config {
  apiBaseUrl: string;
  firebaseApiKey: string;
  publicBaseUrl: string | undefined;
  allowedHosts: string[];
  token: string | undefined;
  email: string | undefined;
  password: string | undefined;
  sessionFile: string | undefined;
  transport: McpTransport;
  port: number;
  host: string;
  httpBearerToken: string | undefined;
  oauthAccessTokenTtlSeconds: number;
  oauthTokenSecret: string | undefined;
  ownerAuthCode: string | undefined;
}

function normalizeTransport(value: string | undefined): McpTransport {
  return value === "http" ? "http" : "stdio";
}

function normalizePort(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8787;
}

export const config: Config = {
  apiBaseUrl: process.env.DESPEZZAS_API_BASE_URL ?? "https://api.despezzas.com",
  firebaseApiKey: process.env.DESPEZZAS_FIREBASE_API_KEY ?? "INSIRA_SUA_DESPEZZAS_FIREBASE_API_KEY",
  publicBaseUrl: process.env.MCP_PUBLIC_BASE_URL?.replace(/\/$/, ""),
  allowedHosts: normalizeAllowedHosts(process.env.MCP_ALLOWED_HOSTS, process.env.MCP_PUBLIC_BASE_URL),
  token: process.env.DESPEZZAS_TOKEN,
  email: process.env.DESPEZZAS_EMAIL,
  password: process.env.DESPEZZAS_PASSWORD,
  sessionFile: normalizeSessionFile(process.env.DESPEZZAS_SESSION_FILE),
  transport: normalizeTransport(process.env.MCP_TRANSPORT),
  port: normalizePort(process.env.PORT),
  host: process.env.HOST ?? "127.0.0.1",
  httpBearerToken: process.env.MCP_HTTP_BEARER_TOKEN,
  oauthAccessTokenTtlSeconds: normalizePositiveInt(process.env.MCP_OAUTH_ACCESS_TOKEN_TTL_SECONDS, 3600),
  oauthTokenSecret: process.env.MCP_OAUTH_TOKEN_SECRET,
  ownerAuthCode: process.env.MCP_OWNER_AUTH_CODE,
};

function normalizeSessionFile(value: string | undefined): string | undefined {
  if (value?.toLowerCase() === "none") {
    return undefined;
  }

  if (value) {
    return value;
  }

  const home = process.env.USERPROFILE ?? process.env.HOME;
  return home ? joinPath(home, ".despezzas-mcp", "session.json") : undefined;
}

function normalizeAllowedHosts(value: string | undefined, publicBaseUrl: string | undefined): string[] {
  const hosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  for (const host of value?.split(",") ?? []) {
    const trimmed = host.trim();
    if (trimmed) hosts.add(trimmed);
  }

  if (publicBaseUrl) {
    try {
      hosts.add(new URL(publicBaseUrl).hostname);
    } catch {
      // Ignore malformed public URLs here; OAuth metadata will still use the raw value.
    }
  }

  return [...hosts];
}

function normalizePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function joinPath(...parts: string[]): string {
  const separator = process.platform === "win32" ? "\\" : "/";
  return parts
    .map((part, index) => {
      const normalized = part.replace(/[\\/]+$/g, "");
      return index === 0 ? normalized : normalized.replace(/^[\\/]+/g, "");
    })
    .filter(Boolean)
    .join(separator);
}
