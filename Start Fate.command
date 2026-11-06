#!/bin/zsh
set -e
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 22.x (22.12+) or Node.js 24+, with npm 11.17+, then open this launcher again."
  read -r "reply?Press Return to close."
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build
fate_app_url=$(node --input-type=module -e 'import { readFileSync } from "node:fs"; const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8")); console.log(new URL(manifest.start_url || "/", "http://127.0.0.1:4173").href);')
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort &
fate_server_pid=$!
trap 'kill "$fate_server_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
echo "Keep this terminal open while serving the application. Press Control-C to stop."
for fate_attempt in {1..120}; do
  if ! kill -0 "$fate_server_pid" 2>/dev/null; then
    wait "$fate_server_pid"
    exit 1
  fi
  if curl --silent --fail "$fate_app_url" >/dev/null; then
    open "$fate_app_url"
    break
  fi
  sleep 0.25
done
wait "$fate_server_pid"
