#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ReportAccessStore } from "./report-access-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const command = String(process.argv[2] || "").toLowerCase();
const code = normalizeCode(process.argv[3]);
const databasePath = process.env.REPORT_ACCESS_DB || path.join(__dirname, ".data", "report-access.sqlite");
const secret = environmentSecret("SESSION_SECRET");

if (!command || !code || !["add", "status", "disable", "enable", "reset"].includes(command)) {
  usage();
  process.exitCode = 2;
} else if (!secret || secret.length < 32) {
  console.error("SESSION_SECRET or SESSION_SECRET_FILE must contain at least 32 characters.");
  process.exitCode = 2;
} else {
  const store = new ReportAccessStore({ databasePath, secret });
  try {
    let result;
    if (command === "add") result = store.add(code, optionalPositiveInteger(process.argv[4]) || 30, optionalPositiveInteger(process.argv[5]) || 60);
    if (command === "status") result = store.status(code);
    if (command === "disable") result = store.setEnabled(code, false);
    if (command === "enable") result = store.setEnabled(code, true);
    if (command === "reset") result = store.reset(code, optionalPositiveInteger(process.argv[4]), optionalPositiveInteger(process.argv[5]));
    if (!result) throw new Error("No access window exists for this report.");
    console.log(JSON.stringify(formatResult(result), null, 2));
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
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error("Limits must be positive integers.");
  return number;
}

function environmentSecret(name) {
  const direct = String(process.env[name] || "").trim();
  if (direct) return direct;
  const secretPath = String(process.env[`${name}_FILE`] || "").trim();
  if (!secretPath) return "";
  return fs.readFileSync(secretPath, "utf8").trim();
}

function formatResult(access) {
  return {
    report: `*****${access.codeLast4}`,
    enabled: access.enabled,
    active: access.active,
    openings_limit: access.maxOpenings,
    openings_used: access.openingsUsed,
    openings_remaining: access.openingsRemaining,
    activated_at: access.activatedAt,
    expires_at: access.expiresAt,
    last_opened_at: access.lastOpenedAt
  };
}

function usage() {
  console.error(`Usage:
  npm run access -- add REPORT_CODE [OPENINGS=30] [DAYS=60]
  npm run access -- status REPORT_CODE
  npm run access -- disable REPORT_CODE
  npm run access -- enable REPORT_CODE
  npm run access -- reset REPORT_CODE [OPENINGS] [DAYS=60]`);
}
