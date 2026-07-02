import {
  AuthRequiredError,
  authSessionExpiresAt,
  isAuthSessionExpiringSoon,
  refreshDespezzasSession,
  type AuthSession,
  type AuthStatus,
  type DespezzasAuthProvider,
} from "./auth.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90;

interface StoredSession {
  v: 1;
  session: AuthSession;
  createdAt: string;
  updatedAt: string;
}

interface EncryptedPayload {
  v: 1;
  iv: string;
  data: string;
}

export function cloudflareSessionsConfigured(input: {
  DESPEZZAS_SESSIONS?: KVNamespace;
  SESSION_ENCRYPTION_KEY?: string;
}): boolean {
  return Boolean(input.DESPEZZAS_SESSIONS && input.SESSION_ENCRYPTION_KEY);
}

export class CloudflareSessionStore {
  constructor(
    private readonly kv: KVNamespace,
    private readonly encryptionSecret: string,
  ) {}

  async create(session: AuthSession): Promise<string> {
    const id = randomId();
    const now = new Date().toISOString();
    await this.put(id, {
      v: 1,
      session,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async get(id: string): Promise<AuthSession | undefined> {
    const raw = await this.kv.get(keyFor(id));
    if (!raw) {
      return undefined;
    }

    const stored = (await decryptJson(raw, this.encryptionSecret)) as StoredSession;
    return stored.v === 1 ? stored.session : undefined;
  }

  async save(id: string, session: AuthSession): Promise<void> {
    const raw = await this.kv.get(keyFor(id));
    const now = new Date().toISOString();
    const previous = raw ? ((await decryptJson(raw, this.encryptionSecret)) as StoredSession) : undefined;
    await this.put(id, {
      v: 1,
      session,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    });
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(keyFor(id));
  }

  private async put(id: string, value: StoredSession): Promise<void> {
    await this.kv.put(keyFor(id), await encryptJson(value, this.encryptionSecret), {
      expirationTtl: SESSION_TTL_SECONDS,
    });
  }
}

export class CloudflareSessionAuthProvider implements DespezzasAuthProvider {
  constructor(
    private readonly store: CloudflareSessionStore,
    private readonly sessionId: string,
  ) {}

  async getToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    const session = await this.loadSession();

    if (session.refreshToken && (options.forceRefresh || isAuthSessionExpiringSoon(session))) {
      const refreshed = await refreshDespezzasSession(session);
      await this.store.save(this.sessionId, refreshed);
      return refreshed.idToken;
    }

    if (!isAuthSessionExpiringSoon(session)) {
      return session.idToken;
    }

    throw new AuthRequiredError("A sessão salva do Despezzas expirou. Reconecte o MCP no ChatGPT.");
  }

  async getStatus(): Promise<AuthStatus> {
    const session = await this.store.get(this.sessionId);
    return {
      hasManualToken: false,
      hasEnvCredentials: false,
      hasSession: Boolean(session?.idToken),
      canRefresh: Boolean(session?.refreshToken),
      expiresAt: session ? authSessionExpiresAt(session) : undefined,
    };
  }

  private async loadSession(): Promise<AuthSession> {
    const session = await this.store.get(this.sessionId);
    if (!session) {
      throw new AuthRequiredError("Nenhuma sessão Despezzas está armazenada para esta conexão do ChatGPT. Reconecte o MCP.");
    }
    return session;
  }
}

export function createCloudflareSessionStore(input: {
  DESPEZZAS_SESSIONS?: KVNamespace;
  SESSION_ENCRYPTION_KEY?: string;
}): CloudflareSessionStore {
  if (!input.DESPEZZAS_SESSIONS) {
    throw new Error("O binding Cloudflare KV DESPEZZAS_SESSIONS não está configurado.");
  }

  if (!input.SESSION_ENCRYPTION_KEY) {
    throw new Error("SESSION_ENCRYPTION_KEY não está configurado.");
  }

  return new CloudflareSessionStore(input.DESPEZZAS_SESSIONS, input.SESSION_ENCRYPTION_KEY);
}

async function encryptJson(value: unknown, secret: string): Promise<string> {
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const key = await encryptionKey(secret);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return JSON.stringify({
    v: 1,
    iv: base64url(iv),
    data: base64url(new Uint8Array(encrypted)),
  } satisfies EncryptedPayload);
}

async function decryptJson(raw: string, secret: string): Promise<unknown> {
  const payload = JSON.parse(raw) as EncryptedPayload;
  if (payload.v !== 1) {
    throw new Error("Versão de sessão criptografada não suportada.");
  }

  const key = await encryptionKey(secret);
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64url(payload.iv) },
    key,
    fromBase64url(payload.data),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(secret);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", material);
  return globalThis.crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function keyFor(id: string): string {
  return `session:${id}`;
}

function randomId(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return base64url(bytes);
}

function base64url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> {
  const buffer = Buffer.from(value, "base64url");
  const copy: Uint8Array<ArrayBuffer> = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy;
}
