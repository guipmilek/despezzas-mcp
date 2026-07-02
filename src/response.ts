import type { JsonValue } from "./types.js";

const EXACT_SENSITIVE_KEYS = new Set([
  "password",
  "subscription_token",
  "subscription_id",
  "subscription_transaction_id",
  "password_reset_token",
  "auth_provider_uid",
  "external_token",
]);

const SENSITIVE_KEY_PATTERNS = ["token", "password", "secret", "credential", "authorization"];

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key) ? "[mascarado]" : redact(child);
  }
  return redacted;
}

export function jsonResponse(data: unknown, note?: string) {
  const redacted = redact(data);
  const payload = note ? { note, data: redacted } : toStructuredPayload(redacted);
  const text = JSON.stringify(note ? payload : redacted, null, 2);
  return {
    structuredContent: payload,
    content: [{ type: "text" as const, text }],
  };
}

export function errorResponse(error: unknown, action: string) {
  const message = error instanceof Error ? error.message : String(error);
  const details =
    error && typeof error === "object" && "details" in error
      ? redact((error as { details: unknown }).details)
      : undefined;
  const structuredContent = dropUndefined({
    error: message,
    action,
    details,
  });

  return {
    structuredContent,
    content: [
      {
        type: "text" as const,
        text: `Falha ao ${action}: ${message}`,
      },
    ],
    isError: true,
  };
}

export function requireConfirmation(confirm: boolean | undefined, action: string) {
  if (confirm) {
    return undefined;
  }

  const message = `Recusando ${action} porque confirm não foi true. Execute a ferramenta novamente com confirm: true depois de verificar os IDs de destino e o payload.`;
  return {
    structuredContent: {
      refused: true,
      action,
      required_argument: "confirm",
      required_value: true,
      message,
    },
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
    isError: true,
  };
}

export function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(redact(value))) as JsonValue;
}

function toStructuredPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return { data: value };
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return EXACT_SENSITIVE_KEYS.has(normalized) || SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function dropUndefined(value: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) {
      out[key] = child;
    }
  }
  return out;
}
