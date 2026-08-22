import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_MAX_OPENINGS = 30;
const DEFAULT_ACCESS_DAYS = 60;

export class ReportAccessStore {
  constructor({
    databasePath,
    secret,
    defaultMaxOpenings = DEFAULT_MAX_OPENINGS,
    defaultAccessDays = DEFAULT_ACCESS_DAYS,
    now = () => Date.now()
  }) {
    if (!databasePath) throw new Error("A report access database path is required.");
    if (!secret || secret.length < 32) throw new Error("A report access secret with at least 32 characters is required.");
    this.secret = secret;
    this.defaultMaxOpenings = positiveInteger(defaultMaxOpenings, "default report opening limit");
    this.defaultAccessDays = positiveInteger(defaultAccessDays, "default report access days");
    this.now = now;
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true, mode: 0o750 });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.initializeSchema();
  }

  initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS report_access (
        report_key TEXT PRIMARY KEY,
        code_last4 TEXT NOT NULL,
        max_openings INTEGER NOT NULL CHECK (max_openings > 0),
        openings_used INTEGER NOT NULL DEFAULT 0 CHECK (openings_used >= 0),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        activated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_opened_at TEXT,
        updated_at TEXT NOT NULL
      );
    `);
  }

  close() {
    this.db.close();
  }

  reportKey(code) {
    return crypto.createHmac("sha256", this.secret).update(String(code)).digest("base64url");
  }

  add(code, maxOpenings = this.defaultMaxOpenings, accessDays = this.defaultAccessDays) {
    const key = this.reportKey(code);
    const limit = positiveInteger(maxOpenings, "report opening limit");
    const days = positiveInteger(accessDays, "report access days");
    const activatedAt = new Date(this.now());
    const expiresAt = new Date(activatedAt.getTime() + days * 24 * 60 * 60 * 1000);
    const timestamp = activatedAt.toISOString();
    try {
      this.db.prepare(`
        INSERT INTO report_access
          (report_key, code_last4, max_openings, openings_used, enabled, activated_at, expires_at, last_opened_at, updated_at)
        VALUES (?, ?, ?, 0, 1, ?, ?, NULL, ?)
      `).run(key, String(code).slice(-4), limit, timestamp, expiresAt.toISOString(), timestamp);
    } catch (err) {
      if (String(err?.code || "").includes("SQLITE_CONSTRAINT_PRIMARYKEY")) {
        throw accessError(409, "This report already has an access window.");
      }
      throw err;
    }
    return this.statusByKey(key);
  }

  authorize(code, { requireOpening = false } = {}) {
    const access = this.status(code);
    if (!access || !access.enabled) throw accessError(403, "This report is not enabled for portal access.");
    if (new Date(access.expiresAt).getTime() <= this.now()) {
      throw accessError(403, "This report's two-month access period has ended.");
    }
    if (requireOpening && access.openingsRemaining <= 0) {
      throw accessError(429, "This report has reached its 30-opening limit.");
    }
    return access;
  }

  consume(code) {
    const key = this.reportKey(code);
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM report_access WHERE report_key = ?").get(key);
      if (!row || !row.enabled) throw accessError(403, "This report is not enabled for portal access.");
      if (new Date(row.expires_at).getTime() <= this.now()) {
        throw accessError(403, "This report's two-month access period has ended.");
      }
      if (row.openings_used >= row.max_openings) {
        throw accessError(429, "This report has reached its 30-opening limit.");
      }
      const timestamp = new Date(this.now()).toISOString();
      this.db.prepare(`
        UPDATE report_access
        SET openings_used = openings_used + 1, last_opened_at = ?, updated_at = ?
        WHERE report_key = ?
      `).run(timestamp, timestamp, key);
      return this.statusByKey(key);
    });
    return transaction.immediate();
  }

  status(code) {
    return this.statusByKey(this.reportKey(code));
  }

  statusByKey(reportKey) {
    const row = this.db.prepare("SELECT * FROM report_access WHERE report_key = ?").get(reportKey);
    return row ? publicAccess(row, this.now()) : null;
  }

  reset(code, maxOpenings = null, accessDays = null) {
    const key = this.reportKey(code);
    const current = this.db.prepare("SELECT * FROM report_access WHERE report_key = ?").get(key);
    if (!current) throw accessError(404, "No access window exists for this report.");
    const limit = maxOpenings == null ? current.max_openings : positiveInteger(maxOpenings, "report opening limit");
    const days = accessDays == null ? this.defaultAccessDays : positiveInteger(accessDays, "report access days");
    const activatedAt = new Date(this.now());
    const expiresAt = new Date(activatedAt.getTime() + days * 24 * 60 * 60 * 1000);
    const timestamp = activatedAt.toISOString();
    this.db.prepare(`
      UPDATE report_access
      SET max_openings = ?, openings_used = 0, enabled = 1,
          activated_at = ?, expires_at = ?, last_opened_at = NULL, updated_at = ?
      WHERE report_key = ?
    `).run(limit, timestamp, expiresAt.toISOString(), timestamp, key);
    return this.statusByKey(key);
  }

  setEnabled(code, enabled) {
    const key = this.reportKey(code);
    const result = this.db.prepare(`
      UPDATE report_access SET enabled = ?, updated_at = ? WHERE report_key = ?
    `).run(enabled ? 1 : 0, new Date(this.now()).toISOString(), key);
    if (!result.changes) throw accessError(404, "No access window exists for this report.");
    return this.statusByKey(key);
  }
}

function publicAccess(row, now) {
  const remaining = Math.max(0, row.max_openings - row.openings_used);
  return {
    reportKey: row.report_key,
    codeLast4: row.code_last4,
    maxOpenings: row.max_openings,
    openingsUsed: row.openings_used,
    openingsRemaining: remaining,
    enabled: Boolean(row.enabled),
    active: Boolean(row.enabled) && new Date(row.expires_at).getTime() > now,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
    lastOpenedAt: row.last_opened_at,
    updatedAt: row.updated_at
  };
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`);
  return number;
}

function accessError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
