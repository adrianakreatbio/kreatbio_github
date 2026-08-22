# KreatBio Client Portal Backend

Hostinger VPS API for `client-portal.html`. It validates report access, issues short-lived private GCS links, and handles Gemini report chat.

## Required Environment

- `GCS_BUCKET`: Google Cloud Storage bucket containing report folders.
- `GCS_CLIENT_PREFIX`: optional parent folder for client code folders, for example `clients26`.
- `GCS_HMAC_ACCESS_ID_FILE` and `GCS_HMAC_SECRET_FILE`: restricted GCS HMAC credential files used by the VPS to read the private bucket and sign temporary browser links.
- `GCS_SIGNED_URL_TTL_SECONDS`: optional signed-link lifetime, defaults to 1800 seconds.
- `GCS_ACCESS_TOKEN`: optional short-lived local test token from `gcloud auth print-access-token`; do not use in production.
- `SESSION_SECRET`: random secret with at least 32 characters.
- `GEMINI_API_KEY`: optional; enables the bottom-right report chat.
- `GEMINI_MODEL`: optional, defaults to `gemini-3.5-flash-lite`.
- `CHAT_CONTEXT_LIMIT`: optional maximum validated browser-generated report context in bytes, defaults to 81920.
- `CHAT_QUOTA_DB`: SQLite quota ledger path; use `/var/lib/kreatbio-portal/chat-quota.sqlite` on the VPS.
- `REPORT_ACCESS_DB`: SQLite report-opening ledger path; use `/var/lib/kreatbio-portal/report-access.sqlite` on the VPS.
- `REPORT_ACCESS_MAX_OPENINGS`: default opening limit, set to `30`.
- `REPORT_ACCESS_DAYS`: default access duration, set to `60`.
- `CHAT_TOKEN_LIMIT`: allowance assigned to new reports, defaults to 100000 lifetime tokens.
- `CHAT_MAX_OUTPUT_TOKENS`: maximum tokens in one assistant answer, defaults to 1000.
- `CHAT_RESERVATION_TTL_SECONDS`: recovery time for interrupted requests, defaults to 900.
- `PORTAL_ORIGIN`: static website origin for CORS, comma-separated if you serve both apex and `www`, or `*` during early testing.
- `PORTAL_API_BASE`: optional explicit public API origin. Leave unset when clients open the portal from this backend, because the server injects its own request origin into `client-portal.html`.

## Avoiding API Configuration Errors

Use the backend URL as the client-facing portal URL, for example:

```text
https://YOUR-PORTAL-BACKEND/client-portal.html
```

The backend injects the correct API origin into `client-portal.html` at request time. Local `file://` opens default to `http://localhost:8080` for development. Do not publish the standalone repository HTML file unless you also set `window.KREATBIO_PORTAL_API` in the `portal-config` script block or append `?api=https://YOUR-PORTAL-BACKEND` once.

## Report Q&A Context

After the authorized report tables finish loading, the portal constructs a temporary structured context from the parsed report dataset. The context covers every hydrated result section and is sent only with the current chat request; it is not written back to GCS.

The backend validates a signed chat session, report code, context schema, allowed sections, history length, and payload size before calling Gemini. Report questions use only the supplied report evidence plus stable explanatory knowledge. Related biology and genomics questions can enable Gemini Google Search grounding and return web citations. Unrelated general web questions are declined. Search grounding has separate Gemini API allowances and may incur tool charges after the applicable quota.

Each approved report shares a lifetime 100,000-token allowance. The server counts the complete Gemini request before generation, reserves the maximum permitted request atomically, and reconciles it with Gemini's returned total usage. The SQLite ledger persists across service restarts. Report codes are stored as keyed hashes rather than plaintext. The bundled public example does not expose the chatbot.

## Chat Allowance Administration

Provision a report when it is released. Run these commands as the `kreatbio-portal` service user so the command uses the same database and secret as the service:

```bash
sudo -u kreatbio-portal env \
  CHAT_QUOTA_DB=/var/lib/kreatbio-portal/chat-quota.sqlite \
  SESSION_SECRET_FILE=/etc/kreatbio-portal/session-secret \
  npm run quota -- add 120000000
```

The default allowance is 100000 tokens. An explicit allowance can be supplied after the code. Other operations are:

```bash
npm run quota -- status REPORT_CODE
npm run quota -- increase REPORT_CODE TOKENS
npm run quota -- disable REPORT_CODE
npm run quota -- enable REPORT_CODE
npm run quota -- reset REPORT_CODE
```

`increase` adds tokens to the lifetime limit. `reset` deliberately clears recorded usage while retaining the current limit. There is no public administration endpoint.

## Report Access Administration

Activate each released report on the VPS. The default window is 30 successful openings over 60 days:

```bash
sudo -u kreatbio-portal env \
  REPORT_ACCESS_DB=/var/lib/kreatbio-portal/report-access.sqlite \
  SESSION_SECRET_FILE=/etc/kreatbio-portal/session-secret \
  npm run access -- add 120000000
```

Use `status`, `disable`, `enable`, or `reset` for administration. `reset` starts a fresh 60-day window and clears the opening count. Report codes are stored as keyed hashes, not plaintext.

## GCS Layout

Each client gets one 9-character alphanumeric folder. With `GCS_CLIENT_PREFIX=clients26`:

```text
gs://koda123/clients26/000000001/
  manifest.json (optional)
  output/report.pdf
  output/o1_qc/
  output/o2_taxonomy_qiime2_silva/
  output/o3_taxonomy_emu_species/
  output/o4_diversity/
  output/o5_functional_prediction_picrust2/
  output/o6_figures/
  output/o7_run_metadata/
```

The backend only serves files listed in that folder's `manifest.json`. If no manifest exists, it can infer an amplicon portal from known public `output/` files plus `input_data/metadata.tsv` and still hides raw FASTQ, logs, and intermediate files by default.

## Local Check

```bash
npm install
npm run check
npm test
PORT=8080 GCS_BUCKET=YOUR_BUCKET SESSION_SECRET=change-this-long-secret npm start
```

Real GCS test folder:

```bash
PORT=8080 \
GCS_BUCKET=koda123 \
GCS_CLIENT_PREFIX=clients26 \
GCS_ACCESS_TOKEN="$(gcloud auth print-access-token)" \
SESSION_SECRET=local-dev-secret-with-more-than-32-chars \
npm start
```

Open:

```text
http://localhost:8080/client-portal.html
```

Then enter:

```text
000000001
```

## Deployment

The production API runs on the existing Hostinger VPS. From the repository root:

```bash
bash deploy.sh
```

The script checks the portal, deploys backend changes to the VPS, updates Nginx, pushes GitHub Pages, and verifies both public endpoints. GCS stays private; browsers receive 30-minute signed links only after the VPS approves the report code.
