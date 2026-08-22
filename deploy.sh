#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$repo_root/portal-backend"
vps_host="root@72.62.252.76"
vps_app_dir="/opt/kreatbio-portal"
gcp_project="project-045c22a7-6787-403c-8c6"
cloud_run_region="asia-southeast1"
cloud_run_service="kreatbio-report-api"
cloud_run_service_account="kreatbio-portal-vps@$gcp_project.iam.gserviceaccount.com"
artifact_image="$cloud_run_region-docker.pkg.dev/$gcp_project/kreatbio/portal-report-api"
report_api_url="https://kreatbio-report-api-716768606050.asia-southeast1.run.app"
release_id="$(date -u +%Y%m%d-%H%M%S)"
remote_stage="/tmp/kreatbio-portal-deploy-$release_id"
commit_message="${1:-Deploy client portal}"

fail() {
  printf 'Deploy failed: %s\n' "$1" >&2
  exit 1
}

for command in git npm node ssh scp curl gcloud; do
  command -v "$command" >/dev/null || fail "$command is not installed."
done

if [[ -n "${KREATBIO_GCLOUD_CONFIG:-}" ]]; then
  export CLOUDSDK_CONFIG="$KREATBIO_GCLOUD_CONFIG"
fi

cd "$repo_root"
branch="$(git branch --show-current)"
[[ "$branch" == "master" ]] || fail "switch to the master branch first."

printf '\nPortal changes to deploy:\n'
git status --short -- client-portal.html client_supplements portal-backend deploy.sh activate-report.sh
printf '\nThis updates the report API, chatbot API, and GitHub Pages when needed.\n'
read -r -p 'Continue? [y/N] ' answer
[[ "$answer" =~ ^[Yy]$ ]] || fail "cancelled."

printf '\nRunning checks...\n'
git diff --check -- client-portal.html client_supplements portal-backend deploy.sh activate-report.sh
(
  cd "$backend_dir"
  npm run check
  npm test
)
node - "$repo_root/client-portal.html" <<'NODE'
const fs = require("node:fs");
const html = fs.readFileSync(process.argv[2], "utf8");
let count = 0;
for (const part of html.split("<script").slice(1)) {
  const start = part.indexOf(">");
  const end = part.indexOf("</script>");
  if (start >= 0 && end > start) {
    new Function(part.slice(start + 1, end));
    count += 1;
  }
}
console.log(`Portal JavaScript check passed (${count} inline scripts).`);
NODE

git add -- client-portal.html client_supplements portal-backend deploy.sh activate-report.sh
if ! git diff --cached --quiet -- client-portal.html client_supplements portal-backend deploy.sh activate-report.sh; then
  git commit -m "$commit_message" -- client-portal.html client_supplements portal-backend deploy.sh activate-report.sh
fi
release_commit="$(git rev-parse HEAD)"

remote_commit="$(ssh "$vps_host" "test -f '$vps_app_dir/.deployed-git-commit' && cat '$vps_app_dir/.deployed-git-commit' || true")"
deploy_backend=true
if [[ -n "$remote_commit" ]] && git cat-file -e "$remote_commit^{commit}" 2>/dev/null; then
  if git diff --quiet "$remote_commit" "$release_commit" -- portal-backend; then
    deploy_backend=false
  fi
fi

