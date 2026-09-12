const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EVENT_CATALOG = Object.freeze({
  "ikodaseq-introduction-2026-09-23": {
    title: "i-KodaSeq Introduction",
    date: "23 September 2026, 3:00 PM MYT",
    fee: "Free"
  },
  "basic-bioinfo-1-2026-10-10": {
    title: "Basic Bioinformatics Workshop 1: Primer Trimming and Read QC",
    date: "10 October 2026, 10:00 AM MYT",
    fee: "Free"
  },
  "basic-bioinfo-2-2026-10-24": {
    title: "Basic Bioinformatics Workshop 2: Taxonomic Identification Using NCBI BLAST",
    date: "24 October 2026, 10:00 AM MYT",
    fee: "Free"
  },
  "basic-bioinfo-3-2026-11-07": {
    title: "Basic Bioinformatics Workshop 3: Creating and Interpreting Abundance Bar Charts",
    date: "7 November 2026, 10:00 AM MYT",
    fee: "Free"
  },
  "basic-bioinfo-4-2026-11-21": {
    title: "Basic Bioinformatics Workshop 4: Amplicon Primer Design Clinic",
    date: "21 November 2026, 10:00 AM MYT",
    fee: "RM 50 per participant; maximum 15 participants"
  }
});

export function parseEventRegistration(input = {}) {
  if (clean(input.website, 200)) return { suppressed: true };

  const eventId = cleanLine(input.eventId, 100);
  const event = EVENT_CATALOG[eventId];
  if (!event) throw registrationError(400, "Select a valid event.");

  const name = cleanLine(input.name, 120);
  if (name.length < 2) throw registrationError(400, "Enter your name.");

  const email = cleanLine(input.email, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw registrationError(400, "Enter a valid email address.");

  const researchTopic = clean(input.researchTopic, 2000);
  if (researchTopic.length < 3) throw registrationError(400, "Tell us briefly about your research topic.");

  const requestId = cleanLine(input.requestId, 100);
  if (requestId && !/^[a-zA-Z0-9_-]+$/.test(requestId)) {
    throw registrationError(400, "Invalid registration request identifier.");
  }

  return { eventId, event, name, email, researchTopic, requestId, suppressed: false };
}

export function buildEventRegistrationEmail(registration) {
  const { eventId, event, name, email, researchTopic } = registration;
  return {
    subject: `Event registration: ${event.title} — ${name}`,
    text: [
      "New KreatBio event registration",
      "",
      `Event: ${event.title}`,
      `Event ID: ${eventId}`,
      `Date: ${event.date}`,
      `Fee: ${event.fee}`,
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      "Research topic:",
      researchTopic
    ].join("\n")
  };
}

export async function sendEventRegistration(registration, options = {}) {
  const apiKey = String(options.apiKey || "").trim();
  const from = String(options.from || "").trim();
  const to = String(options.to || "").trim();
  const fetchImpl = options.fetchImpl || fetch;
  if (!apiKey || !from || !to) {
    throw registrationError(503, "Event registration email is not configured.");
  }

  const message = buildEventRegistrationEmail(registration);
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "KreatBio-Event-Registration/1.0",
      ...(registration.requestId ? { "Idempotency-Key": `event-registration/${registration.requestId}` } : {})
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: registration.email,
      subject: message.subject,
      text: message.text,
      tags: [{ name: "event_id", value: registration.eventId }]
    })
  });

  if (!response.ok) {
    const providerRequestId = response.headers?.get?.("x-request-id") || "";
    console.error("Event registration email failed.", response.status, providerRequestId);
    throw registrationError(502, "The registration email could not be sent.");
  }

  const result = await response.json().catch(() => ({}));
  return { id: String(result.id || "") };
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanLine(value, maxLength) {
  return clean(value, maxLength).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
}

function registrationError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
