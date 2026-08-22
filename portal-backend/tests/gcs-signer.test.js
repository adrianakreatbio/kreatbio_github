import assert from "node:assert/strict";
import test from "node:test";
import { createGcsSignedUrl } from "../gcs-signer.js";

test("creates a deterministic private GCS V4 HMAC URL", () => {
  const signed = createGcsSignedUrl({
    bucket: "private bucket",
    objectName: "clients26/120000000/output/report file.pdf",
    accessId: "GOOG1EXAMPLE",
    secret: "example-secret",
    expiresSeconds: 1800,
    now: Date.UTC(2026, 7, 22, 8, 30, 0)
  });
  const url = new URL(signed);
  assert.equal(url.origin, "https://storage.googleapis.com");
  assert.equal(url.pathname, "/private%20bucket/clients26/120000000/output/report%20file.pdf");
  assert.equal(url.searchParams.get("X-Goog-Algorithm"), "GOOG4-HMAC-SHA256");
  assert.equal(url.searchParams.get("X-Goog-Date"), "20260822T083000Z");
  assert.equal(url.searchParams.get("X-Goog-Expires"), "1800");
  assert.match(url.searchParams.get("X-Goog-Signature"), /^[a-f0-9]{64}$/);
});

test("supports signed bucket listing query parameters", () => {
  const signed = createGcsSignedUrl({
    bucket: "koda123",
    accessId: "GOOG1EXAMPLE",
    secret: "example-secret",
    query: { "list-type": "2", prefix: "clients26/120000000/" }
  });
  const url = new URL(signed);
  assert.equal(url.pathname, "/koda123");
  assert.equal(url.searchParams.get("list-type"), "2");
  assert.equal(url.searchParams.get("prefix"), "clients26/120000000/");
});
