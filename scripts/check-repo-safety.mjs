/**
 * Guard against sensitive files, unredacted secrets, and standalone generated edits.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const GENERATED_PREFIXES = ["dist/"];
const SOURCE_SIGNAL_PREFIXES = ["src/", "test/", "scripts/", "api/", "docs/"];
const SOURCE_SIGNAL_FILES = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "wrangler.jsonc",
  "vercel.json",
  "Dockerfile",
  "render.yaml",
  "railway.json",
  "horizon_proxy.py",
  "requirements.txt",
];

const MAX_SCAN_BYTES = 1024 * 1024;

function gitLines(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    throw new Error(`Unable to inspect git state: ${error.message}`, { cause: error });
  }
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function unique(values) {
  return [...new Set(values)];
}

function changedFiles() {
  return unique(
    [
      ...gitLines(["diff", "--name-only"]),
      ...gitLines(["diff", "--cached", "--name-only"]),
      ...gitLines(["ls-files", "--others", "--exclude-standard"]),
    ].map(normalizePath),
  );
}

function trackedFiles() {
  return gitLines(["ls-files"]).map(normalizePath);
}

function isGenerated(filePath) {
  return GENERATED_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function isSourceSignal(filePath) {
  return SOURCE_SIGNAL_PREFIXES.some((prefix) => filePath.startsWith(prefix)) || SOURCE_SIGNAL_FILES.includes(filePath);
}

function isSensitivePath(filePath) {
  const lower = filePath.toLowerCase();
  const name = lower.split("/").pop() ?? lower;

  if ((name === ".env" || name.startsWith(".env.")) && name !== ".env.example") {
    return true;
  }

  return [
    lower.includes("/.despezzas-mcp/"),
    name === ".despezzas-session.json",
    lower.endsWith(".har"),
    lower.endsWith(".har.json"),
    lower.endsWith(".log"),
    /(^|\/)session[^/]*\.json$/i.test(lower),
    /(^|\/).*firebase.*(token|session).*\.json$/i.test(lower),
    /(^|\/).*(token|secret|password|credential|bearer).*\.(json|txt|log|env)$/i.test(lower),
    /(^|\/).*api[-_]?response.*\.json$/i.test(lower),
  ].some(Boolean);
}

function canScan(filePath) {
  if (!existsSync(filePath)) {
    return false;
  }

  const stats = statSync(filePath);
  return stats.isFile() && stats.size <= MAX_SCAN_BYTES;
}

function contentFindings(filePath) {
  if (!canScan(filePath)) {
    return [];
  }

  const content = readFileSync(filePath, "utf8");
  if (content.includes("\0")) {
    return [];
  }

  const checks = [
    {
      label: "Bearer token literal",
      pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
    },
    {
      label: "Authorization header token",
      pattern: /authorization["']?\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
    },
    {
      label: "Firebase refresh/id token literal",
      pattern: /["'](?:refreshToken|idToken|firebase_token)["']\s*:\s*["'][^"']{20,}["']/i,
    },
    {
      label: "Non-placeholder Despezzas secret env value",
      pattern:
        /^DESPEZZAS_(?:TOKEN|PASSWORD|FIREBASE_API_KEY)\s*=\s*(?!$|<|your|seu|placeholder|example|xxx|\.\.\.)\S+/im,
    },
    {
      label: "Firebase API key literal",
      pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/,
    },
    {
      label: "Database URL with inline password",
      pattern: /\bpostgres(?:ql)?:\/\/[^:\s/]+:[^@\s/]+@/i,
    },
  ];

  return checks.filter((check) => check.pattern.test(content)).map((check) => check.label);
}

function main() {
  const changed = changedFiles();
  const tracked = trackedFiles();
  const findings = [];

  for (const filePath of unique([...changed, ...tracked])) {
    if (isSensitivePath(filePath)) {
      findings.push(`${filePath}: sensitive filename/path should not be committed`);
    }
  }

  const generated = changed.filter(isGenerated);
  const sources = changed.filter(isSourceSignal);

  if (generated.length > 0 && sources.length === 0) {
    findings.push(
      [
        "Generated output changed without source/config/docs changes.",
        "Edit source files and run the build instead of changing dist/ manually.",
        ...generated.map((filePath) => `- ${filePath}`),
      ].join("\n"),
    );
  }

  for (const filePath of changed) {
    for (const label of contentFindings(filePath)) {
      findings.push(`${filePath}: ${label}`);
    }
  }

  if (findings.length > 0) {
    console.error(["Repo safety check failed:", "", ...findings].join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log("Repo safety check OK");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