if [[ "$deploy_backend" == true ]]; then
  image="$artifact_image:$release_commit"
  printf '\nDeploying private-report API to Cloud Run...\n'
  gcloud builds submit "$backend_dir" \
    --project "$gcp_project" \
    --tag "$image" \
    --quiet
  gcloud run deploy "$cloud_run_service" \
    --project "$gcp_project" \
    --region "$cloud_run_region" \
    --platform managed \
    --image "$image" \
    --service-account "$cloud_run_service_account" \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 1 \
    --cpu 1 \
    --memory 512Mi \
    --concurrency 20 \
    --cpu-throttling \
    --env-vars-file "$backend_dir/deploy/cloud-run/env.yaml" \
    --set-secrets SESSION_SECRET=kreatbio-report-session-secret:latest \
    --quiet
  curl --retry 8 --retry-all-errors -fsS "$report_api_url/api/health" >/dev/null

  printf '\nDeploying chatbot API to Hostinger...\n'
  runtime_files=("$backend_dir"/*.js "$backend_dir"/package.json "$backend_dir"/package-lock.json)
  ssh "$vps_host" "install -d -m 700 '$remote_stage'"
  scp "${runtime_files[@]}" \
    "$backend_dir/deploy/hostinger/kreatbio-portal.service" \
    "$backend_dir/deploy/hostinger/portal-api.kreatbio.com.nginx" \
    "$vps_host:$remote_stage/"
  ssh "$vps_host" bash -s -- "$remote_stage" "$vps_app_dir" "$release_id" "$release_commit" <<'REMOTE'
set -Eeuo pipefail
remote_stage="$1"
vps_app_dir="$2"
release_id="$3"
release_commit="$4"
backup_dir="/opt/kreatbio-portal-backups/$release_id"

install -d -m 700 "$backup_dir"
for file in "$vps_app_dir"/*.js "$vps_app_dir"/package.json "$vps_app_dir"/package-lock.json; do
  [[ -e "$file" ]] && cp -a "$file" "$backup_dir/"
done
[[ -e /etc/systemd/system/kreatbio-portal.service ]] && cp -a /etc/systemd/system/kreatbio-portal.service "$backup_dir/"
[[ -e /etc/nginx/sites-available/portal-api.kreatbio.com ]] && cp -a /etc/nginx/sites-available/portal-api.kreatbio.com "$backup_dir/portal-api.available"
[[ -e /etc/nginx/sites-enabled/portal-api.kreatbio.com ]] && cp -a /etc/nginx/sites-enabled/portal-api.kreatbio.com "$backup_dir/portal-api.enabled"

rollback() {
  printf 'Chatbot deployment failed; restoring %s.\n' "$backup_dir" >&2
  install -m 0644 "$backup_dir"/*.js "$backup_dir"/package.json "$backup_dir"/package-lock.json "$vps_app_dir/"
  if [[ -e "$backup_dir/kreatbio-portal.service" ]]; then
    install -m 0644 "$backup_dir/kreatbio-portal.service" /etc/systemd/system/kreatbio-portal.service
  fi
  [[ -e "$backup_dir/portal-api.available" ]] && install -m 0644 "$backup_dir/portal-api.available" /etc/nginx/sites-available/portal-api.kreatbio.com
  [[ -e "$backup_dir/portal-api.enabled" ]] && install -m 0644 "$backup_dir/portal-api.enabled" /etc/nginx/sites-enabled/portal-api.kreatbio.com
  cd "$vps_app_dir"
  npm ci --omit=dev >/dev/null
  systemctl daemon-reload
  systemctl restart kreatbio-portal
  nginx -t >/dev/null
  systemctl reload nginx
}
trap rollback ERR

install -m 0644 "$remote_stage"/*.js "$remote_stage"/package.json "$remote_stage"/package-lock.json "$vps_app_dir/"
cd "$vps_app_dir"
npm ci --omit=dev
install -m 0644 "$remote_stage/kreatbio-portal.service" /etc/systemd/system/kreatbio-portal.service
install -m 0644 "$remote_stage/portal-api.kreatbio.com.nginx" /etc/nginx/sites-available/portal-api.kreatbio.com
install -m 0644 "$remote_stage/portal-api.kreatbio.com.nginx" /etc/nginx/sites-enabled/portal-api.kreatbio.com
systemctl daemon-reload
systemctl restart kreatbio-portal
systemctl is-active --quiet kreatbio-portal
curl -fsS http://127.0.0.1:8080/healthz >/dev/null
nginx -t
systemctl reload nginx
printf '%s\n' "$release_commit" > "$vps_app_dir/.deployed-git-commit"
trap - ERR
REMOTE
else
  printf '\nBackend is unchanged; skipping Cloud Run and VPS deployment.\n'
fi

printf '\nPublishing GitHub Pages...\n'
git push origin master

printf '\nVerifying live services...\n'
curl --retry 8 --retry-all-errors -fsS "$report_api_url/api/health" >/dev/null
curl --retry 5 --retry-all-errors -fsS https://portal-api.kreatbio.com/healthz >/dev/null
curl --retry 5 --retry-all-errors -fsS https://kreatbio.com/client-portal >/dev/null

printf '\nDeployment complete.\n'
printf 'Portal: https://kreatbio.com/client-portal\n'
printf 'Commit: %s\n' "$release_commit"
