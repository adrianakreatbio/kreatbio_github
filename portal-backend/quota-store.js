import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_LIMIT = 100_000;
const DEFAULT_RESERVATION_TTL_SECONDS = 15 * 60;

export class ChatQuotaStore {
  constructor({
    databasePath,
    secret,
    defaultLimit = DEFAULT_LIMIT,
    reservationTtlSeconds = DEFAULT_RESERVATION_TTL_SECONDS,
    now = () => Date.now()
  }) {
    if (!databasePath) throw new Error("A chat quota database path is required.");
    if (!secret || secret.length < 32) throw new Error("A chat quota secret with at least 32 characters is required.");
    this.secret = secret;
    this.defaultLimit = positiveInteger(defaultLimit, "default chat token limit");
    this.reservationTtlSeconds = positiveInteger(reservationTtlSeconds, "chat reservation TTL");
    this.now = now;
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true, mode: 0o750 });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.initializeSchema();
    this.releaseExpiredReservations();
  }

  initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_quotas (
        report_key TEXT PRIMARY KEY,
        code_last4 TEXT NOT NULL,
        token_limit INTEGER NOT NULL CHECK (token_limit > 0),
        tokens_used INTEGER NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
        tokens_reserved INTEGER NOT NULL DEFAULT 0 CHECK (tokens_reserved >= 0),
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_quota_reservations (
        reservation_id TEXT PRIMARY KEY,
        report_key TEXT NOT NULL REFERENCES chat_quotas(report_key) ON DELETE CASCADE,
        tokens_reserved INTEGER NOT NULL CHECK (tokens_reserved > 0),
        created_at_epoch INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS chat_quota_reservations_created
        ON chat_quota_reservations(created_at_epoch);
    `);
  }

  close() {
    this.db.close();
  }

  reportKey(code) {
    return crypto.createHmac("sha256", this.secret).update(String(code)).digest("base64url");
  }

  add(code, tokenLimit = this.defaultLimit) {
    const key = this.reportKey(code);
    const limit = positiveInteger(tokenLimit, "token limit");
    const timestamp = new Date(this.now()).toISOString();
    try {
      this.db.prepare(`
        INSERT INTO chat_quotas
          (report_key, code_last4, token_limit, tokens_used, tokens_reserved, enabled, created_at, updated_at)
        VALUES (?, ?, ?, 0, 0, 1, ?, ?)
      `).run(key, String(code).slice(-4), limit, timestamp, timestamp);
    } catch (err) {
      if (String(err?.code || "").includes("SQLITE_CONSTRAINT_PRIMARYKEY")) {
        throw quotaError(409, "This report already has a chatbot allowance.");
      }
      throw err;
    }
    return this.statusByKey(key);
  }

  authenticate(code) {
    this.releaseExpiredReservations();
    const quota = this.statusByKey(this.reportKey(code));
    if (!quota || !quota.enabled) throw quotaError(403, "Chat is not enabled for this report.");
    return quota;
  }

  status(code) {
    this.releaseExpiredReservations();
    return this.statusByKey(this.reportKey(code));
  }

  statusByKey(reportKey) {
    const row = this.db.prepare("SELECT * FROM chat_quotas WHERE report_key = ?").get(reportKey);
    return row ? publicQuota(row) : null;
  }

  reserve(reportKey, promptTokens, maximumOutputTokens) {
    const prompt = nonNegativeInteger(promptTokens, "prompt token count");
    const maximumOutput = positiveInteger(maximumOutputTokens, "maximum output token count");
    const transaction = this.db.transaction(() => {
      this.releaseExpiredReservations();
      const row = this.db.prepare("SELECT * FROM chat_quotas WHERE report_key = ?").get(reportKey);
      if (!row || !row.enabled) throw quotaError(403, "Chat is not enabled for this report.");
      const remaining = Math.max(0, row.token_limit - row.tokens_used - row.tokens_reserved);
      if (remaining <= prompt) throw quotaError(429, "This report has used its chatbot allowance.");
      const outputTokens = Math.min(maximumOutput, remaining - prompt);
      const reservedTokens = prompt + outputTokens;
      const reservationId = crypto.randomUUID();
      const createdAt = Math.floor(this.now() / 1000);
      this.db.prepare(`
        INSERT INTO chat_quota_reservations
          (reservation_id, report_key, tokens_reserved, created_at_epoch)
        VALUES (?, ?, ?, ?)
      `).run(reservationId, reportKey, reservedTokens, createdAt);
      this.db.prepare(`
        UPDATE chat_quotas
        SET tokens_reserved = tokens_reserved + ?, updated_at = ?
        WHERE report_key = ?
      `).run(reservedTokens, new Date(this.now()).toISOString(), reportKey);
      return { reservationId, reservedTokens, maximumOutputTokens: outputTokens };
    });
    return transaction.immediate();
  }

  settle(reservationId, actualTokens) {
    const actual = nonNegativeInteger(actualTokens, "actual token count");
    const transaction = this.db.transaction(() => {
      const reservation = this.db.prepare("SELECT * FROM chat_quota_reservations WHERE reservation_id = ?").get(reservationId);
      if (!reservation) throw quotaError(409, "Chat quota reservation is no longer active.");
      this.db.prepare("DELETE FROM chat_quota_reservations WHERE reservation_id = ?").run(reservationId);
      this.db.prepare(`
        UPDATE chat_quotas
        SET tokens_reserved = MAX(0, tokens_reserved - ?),
            tokens_used = tokens_used + ?,
            updated_at = ?
        WHERE report_key = ?
      `).run(reservation.tokens_reserved, actual, new Date(this.now()).toISOString(), reservation.report_key);
      return this.statusByKey(reservation.report_key);
    });
    return transaction.immediate();
  }

  release(reservationId) {
    const transaction = this.db.transaction(() => {
      const reservation = this.db.prepare("SELECT * FROM chat_quota_reservations WHERE reservation_id = ?").get(reservationId);
      if (!reservation) return null;
      this.db.prepare("DELETE FROM chat_quota_reservations WHERE reservation_id = ?").run(reservationId);
      this.db.prepare(`
        UPDATE chat_quotas
        SET tokens_reserved = MAX(0, tokens_reserved - ?), updated_at = ?
        WHERE report_key = ?
      `).run(reservation.tokens_reserved, new Date(this.now()).toISOString(), reservation.report_key);
      return this.statusByKey(reservation.report_key);
    });
    return transaction.immediate();
  }

  releaseExpiredReservations() {
    const cutoff = Math.floor(this.now() / 1000) - this.reservationTtlSeconds;
    const transaction = this.db.transaction(() => {
      const expired = this.db.prepare(`
        SELECT report_key, SUM(tokens_reserved) AS tokens_reserved
        FROM chat_quota_reservations
        WHERE created_at_epoch < ?
        GROUP BY report_key
      `).all(cutoff);
      if (!expired.length) return 0;
      this.db.prepare("DELETE FROM chat_quota_reservations WHERE created_at_epoch < ?").run(cutoff);
      const update = this.db.prepare(`
        UPDATE chat_quotas
        SET tokens_reserved = MAX(0, tokens_reserved - ?), updated_at = ?
        WHERE report_key = ?
      `);
      const timestamp = new Date(this.now()).toISOString();
      for (const row of expired) update.run(row.tokens_reserved, timestamp, row.report_key);
      return expired.length;
    });
    return transaction.immediate();
  }

  increase(code, amount) {
    const increment = positiveInteger(amount, "token increase");
    return this.updateExisting(code, "token_limit = token_limit + ?", [increment]);
  }

  reset(code) {
    const key = this.reportKey(code);
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM chat_quota_reservations WHERE report_key = ?").run(key);
      const result = this.db.prepare(`
        UPDATE chat_quotas
        SET tokens_used = 0, tokens_reserved = 0, updated_at = ?
        WHERE report_key = ?
      `).run(new Date(this.now()).toISOString(), key);
      if (!result.changes) throw quotaError(404, "No chatbot allowance exists for this report.");
      return this.statusByKey(key);
    });
    return transaction.immediate();
  }

  setEnabled(code, enabled) {
    return this.updateExisting(code, "enabled = ?", [enabled ? 1 : 0]);
  }

  updateExisting(code, assignment, values) {
    const key = this.reportKey(code);
    const result = this.db.prepare(`
      UPDATE chat_quotas SET ${assignment}, updated_at = ? WHERE report_key = ?
    `).run(...values, new Date(this.now()).toISOString(), key);
    if (!result.changes) throw quotaError(404, "No chatbot allowance exists for this report.");
    return this.statusByKey(key);
  }
}

function publicQuota(row) {
  const remaining = Math.max(0, row.token_limit - row.tokens_used - row.tokens_reserved);
  return {
    reportKey: row.report_key,
    codeLast4: row.code_last4,
    tokenLimit: row.token_limit,
    tokensUsed: row.tokens_used,
    tokensReserved: row.tokens_reserved,
    tokensRemaining: remaining,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer.`);
  return number;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(`${label} must be a non-negative integer.`);
  return number;
}

function quotaError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
