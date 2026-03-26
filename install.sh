#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to install Optimus." >&2
  exit 1
fi

exec node "$ROOT_DIR/bin/optimus.mjs" install-user
