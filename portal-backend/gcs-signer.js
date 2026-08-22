import crypto from "node:crypto";

export function createGcsSignedUrl({
  bucket,
  objectName = "",
  accessId,
  secret,
  expiresSeconds = 1800,
  method = "GET",
  query = {},
  now = Date.now()
}) {
  if (!bucket || !accessId || !secret) throw new Error("GCS HMAC signing configuration is incomplete.");
  const expires = Number(expiresSeconds);
  if (!Number.isInteger(expires) || expires < 1 || expires > 604800) {
    throw new Error("GCS signed URL expiry must be between 1 and 604800 seconds.");
  }
  const timestamp = new Date(now).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = timestamp.slice(0, 8);
  const scope = `${date}/auto/storage/goog4_request`;
  const canonicalUri = `/${encodePath(bucket)}${objectName ? `/${encodePath(objectName)}` : ""}`;
  const signedQuery = {
    ...query,
    "X-Goog-Algorithm": "GOOG4-HMAC-SHA256",
    "X-Goog-Credential": `${accessId}/${scope}`,
    "X-Goog-Date": timestamp,
    "X-Goog-Expires": String(expires),
    "X-Goog-SignedHeaders": "host"
  };
  const canonicalQuery = canonicalQueryString(signedQuery);
  const canonicalRequest = [
    String(method).toUpperCase(),
    canonicalUri,
    canonicalQuery,
    "host:storage.googleapis.com\n",
    "host",
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const stringToSign = [
    "GOOG4-HMAC-SHA256",
    timestamp,
    scope,
    crypto.createHash("sha256").update(canonicalRequest).digest("hex")
  ].join("\n");
  const dateKey = hmac(`GOOG4${secret}`, date);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "storage");
  const signingKey = hmac(serviceKey, "goog4_request");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  return `https://storage.googleapis.com${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${signature}`;
}

function hmac(key, value) {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function encodePath(value) {
  return String(value).split("/").map(percentEncode).join("/");
}

function canonicalQueryString(query) {
  return Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [percentEncode(key), percentEncode(value)])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => compareBytes(leftKey, rightKey) || compareBytes(leftValue, rightValue))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function compareBytes(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function percentEncode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
