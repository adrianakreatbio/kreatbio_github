#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$repo_root/portal-backend"
vps_host="root@72.62.252.76"
vps_app_dir="/opt/kreatbio-portal"
release_id="$(date -u +%Y%m%d-%H%M%S)"
remote_stage="/tmp/kreatbio-portal-deploy-$release_id"
commit_message="${1:-Deploy client portal}"

fail() {
  printf 'Deploy failed: %s\n' "$1" >&2
  exit 1
}

command -v git >/dev/null || fail "git is not installed."
command -v npm >/dev/null || fail "npm is not installed."
command -v node >/dev/null || fail "node is not installed."
command -v ssh >/dev/null || fail "ssh is not installed."
command -v scp >/dev/null || fail "scp is not installed."
command -v curl >/dev/null || fail "curl is not installed."

cd "$repo_root"
branch="$(git branch --show-current)"
[[ "$branch" == "master" ]] || fail "switch to the master branch first."

printf '\nPortal changes to deploy:\n'
git status --short -- client-portal.html client_supplements portal-backend deploy.sh
printf '\nThis will update the Hostinger chatbot backend when needed and push GitHub Pages.\n'
read -r -p 'Continue? [y/N] ' answer
[[ "$answer" =~ ^[Yy]$ ]] || fail "cancelled."

printf '\nRunning checks...\n'
git diff --check
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

git add -- client-portal.html client_supplements portal-backend deploy.sh
if ! git diff --cached --quiet; then
  git commit -m "$commit_message"
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
  printf '\nDeploying chatbot backend to Hostinger...\n'
  runtime_files=("$backend_dir"/*.js "$backend_dir"/package.json "$backend_dir"/package-lock.json)
  ssh "$vps_host" "install -d -m 700 '$remote_stage'"
  scp "${runtime_files[@]}" "$backend_dir/deploy/hostinger/kreatbio-portal.service" "$vps_host:$remote_stage/"
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

rollback() {
  printf 'Backend deployment failed; restoring %s.\n' "$backup_dir" >&2
  install -m 0644 "$backup_dir"/*.js "$backup_dir"/package.json "$backup_dir"/package-lock.json "$vps_app_dir/"
  if [[ -e "$backup_dir/kreatbio-portal.service" ]]; then
    install -m 0644 "$backup_dir/kreatbio-portal.service" /etc/systemd/system/kreatbio-portal.service
  fi
  cd "$vps_app_dir"
  npm ci --omit=dev >/dev/null
  systemctl daemon-reload
  systemctl restart kreatbio-portal
}
trap rollback ERR

install -m 0644 "$remote_stage"/*.js "$remote_stage"/package.json "$remote_stage"/package-lock.json "$vps_app_dir/"
cd "$vps_app_dir"
npm ci --omit=dev
install -m 0644 "$remote_stage/kreatbio-portal.service" /etc/systemd/system/kreatbio-portal.service
systemctl daemon-reload
systemctl restart kreatbio-portal
systemctl is-active --quiet kreatbio-portal
curl -fsS http://127.0.0.1:8080/healthz >/dev/null
printf '%s\n' "$release_commit" > "$vps_app_dir/.deployed-git-commit"
trap - ERR
REMOTE
else
  printf '\nBackend is unchanged; skipping the VPS restart.\n'
fi

printf '\nPublishing GitHub Pages...\n'
git push origin master

printf '\nVerifying public services...\n'
curl --retry 5 --retry-all-errors -fsS https://portal-api.kreatbio.com/healthz >/dev/null
curl --retry 5 --retry-all-errors -fsS https://kreatbio.com/client-portal >/dev/null

printf '\nDeployment complete.\n'
printf 'Portal: https://kreatbio.com/client-portal\n'
printf 'Commit: %s\n' "$release_commit"
