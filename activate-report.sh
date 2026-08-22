#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
report_code="${1:-}"
max_openings="${2:-30}"
access_days="${3:-60}"
chat_tokens="${4:-100000}"
bucket="koda123"
client_prefix="clients26"
access_prefix="_portal_state/report-access"
vps_host="root@72.62.252.76"

fail() {
  printf 'Activation failed: %s\n' "$1" >&2
  exit 1
}

[[ "$report_code" =~ ^(11|12|13|14)[0-9]{7}$ ]] || fail "use a 9-digit report code beginning with 11, 12, 13, or 14."
[[ "$max_openings" =~ ^[1-9][0-9]*$ ]] || fail "openings must be a positive whole number."
[[ "$access_days" =~ ^[1-9][0-9]*$ ]] || fail "days must be a positive whole number."
[[ "$chat_tokens" =~ ^[1-9][0-9]*$ ]] || fail "tokens must be a positive whole number."
for command in gcloud node ssh; do
  command -v "$command" >/dev/null || fail "$command is not installed."
done

if [[ -n "${KREATBIO_GCLOUD_CONFIG:-}" ]]; then
  export CLOUDSDK_CONFIG="$KREATBIO_GCLOUD_CONFIG"
fi

report_uri="gs://$bucket/$client_prefix/$report_code/"
state_uri="gs://$bucket/$access_prefix/$report_code.json"
temporary_dir="$(mktemp -d)"
trap 'rm -rf -- "$temporary_dir"' EXIT
state_file="$temporary_dir/report-access.json"

printf 'Checking %s...\n' "$report_uri"
gcloud storage ls "$report_uri" >/dev/null || fail "the report folder is missing or your Google login cannot read it."

if gcloud storage objects describe "$state_uri" >/dev/null 2>&1; then
  printf 'Report access is already active; leaving its opening count and expiry unchanged.\n'
else
  node - "$report_code" "$max_openings" "$access_days" "$state_file" <<'NODE'
const fs = require("node:fs");
const [code, openings, days, output] = process.argv.slice(2);
const activatedAt = new Date();
const expiresAt = new Date(activatedAt.getTime() + Number(days) * 86400000);
const record = {
  version: 1,
  code_last4: code.slice(-4),
  enabled: true,
  max_openings: Number(openings),
  openings_used: 0,
  activated_at: activatedAt.toISOString(),
  expires_at: expiresAt.toISOString(),
  last_opened_at: null,
  updated_at: activatedAt.toISOString()
};
fs.writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
NODE
  gcloud storage cp "$state_file" "$state_uri" --if-generation-match=0 >/dev/null
  printf 'Portal access activated: %s openings for %s days.\n' "$max_openings" "$access_days"
fi

if ssh "$vps_host" "cd /opt/kreatbio-portal && sudo -u kreatbio-portal env CHAT_QUOTA_DB=/var/lib/kreatbio-portal/chat-quota.sqlite SESSION_SECRET_FILE=/etc/kreatbio-portal/session-secret npm run quota -- status '$report_code'" >/dev/null 2>&1; then
  printf 'Chat allowance already exists; leaving its usage and limit unchanged.\n'
else
  ssh "$vps_host" "cd /opt/kreatbio-portal && sudo -u kreatbio-portal env CHAT_QUOTA_DB=/var/lib/kreatbio-portal/chat-quota.sqlite SESSION_SECRET_FILE=/etc/kreatbio-portal/session-secret npm run quota -- add '$report_code' '$chat_tokens'"
  printf 'Chat allowance activated: %s tokens.\n' "$chat_tokens"
fi

printf 'Report %s is ready at https://kreatbio.com/client-portal\n' "$report_code"
