#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function inspectHar(har) {
  const entries = har.log?.entries ?? [];
  const lines = [];

  for (const entry of entries) {
    let url;
    try {
      url = new URL(entry.request.url);
    } catch {
      continue;
    }

    if (url.host !== "api.despezzas.com") continue;

    const method = entry.request.method;
    const status = entry.response?.status ?? "";
    const body = entry.request.postData?.text;
    const responseText = entry.response?.content?.text;
    const preview = responseText ? responseText.slice(0, 240).replace(/\s+/g, " ") : "";

    lines.push(`${method.padEnd(7)} ${String(status).padEnd(3)} ${url.pathname}${url.search}`);
    if (body) lines.push(`  requisicao: ${redact(body).slice(0, 500)}`);
    if (preview) lines.push(`  resposta: ${redact(preview)}`);
  }

  return lines;
}

export function inspectHarFile(file) {
  return inspectHar(JSON.parse(readFileSync(file, "utf8")));
}

export function redact(text) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [mascarado]")
    .replace(/("authorization"\s*:\s*")Bearer\s+[^"]+(")/gi, "$1Bearer [mascarado]$2")
    .replace(/"idToken"\s*:\s*"[^"]+"/g, '"idToken":"[mascarado]"')
    .replace(/"refreshToken"\s*:\s*"[^"]+"/g, '"refreshToken":"[mascarado]"')
    .replace(/"firebase_token"\s*:\s*"[^"]+"/g, '"firebase_token":"[mascarado]"')
    .replace(/"password"\s*:\s*"[^"]+"/g, '"password":"[mascarado]"')
    .replace(/"email"\s*:\s*"[^"]+"/g, '"email":"[mascarado]"')
    .replace(/"subscription_token"\s*:\s*"[^"]+"/g, '"subscription_token":"[mascarado]"');
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run inspect:har -- caminho/para/export.har");
    process.exit(1);
  }

  for (const line of inspectHarFile(file)) {
    console.log(line);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
