const DEFAULT_MAX_OPENINGS = 30;
const DEFAULT_ACCESS_DAYS = 60;
const MAX_UPDATE_ATTEMPTS = 5;

export class GcsReportAccessStore {
  constructor({
    storage,
    bucket,
    prefix = "_portal_state/report-access",
    defaultMaxOpenings = DEFAULT_MAX_OPENINGS,
    defaultAccessDays = DEFAULT_ACCESS_DAYS,
    now = () => Date.now()
  }) {
    if (!storage || !bucket) throw new Error("GCS report access storage and bucket are required.");
    this.bucket = storage.bucket(bucket);
    this.prefix = String(prefix).replace(/^\/+|\/+$/g, "");
    this.defaultMaxOpenings = positiveInteger(defaultMaxOpenings, "default report opening limit");
    this.defaultAccessDays = positiveInteger(defaultAccessDays, "default report access days");
    this.now = now;
  }

  async authorize(code, { requireOpening = false } = {}) {
    const access = await this.status(code);
    validateAccess(access, this.now(), requireOpening);
    return access;
  }

  async consume(code) {
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
      const { record, generation, file } = await this.read(code);
      const access = publicAccess(record, this.now());
      validateAccess(access, this.now(), true);
      const timestamp = new Date(this.now()).toISOString();
      const updated = {
        ...record,
        openings_used: access.openingsUsed + 1,
        last_opened_at: timestamp,
        updated_at: timestamp
      };
      try {
        await file.save(`${JSON.stringify(updated, null, 2)}\n`, {
          contentType: "application/json",
          resumable: false,
          preconditionOpts: { ifGenerationMatch: generation }
        });
        return publicAccess(updated, this.now());
      } catch (err) {
        if (!isPreconditionFailure(err) || attempt === MAX_UPDATE_ATTEMPTS - 1) throw accessStorageError(err);
      }
    }
    throw accessError(503, "Report access could not be recorded. Please try again.");
  }

  async status(code) {
    const { record } = await this.read(code);
    return publicAccess(record, this.now());
  }

  async read(code) {
    const file = this.bucket.file(`${this.prefix}/${String(code)}.json`);
    for (let attempt = 0; attempt < MAX_UPDATE_ATTEMPTS; attempt += 1) {
      let metadata;
      try {
        [metadata] = await file.getMetadata();
      } catch (err) {
        if (err?.code === 404) throw accessError(403, "This report is not enabled for portal access.");
        throw accessStorageError(err);
      }
      const generation = String(metadata.generation || "");
      try {
        const versionedFile = this.bucket.file(file.name, { generation });
        const [buffer] = await versionedFile.download();
        const record = JSON.parse(buffer.toString("utf8"));
        return { file, generation, record };
      } catch (err) {
        if (err instanceof SyntaxError) throw accessError(500, "The report access record is invalid.");
        if (err?.code !== 404 || attempt === MAX_UPDATE_ATTEMPTS - 1) throw accessStorageError(err);
      }
    }
    throw accessError(503, "Report access is temporarily unavailable.");
  }
}

function validateAccess(access, now, requireOpening) {
  if (!access || !access.enabled) throw accessError(403, "This report is not enabled for portal access.");
  if (new Date(access.expiresAt).getTime() <= now) {
    throw accessError(403, "This report's two-month access period has ended.");
  }
  if (requireOpening && access.openingsRemaining <= 0) {
    throw accessError(429, "This report has reached its opening limit.");
  }
}

function publicAccess(record, now) {
  const maxOpenings = positiveInteger(record.max_openings, "report opening limit");
  const openingsUsed = nonNegativeInteger(record.openings_used, "used report openings");
  const expiresAt = requiredDate(record.expires_at, "report expiry");
  return {
    codeLast4: String(record.code_last4 || ""),
    maxOpenings,
    openingsUsed,
    openingsRemaining: Math.max(0, maxOpenings - openingsUsed),
    enabled: record.enabled !== false,
    active: record.enabled !== false && expiresAt.getTime() > now,
    activatedAt: requiredDate(record.activated_at, "report activation").toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastOpenedAt: record.last_opened_at || null,
    updatedAt: record.updated_at || record.activated_at
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

function requiredDate(value, label) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
}

function isPreconditionFailure(err) {
  return err?.code === 412 || err?.statusCode === 412;
}

function accessStorageError(err) {
  if (err?.statusCode) return err;
  console.error("GCS report access store error.", err);
  return accessError(503, "Report access is temporarily unavailable.");
}

function accessError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}
