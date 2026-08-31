# KreatBio Client Portal Backend

The client portal uses four small components:

- **GitHub Pages** serves `https://kreatbio.com/client-portal`.
- **Cloud Run** validates report codes, enforces the access window, reads private report files from GCS, and returns short-lived signed file links.
- **Hostinger VPS** handles GPT-5.6 Luna chat and its per-report token allowance.
- **GCS** stores private reports under `clients26/` and access records under `_portal_state/report-access/`.

The browser never receives a permanent GCS credential. Report files remain private.

## Normal Workflow

Deploy portal changes from the repository root:

```bash
bash deploy.sh
```

The script runs checks, commits only portal-related files, deploys changed backend code to Cloud Run and Hostinger, pushes GitHub Pages, and verifies all three public endpoints.

Activate a newly released report:

```bash
bash activate-report.sh 120000000
```

This enables the default 30 portal openings for 60 days and a 100,000-token lifetime chat allowance. Optional custom values are accepted in this order:

```bash
bash activate-report.sh REPORT_CODE OPENINGS DAYS CHAT_TOKENS
```

Running the command again does not reset existing usage or extend an existing expiry. That avoids accidentally giving a report a fresh allowance.

## Authentication

`deploy.sh` and `activate-report.sh` use your normal `gcloud` login and the existing SSH access to the VPS. If Google asks you to sign in, run:

```bash
gcloud auth login
gcloud config set project project-045c22a7-6787-403c-8c6
```

For a separate gcloud configuration, set `KREATBIO_GCLOUD_CONFIG` before running either script.

Cloud Run uses the service account `kreatbio-portal-vps@project-045c22a7-6787-403c-8c6.iam.gserviceaccount.com`. It has read access to reports, limited write access to the access-record prefix, and permission to create temporary signed links. No downloaded service-account key or HMAC key is needed.

## Report Access

One private JSON record per report is stored at:

```text
gs://koda123/_portal_state/report-access/REPORT_CODE.json
```

Cloud Run updates the opening count atomically, so simultaneous requests cannot bypass the limit. A successful new session counts as one opening. Loading charts and files within that session does not consume another opening. Signed links expire after 30 minutes or at the report expiry, whichever comes first.

The public portal currently calls:

```text
https://kreatbio-report-api-716768606050.asia-southeast1.run.app
```

Only requests from `https://kreatbio.com` and `https://www.kreatbio.com` are accepted for new report sessions.

## Chat Allowance

The VPS stores chat usage in `/var/lib/kreatbio-portal/chat-quota.sqlite`. Each activated report receives 100,000 lifetime OpenAI tokens by default. The limit covers input context, conversation history, reasoning, web-search context, and model output.

Administrative commands run on the VPS as the service user:

```bash
sudo -u kreatbio-portal env \
  CHAT_QUOTA_DB=/var/lib/kreatbio-portal/chat-quota.sqlite \
  SESSION_SECRET_FILE=/etc/kreatbio-portal/session-secret \
  npm run quota -- status REPORT_CODE
```

Other supported operations are `add`, `increase`, `disable`, `enable`, and `reset`. There is no public administration endpoint.

## Report Q&A Context

After report tables load, the portal builds structured context from the data already available to that report. It includes chart titles, values, statistical results, interpretations, and tables—not only chart images. The context is sent with the current question and is not written back to GCS.

GPT-5.6 Luna must answer report questions from the supplied evidence. Related biology or genomics questions may use OpenAI web search and return citations. Unrelated general web questions are declined.

## GCS Report Layout

Each client has one 9-digit folder. The first two digits identify the assay:

```text
gs://koda123/clients26/120000000/
  manifest.json (optional)
  input_data/metadata.tsv
  output/report.pdf
  output/o1_qc/
  output/o2_taxonomy_qiime2_silva/
  output/o3_taxonomy_emu_species/
  output/o4_diversity/
  output/o5_functional_prediction_picrust2/
  output/o6_figures/
  output/o7_run_metadata/
```

If `manifest.json` is absent, the backend infers supported portal files from the known output layout. Raw FASTQ files, logs, and intermediate files are excluded by default.

## Service Configuration

Cloud Run's non-secret settings are in `deploy/cloud-run/env.yaml`. Its session secret is stored in Secret Manager as `kreatbio-report-session-secret`.

The Hostinger service files are in `deploy/hostinger/`. Its runtime secret and OpenAI key remain on the VPS under `/etc/kreatbio-portal/` and are never committed. Store the API key in `/etc/kreatbio-portal/openai-api-key` with permissions restricted to the service account.

Before the first OpenAI-backed deployment, install the key on the VPS from a secure local file:

```bash
sudo install -o root -g kreatbio-portal -m 0640 /secure/path/openai-api-key /etc/kreatbio-portal/openai-api-key
```

`deploy.sh` stops before restarting the chatbot when that secret file is absent or empty.

Important Cloud Run variables:

- `GCS_BUCKET` and `GCS_CLIENT_PREFIX`: private report location.
- `REPORT_ACCESS_GCS_PREFIX`: private access-record location.
- `REPORT_ACCESS_MAX_OPENINGS` and `REPORT_ACCESS_DAYS`: defaults used when provisioning records.
- `GCS_SIGNED_URL_TTL_SECONDS`: temporary file-link lifetime.
- `PORTAL_ORIGIN`: allowed browser origins.
- `SESSION_SECRET`: supplied from Secret Manager.

Important Hostinger variables:

- `OPENAI_MODEL`: OpenAI model name; defaults to `gpt-5.6-luna`.
- `OPENAI_REASONING_EFFORT`: reasoning level; defaults to `low` for interactive latency and cost.
- `CHAT_CONTEXT_LIMIT`: maximum structured report context size.
- `CHAT_TOKEN_LIMIT`: default lifetime allowance for a new report.
- `CHAT_MAX_OUTPUT_TOKENS`: maximum output for one answer.
- `CHAT_QUOTA_DB`: persistent SQLite quota ledger.

## Local Checks

```bash
cd portal-backend
npm install
npm run check
npm test
```

For a real local GCS test, use a short-lived user access token:

```bash
PORT=8080 \
GCS_BUCKET=koda123 \
GCS_CLIENT_PREFIX=clients26 \
GCS_ACCESS_TOKEN="$(gcloud auth print-access-token)" \
SESSION_SECRET=local-dev-secret-with-more-than-32-chars \
npm start
```

Short-lived user tokens are for local testing only. Production uses Cloud Run's service identity.
