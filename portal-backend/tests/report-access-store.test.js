import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ReportAccessStore } from "../report-access-store.js";

const SECRET = "access-test-secret-with-at-least-32-characters";
const CODE = "120000000";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kreatbio-access-"));
  let now = Date.UTC(2026, 7, 22);
  const store = new ReportAccessStore({
    databasePath: path.join(directory, "access.sqlite"),
    secret: SECRET,
    now: () => now
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

test("provisions a hashed 30-opening, 60-day access window", () => {
  const context = fixture();
  try {
    const access = context.store.add(CODE);
    assert.equal(access.maxOpenings, 30);
    assert.equal(access.openingsRemaining, 30);
    assert.equal(access.codeLast4, "0000");
    assert.notEqual(access.reportKey, CODE);
    assert.equal(new Date(access.expiresAt) - new Date(access.activatedAt), 60 * 24 * 60 * 60 * 1000);
  } finally {
    context.cleanup();
  }
});

test("counts successful openings atomically and blocks opening 31", () => {
  const context = fixture();
  try {
    context.store.add(CODE);
    for (let index = 0; index < 30; index += 1) context.store.consume(CODE);
    assert.equal(context.store.status(CODE).openingsRemaining, 0);
    assert.throws(() => context.store.authorize(CODE, { requireOpening: true }), /opening limit/);
    assert.throws(() => context.store.consume(CODE), /opening limit/);
    assert.equal(context.store.authorize(CODE).openingsUsed, 30);
  } finally {
    context.cleanup();
  }
});

test("expires access after 60 days and reset starts a new window", () => {
  const context = fixture();
  try {
    context.store.add(CODE);
    context.advance(60 * 24 * 60 * 60 * 1000 + 1);
    assert.throws(() => context.store.authorize(CODE), /access period has ended/);
    const reset = context.store.reset(CODE);
    assert.equal(reset.openingsUsed, 0);
    assert.equal(reset.openingsRemaining, 30);
    assert.equal(reset.active, true);
  } finally {
    context.cleanup();
  }
});

test("disabled reports cannot be opened", () => {
  const context = fixture();
  try {
    context.store.add(CODE);
    context.store.setEnabled(CODE, false);
    assert.throws(() => context.store.authorize(CODE), /not enabled/);
  } finally {
    context.cleanup();
  }
});
