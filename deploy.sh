#!/usr/bin/env bash
# Build and deploy to the existing new.vlang.io service. No database migrations.
set -euo pipefail
site_dir="$(cd "$(dirname "$0")" && pwd)"
traffic_parent="${TRAFFIC_MODULE_PARENT:-$(dirname "$site_dir")}"
remote_host="${DEPLOY_HOST:-vlang}"
remote_dir="/var/www/new.vlang.io"
release_id="$(date -u +%Y%m%d-%H%M%S)"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/newvlang-release.XXXXXX")"
trap 'rm -rf "$build_dir"' EXIT
ssh_options=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15)

# Compile locally so the web server only needs to install the release.
v -old-compiler -path "$traffic_parent|@vlib|@vmodules" \
  -os linux -arch amd64 -prod -cflags '-fno-lto' \
  -o "$build_dir/website2_v" "$site_dir"
cp -R "$site_dir/static" "$site_dir/translations" "$site_dir/templates" "$build_dir/"
cp "$site_dir/main.v" "$site_dir/index.html" "$site_dir/v.mod" "$build_dir/"
ssh "${ssh_options[@]}" "$remote_host" "test -d '$remote_dir' && systemctl is-active --quiet newvlang && mkdir -p '$remote_dir/.release-$release_id'"
rsync -az --timeout=60 -e 'ssh -o BatchMode=yes -o ConnectTimeout=15' \
  "$build_dir/" "$remote_host:$remote_dir/.release-$release_id/"

ssh "${ssh_options[@]}" "$remote_host" bash -s -- "$remote_dir" "$release_id" <<'REMOTE'
set -euo pipefail
site_dir="$1"
release_id="$2"
cd "$site_dir"
backup="/var/backups/newvlang-$release_id.tar.gz"
mkdir -p /var/backups
tar -czf "$backup" website2_v static translations templates main.v index.html v.mod
rollback() {
  echo "Release health check failed; restoring $backup" >&2
  systemctl stop newvlang || true
  tar -xzf "$backup"
  systemctl start newvlang
}
trap rollback ERR
cp -a ".release-$release_id/static/." static/
cp -a ".release-$release_id/translations/." translations/
cp -a ".release-$release_id/templates/." templates/
cp ".release-$release_id/main.v" ".release-$release_id/index.html" ".release-$release_id/v.mod" .
mv ".release-$release_id/website2_v" website2_v.next
chmod 755 website2_v.next
mv -f website2_v.next website2_v
systemctl restart newvlang
echo 'Checking local homepage'
timeout 20 bash -c 'until curl --fail --silent http://127.0.0.1:8082/ >/dev/null; do sleep 1; done'
curl --fail --silent http://127.0.0.1:8082/ -o ".release-$release_id/health.html"
grep -q 'Less complexity' ".release-$release_id/health.html"
echo 'Checking comparison page'
curl --fail --silent http://127.0.0.1:8082/compare >/dev/null
echo 'Checking legacy statistics endpoint'
curl --fail --silent -H 'Host: vlang.io' http://127.0.0.1/stats228 >/dev/null
systemctl is-active --quiet newvlang
trap - ERR
rm -rf ".release-$release_id"
echo "Deployed new.vlang.io. Rollback backup: $backup"
REMOTE
curl --fail --silent --show-error https://new.vlang.io/ -o "$build_dir/live.html"
if ! grep -q 'Less complexity' "$build_dir/live.html"; then
  echo 'The origin is healthy, but the public homepage is not serving the release yet.' >&2
  exit 1
fi
echo 'Verified https://new.vlang.io/'
