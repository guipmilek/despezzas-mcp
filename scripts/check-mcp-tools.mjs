#!/usr/bin/env node
import { readFileSync } from "node:fs";

const SOURCE_FILE = "src/tools.ts";
const LLMS_FILE = "llms.txt";
const DOC_FILES = [
  "README.md",
  "README.en.md",
  "llms.txt",
  "AGENTS.md",
  "docs/agent-playbook.md",
  "docs/agent-architecture-map.md",
  "docs/agent-task-template.md",
];

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function extractToolBlocks(source) {
  const starts = [...source.matchAll(/registerTool\(\s*server\s*,\s*"([^"]+)"/g)].map((match) => ({
    index: match.index,
    name: match[1],
  }));

  return starts
    .map((start, blockIndex) => {
      const end = starts[blockIndex + 1]?.index ?? source.indexOf("\n}", start.index);
      const block = source.slice(start.index, end === -1 ? undefined : end);
      return { name: start.name, block };
    })
    .filter(Boolean);
}

function extractLlmsCatalog(text) {
  const section = text.match(/## MCP Tools\s+([\s\S]*?)\n\nWrite or destructive tools must/m)?.[1] ?? "";
  return [...section.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
}

function extractDocToolReferences(text) {
  return [...text.matchAll(/`(despezzas_[a-z0-9_]+)`/g)].map((match) => match[1]);
}

function unique(values) {
  return [...new Set(values)];
}

function sameOrderedList(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function checkWriteSafety(blocks) {
  const findings = [];

  for (const { name, block } of blocks) {
    const isWriteTool =
      name !== "despezzas_raw_api" && /destructiveHint:\s*true|Operação de escrita|destrutiva/i.test(block);

    if (isWriteTool) {
      if (!/confirm:\s*z\.boolean\(\)\.optional\(\)/.test(block)) {
        findings.push(`${name}: write/destructive tool is missing confirm in inputSchema`);
      }

      if (!/Exige confirm:\s*true/i.test(block)) {
        findings.push(`${name}: write/destructive description should mention confirm: true`);
      }

      if (!/requireConfirmation\(confirm\b/.test(block) && !/if\s*\(\s*!confirm\s*\)/.test(block)) {
        findings.push(`${name}: write/destructive handler does not visibly gate on confirm`);
      }
    }

    if (name === "despezzas_raw_api") {
      if (!/allow_destructive:\s*z\.boolean\(\)\.optional\(\)/.test(block)) {
        findings.push(`${name}: raw API tool is missing allow_destructive in inputSchema`);
      }

      if (!/method\s*!==\s*"GET"\s*&&\s*!allow_destructive/.test(block)) {
        findings.push(`${name}: raw API tool does not visibly gate non-GET calls`);
      }
    }
  }

  return findings;
}

function main() {
  const source = readText(SOURCE_FILE);
  const blocks = extractToolBlocks(source);
  const sourceNames = blocks.map(({ name }) => name);
  const llmsNames = extractLlmsCatalog(readText(LLMS_FILE));
  const findings = [];

  const duplicateNames = sourceNames.filter((name, index) => sourceNames.indexOf(name) !== index);
  if (duplicateNames.length > 0) {
    findings.push(`Duplicate registered tools: ${unique(duplicateNames).join(", ")}`);
  }

  if (!sameOrderedList(sourceNames, llmsNames)) {
    findings.push(
      [
        "llms.txt MCP tool catalog differs from src/tools.ts.",
        `Source: ${sourceNames.join(", ")}`,
        `llms.txt: ${llmsNames.join(", ")}`,
      ].join("\n"),
    );
  }

  const registered = new Set(sourceNames);
  for (const filePath of DOC_FILES) {
    const staleReferences = unique(extractDocToolReferences(readText(filePath))).filter(
      (name) => !registered.has(name),
    );
    if (staleReferences.length > 0) {
      findings.push(`${filePath}: unknown MCP tool reference(s): ${staleReferences.join(", ")}`);
    }
  }

  findings.push(...checkWriteSafety(blocks));

  if (findings.length > 0) {
    console.error(["MCP tool check failed:", "", ...findings].join("\n"));
    process.exitCode = 1;
    return;
  }

  console.log(`MCP tool check OK (${sourceNames.length} tools)`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
