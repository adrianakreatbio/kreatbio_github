import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEventRegistrationEmail,
  parseEventRegistration,
  sendEventRegistration
} from "../event-registration.js";

const validInput = {
  eventId: "basic-bioinfo-3-2026-11-21",
  name: "Aisha Rahman",
  email: "AISHA@example.com",
  researchTopic: "Amplicon primer design for soil bacteria",
  requestId: "test-request-1",
  website: ""
};

test("validates and normalizes an event registration", () => {
  const registration = parseEventRegistration(validInput);
  assert.equal(registration.event.title, "Basic Bioinformatics Workshop 3: Amplicon Primer Design Clinic");
  assert.equal(registration.email, "aisha@example.com");
  assert.equal(registration.suppressed, false);
});

test("rejects unknown events and invalid participant details", () => {
  assert.throws(() => parseEventRegistration({ ...validInput, eventId: "unknown" }), /valid event/i);
  assert.throws(() => parseEventRegistration({ ...validInput, email: "not-an-email" }), /valid email/i);
  assert.throws(() => parseEventRegistration({ ...validInput, researchTopic: "x" }), /research topic/i);
});

test("silently suppresses honeypot submissions", () => {
  assert.deepEqual(parseEventRegistration({ website: "https://spam.invalid" }), { suppressed: true });
});

test("builds a plain-text registration message", () => {
  const message = buildEventRegistrationEmail(parseEventRegistration(validInput));
  assert.match(message.subject, /Amplicon Primer Design Clinic — Aisha Rahman/);
  assert.match(message.text, /Fee: RM 100 per participant; maximum 15 participants/);
  assert.match(message.text, /Amplicon primer design for soil bacteria/);
});

test("sends through the email API with reply-to and idempotency", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      headers: { get: () => "" },
      json: async () => ({ id: "email_123" })
    };
  };
  const result = await sendEventRegistration(parseEventRegistration(validInput), {
    apiKey: "test-key",
    from: "KreatBio Events <events@kreatbio.com>",
    to: "team@kreatbio.com",
    fetchImpl
  });
  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.options.headers["Idempotency-Key"], "event-registration/test-request-1");
  assert.equal(body.reply_to, "aisha@example.com");
  assert.deepEqual(body.to, ["team@kreatbio.com"]);
  assert.equal(result.id, "email_123");
});

test("does not claim success when email configuration or delivery fails", async () => {
  const registration = parseEventRegistration(validInput);
  await assert.rejects(() => sendEventRegistration(registration), /not configured/i);
  await assert.rejects(
    () => sendEventRegistration(registration, {
      apiKey: "test-key",
      from: "events@kreatbio.com",
      to: "team@kreatbio.com",
      fetchImpl: async () => ({ ok: false, status: 500, headers: { get: () => "provider-request" } })
    }),
    /could not be sent/i
  );
});
