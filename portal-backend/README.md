# KreatBio Client Portal Backend

Cloud Run API for `client-portal.html`.

## Required Environment

- `GCS_BUCKET`: Google Cloud Storage bucket containing report folders.
- `GCS_CLIENT_PREFIX`: optional parent folder for client code folders, for example `clients26`.
- `GCS_ACCESS_TOKEN`: optional short-lived local test token from `gcloud auth print-access-token`; do not use in production.
- `SESSION_SECRET`: random secret with at least 32 characters.
- `GEMINI_API_KEY`: optional; enables the bottom-right report chat.
- `GEMINI_MODEL`: optional, defaults to `gemini-3.5-flash-lite`.
- `CHAT_CONTEXT_LIMIT`: optional maximum validated browser-generated report context in bytes, defaults to 81920.
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

The backend validates the report code, context schema, allowed sections, history length, and payload size before calling Gemini. Report questions use only the supplied report evidence plus stable explanatory knowledge. Related biology and genomics questions can enable Gemini Google Search grounding and return web citations. Unrelated general web questions are declined. Search grounding has separate Gemini API allowances and may incur tool charges after the applicable quota.

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

## Cloud Run Build

Run from the repository root:

```bash
gcloud builds submit --config portal-backend/cloudbuild.yaml .
```

Deploy:

```bash
gcloud run deploy kreatbio-client-portal \
  --image gcr.io/PROJECT_ID/kreatbio-client-portal \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars ^@^GCS_BUCKET=YOUR_BUCKET@GCS_CLIENT_PREFIX=clients26@PORTAL_ORIGIN=https://kreatbio.com,https://www.kreatbio.com \
  --set-secrets SESSION_SECRET=kreatbio-session-secret:latest,GEMINI_API_KEY=kreatbio-gemini-key:latest
```

Grant the Cloud Run service account read access to the report bucket:

```bash
gcloud storage buckets add-iam-policy-binding gs://YOUR_BUCKET \
  --member serviceAccount:SERVICE_ACCOUNT_EMAIL \
  --role roles/storage.objectViewer
```
