import assert from "node:assert/strict";
import test from "node:test";
import { GcsReportAccessStore } from "../gcs-report-access-store.js";

const CODE = "120000000";
const NOW = Date.UTC(2026, 7, 22);

function fakeStorage(record) {
  const state = { generation: 1, record: structuredClone(record) };
  return {
    state,
    storage: {
      bucket() {
        return {
          file(name, options = {}) {
            return {
              name,
              async getMetadata() { return [{ generation: String(state.generation) }]; },
              async download() {
                if (options.generation && String(options.generation) !== String(state.generation)) {
                  const err = new Error("generation unavailable");
                  err.code = 404;
                  throw err;
                }
                return [Buffer.from(JSON.stringify(state.record))];
              },
              async save(value, saveOptions) {
                await new Promise((resolve) => setImmediate(resolve));
                if (String(saveOptions.preconditionOpts.ifGenerationMatch) !== String(state.generation)) {
                  const err = new Error("precondition failed");
                  err.code = 412;
                  throw err;
                }
                state.record = JSON.parse(value);
                state.generation += 1;
              }
            };
          }
        };
      }
    }
  };
}

function accessRecord(overrides = {}) {
  return {
    code_last4: "0000",
    max_openings: 30,
    openings_used: 0,
    enabled: true,
    activated_at: new Date(NOW).toISOString(),
    expires_at: new Date(NOW + 60 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    ...overrides
  };
}

test("GCS ledger authorizes and atomically records concurrent openings", async () => {
  const fake = fakeStorage(accessRecord());
  const store = new GcsReportAccessStore({ storage: fake.storage, bucket: "bucket", now: () => NOW });
  const results = await Promise.all([store.consume(CODE), store.consume(CODE), store.consume(CODE)]);
  assert.deepEqual(results.map((result) => result.openingsUsed).sort((a, b) => a - b), [1, 2, 3]);
  assert.equal((await store.status(CODE)).openingsRemaining, 27);
  assert.equal(fake.state.record.openings_used, 3);
});

test("GCS ledger blocks exhausted and expired reports", async () => {
  const exhausted = fakeStorage(accessRecord({ openings_used: 30 }));
  const exhaustedStore = new GcsReportAccessStore({ storage: exhausted.storage, bucket: "bucket", now: () => NOW });
  await assert.rejects(() => exhaustedStore.consume(CODE), /opening limit/);

  const expired = fakeStorage(accessRecord({ expires_at: new Date(NOW - 1).toISOString() }));
  const expiredStore = new GcsReportAccessStore({ storage: expired.storage, bucket: "bucket", now: () => NOW });
  await assert.rejects(() => expiredStore.authorize(CODE), /access period has ended/);
});
