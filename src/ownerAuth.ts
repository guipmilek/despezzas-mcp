import crypto from "node:crypto";
import { config } from "./config.js";

export function ownerAuthCodeConfigured(): boolean {
  return Boolean(config.ownerAuthCode);
}

export function requireOwnerAuthCode(input: string | undefined): void {
  if (!config.ownerAuthCode) {
    throw new Error("MCP_OWNER_AUTH_CODE is not configured on this deployment.");
  }

  if (!timingSafeStringEqual(input ?? "", config.ownerAuthCode)) {
    throw new Error("Invalid MCP owner access code.");
  }
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
