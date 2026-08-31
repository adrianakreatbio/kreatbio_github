#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChatQuotaStore } from "./quota-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const command = String(process.argv[2] || "").toLowerCase();
const code = normalizeCode(process.argv[3]);
const databasePath = process.env.CHAT_QUOTA_DB || path.join(__dirname, ".data", "chat-quota.sqlite");
const secret = environmentSecret("SESSION_SECRET");

const reportCommands = ["add", "status", "increase", "disable", "enable", "reset", "usage"];
const globalCommands = ["raise-all"];

if (!reportCommands.includes(command) && !globalCommands.includes(command)) {
  usage();
  process.exitCode = 2;
} else if (reportCommands.includes(command) && !code) {
  usage();
  process.exitCode = 2;
} else if (!secret || secret.length < 32) {
  console.error("SESSION_SECRET or SESSION_SECRET_FILE must contain at least 32 characters.");
  process.exitCode = 2;
} else {
  const store = new ChatQuotaStore({ databasePath, secret });
  try {
    let result;
    if (command === "add") result = store.add(code, optionalPositiveInteger(process.argv[4]) || 500_000);
    if (command === "status") result = store.status(code);
    if (command === "increase") result = store.increase(code, requiredPositiveInteger(process.argv[4], "increase amount"));
    if (command === "disable") result = store.setEnabled(code, false);
    if (command === "enable") result = store.setEnabled(code, true);
    if (command === "reset") result = store.reset(code);
    if (command === "usage") result = store.usage(code, optionalPositiveInteger(process.argv[4]) || 20);
    if (command === "raise-all") result = store.raiseAllLimits(requiredPositiveInteger(process.argv[3], "minimum token limit"));
    if (!result) throw new Error("No chatbot allowance exists for this report.");
    console.log(JSON.stringify(command === "usage" || command === "raise-all" ? result : formatResult(result), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    store.close();
  }
}

function normalizeCode(value) {
  const clean = String(value || "").trim();
  return /^(11|12|13|14)\d{7}$/.test(clean) ? clean : "";
}

function optionalPositiveInteger(value) {
  if (value == null || value === "") return null;
  return requiredPositiveInteger(value, "token limit");
}

function requiredPositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`);
  return number;
}

function environmentSecret(name) {
  const direct = String(process.env[name] || "").trim();
  if (direct) return direct;
  const secretPath = String(process.env[`${name}_FILE`] || "").trim();
  if (!secretPath) return "";
  return fs.readFileSync(secretPath, "utf8").trim();
}

function formatResult(quota) {
  return {
    report: `*****${quota.codeLast4}`,
    enabled: quota.enabled,
    token_limit: quota.tokenLimit,
    tokens_used: quota.tokensUsed,
    tokens_reserved: quota.tokensReserved,
    tokens_remaining: quota.tokensRemaining,
    updated_at: quota.updatedAt
  };
}

function usage() {
  console.error(`Usage:
  npm run quota -- add REPORT_CODE [TOKEN_LIMIT]
  npm run quota -- status REPORT_CODE
  npm run quota -- increase REPORT_CODE TOKENS
  npm run quota -- disable REPORT_CODE
  npm run quota -- enable REPORT_CODE
  npm run quota -- reset REPORT_CODE
  npm run quota -- usage REPORT_CODE [RECENT_ROWS]
  npm run quota -- raise-all MINIMUM_TOKEN_LIMIT`);
}
