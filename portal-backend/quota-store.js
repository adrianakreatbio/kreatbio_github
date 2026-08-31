import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_LIMIT = 500_000;
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
      CREATE TABLE IF NOT EXISTS chat_usage_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_key TEXT NOT NULL REFERENCES chat_quotas(report_key) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        profile TEXT NOT NULL,
        origin TEXT NOT NULL,
        context_bytes INTEGER NOT NULL DEFAULT 0 CHECK (context_bytes >= 0),
        input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
        cached_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
        cache_write_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cache_write_tokens >= 0),
        output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
        reasoning_tokens INTEGER NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
        total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
        web_search INTEGER NOT NULL DEFAULT 0 CHECK (web_search IN (0, 1)),
        fallback INTEGER NOT NULL DEFAULT 0 CHECK (fallback IN (0, 1))
      );
      CREATE INDEX IF NOT EXISTS chat_usage_events_report_created
        ON chat_usage_events(report_key, event_id DESC);
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

  raiseAllLimits(minimumLimit) {
    const minimum = positiveInteger(minimumLimit, "minimum token limit");
    const timestamp = new Date(this.now()).toISOString();
    const result = this.db.prepare(`
      UPDATE chat_quotas
      SET token_limit = ?, updated_at = ?
      WHERE token_limit < ?
    `).run(minimum, timestamp, minimum);
    const total = this.db.prepare("SELECT COUNT(*) AS count FROM chat_quotas").get()?.count || 0;
    return { minimumTokenLimit: minimum, changedReports: result.changes, totalReports: total };
  }

  recordUsage(reportKey, event = {}) {
    const timestamp = new Date(this.now()).toISOString();
    const result = this.db.prepare(`
      INSERT INTO chat_usage_events (
        report_key, created_at, profile, origin, context_bytes,
        input_tokens, cached_tokens, cache_write_tokens, output_tokens,
        reasoning_tokens, total_tokens, web_search, fallback
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(reportKey),
      timestamp,
      String(event.profile || "unknown").slice(0, 80),
      String(event.origin || "openai").slice(0, 40),
      nonNegativeInteger(event.contextBytes || 0, "context byte count"),
      nonNegativeInteger(event.inputTokens || 0, "input token count"),
      nonNegativeInteger(event.cachedTokens || 0, "cached token count"),
      nonNegativeInteger(event.cacheWriteTokens || 0, "cache-write token count"),
      nonNegativeInteger(event.outputTokens || 0, "output token count"),
      nonNegativeInteger(event.reasoningTokens || 0, "reasoning token count"),
      nonNegativeInteger(event.totalTokens || 0, "total token count"),
      event.webSearch ? 1 : 0,
      event.fallback ? 1 : 0
    );
    return { eventId: Number(result.lastInsertRowid), createdAt: timestamp };
  }

  usage(code, limit = 20) {
    const key = this.reportKey(code);
    const count = Math.min(100, positiveInteger(limit, "usage row limit"));
    if (!this.statusByKey(key)) throw quotaError(404, "No chatbot allowance exists for this report.");
    const summary = this.db.prepare(`
      SELECT COUNT(*) AS requests,
             COALESCE(SUM(total_tokens), 0) AS total_tokens,
             COALESCE(AVG(total_tokens), 0) AS average_total_tokens,
             COALESCE(MAX(total_tokens), 0) AS maximum_total_tokens,
             COALESCE(AVG(input_tokens), 0) AS average_input_tokens,
             COALESCE(SUM(CASE WHEN fallback = 1 THEN 1 ELSE 0 END), 0) AS fallback_requests
      FROM chat_usage_events WHERE report_key = ?
    `).get(key);
    const recent = this.db.prepare(`
      SELECT created_at, profile, origin, context_bytes, input_tokens, cached_tokens,
             cache_write_tokens, output_tokens, reasoning_tokens, total_tokens,
             web_search, fallback
      FROM chat_usage_events WHERE report_key = ?
      ORDER BY event_id DESC LIMIT ?
    `).all(key, count).map(publicUsageEvent);
    return {
      summary: {
        requests: Number(summary.requests || 0),
        totalTokens: Number(summary.total_tokens || 0),
        averageTotalTokens: Number(Number(summary.average_total_tokens || 0).toFixed(1)),
        maximumTotalTokens: Number(summary.maximum_total_tokens || 0),
        averageInputTokens: Number(Number(summary.average_input_tokens || 0).toFixed(1)),
        fallbackRequests: Number(summary.fallback_requests || 0)
      },
      recent
    };
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

function publicUsageEvent(row) {
  return {
    createdAt: row.created_at,
    profile: row.profile,
    origin: row.origin,
    contextBytes: row.context_bytes,
    inputTokens: row.input_tokens,
    cachedTokens: row.cached_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    totalTokens: row.total_tokens,
    webSearch: Boolean(row.web_search),
    fallback: Boolean(row.fallback)
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
