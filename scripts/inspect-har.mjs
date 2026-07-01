#!/usr/bin/env node
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run inspect:har -- path/to/export.har");
  process.exit(1);
}

const har = JSON.parse(readFileSync(file, "utf8"));
const entries = har.log?.entries ?? [];

for (const entry of entries) {
  const url = new URL(entry.request.url);
  if (url.host !== "api.despezzas.com") continue;

  const method = entry.request.method;
  const status = entry.response?.status ?? "";
  const body = entry.request.postData?.text;
  const responseText = entry.response?.content?.text;
  const preview = responseText ? responseText.slice(0, 240).replace(/\s+/g, " ") : "";

  console.log(`${method.padEnd(7)} ${String(status).padEnd(3)} ${url.pathname}${url.search}`);
  if (body) console.log(`  request: ${redact(body).slice(0, 500)}`);
  if (preview) console.log(`  response: ${redact(preview)}`);
}

function redact(text) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/"idToken"\s*:\s*"[^"]+"/g, '"idToken":"[redacted]"')
    .replace(/"password"\s*:\s*"[^"]+"/g, '"password":"[redacted]"')
    .replace(/"subscription_token"\s*:\s*"[^"]+"/g, '"subscription_token":"[redacted]"');
}
