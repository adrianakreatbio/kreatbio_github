import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChatQuotaStore } from "../quota-store.js";

const SECRET = "quota-test-secret-with-at-least-32-characters";
const CODE = "120000000";

function fixture(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kreatbio-quota-"));
  let now = Date.now();
  const store = new ChatQuotaStore({
    databasePath: path.join(directory, "quota.sqlite"),
    secret: SECRET,
    defaultLimit: 100_000,
    now: () => now,
    ...options
  });
  return {
    store,
    advance(milliseconds) { now += milliseconds; },
    cleanup() {
      store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

test("provisions a lifetime allowance without storing the report code", () => {
  const context = fixture();
  try {
    const quota = context.store.add(CODE);
    assert.equal(quota.tokenLimit, 100_000);
    assert.equal(quota.tokensRemaining, 100_000);
    assert.equal(quota.codeLast4, "0000");
    assert.notEqual(quota.reportKey, CODE);
    assert.equal(context.store.authenticate(CODE).reportKey, quota.reportKey);
    assert.throws(() => context.store.add(CODE), /already has/);
  } finally {
    context.cleanup();
  }
});

test("reserves atomically and settles using the provider's actual total", () => {
  const context = fixture();
  try {
    const quota = context.store.add(CODE, 5_000);
    const reservation = context.store.reserve(quota.reportKey, 1_200, 1_000);
    assert.equal(reservation.reservedTokens, 2_200);
    assert.equal(context.store.status(CODE).tokensRemaining, 2_800);
    const settled = context.store.settle(reservation.reservationId, 1_450);
    assert.equal(settled.tokensUsed, 1_450);
    assert.equal(settled.tokensReserved, 0);
    assert.equal(settled.tokensRemaining, 3_550);
  } finally {
    context.cleanup();
  }
});

test("concurrent reservations cannot spend the same remaining allowance", () => {
  const context = fixture();
  try {
    const quota = context.store.add(CODE, 3_000);
    context.store.reserve(quota.reportKey, 1_000, 1_000);
    assert.throws(() => context.store.reserve(quota.reportKey, 1_000, 1_000), /used its chatbot allowance/);
  } finally {
    context.cleanup();
  }
});

test("failed calls release their reservations", () => {
  const context = fixture();
  try {
    const quota = context.store.add(CODE, 3_000);
    const reservation = context.store.reserve(quota.reportKey, 1_000, 1_000);
    const released = context.store.release(reservation.reservationId);
    assert.equal(released.tokensUsed, 0);
    assert.equal(released.tokensReserved, 0);
    assert.equal(released.tokensRemaining, 3_000);
  } finally {
    context.cleanup();
  }
});

test("stale reservations are recovered after the configured TTL", () => {
  const context = fixture({ reservationTtlSeconds: 60 });
  try {
    const quota = context.store.add(CODE, 3_000);
    context.store.reserve(quota.reportKey, 1_000, 1_000);
    context.advance(61_000);
    assert.equal(context.store.status(CODE).tokensRemaining, 3_000);
  } finally {
    context.cleanup();
  }
});

test("administration can increase, disable, enable, and reset an allowance", () => {
  const context = fixture();
  try {
    const quota = context.store.add(CODE, 2_000);
    const reservation = context.store.reserve(quota.reportKey, 500, 500);
    context.store.settle(reservation.reservationId, 700);
    assert.equal(context.store.increase(CODE, 1_000).tokenLimit, 3_000);
    assert.equal(context.store.setEnabled(CODE, false).enabled, false);
    assert.throws(() => context.store.authenticate(CODE), /not enabled/);
    assert.equal(context.store.setEnabled(CODE, true).enabled, true);
    assert.equal(context.store.reset(CODE).tokensRemaining, 3_000);
  } finally {
    context.cleanup();
  }
});
