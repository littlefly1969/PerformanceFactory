#!/usr/bin/env sh
set -eu

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is not available in PATH"
}

need_command node
need_command pnpm
need_command docker

NODE_VERSION="$(node --version)"
PNPM_VERSION="$(pnpm --version)"

case "$NODE_VERSION" in
  v22.*) ;;
  *) fail "Node.js must be v22.x for this repo, got $NODE_VERSION" ;;
esac

if [ "$PNPM_VERSION" != "10.28.2" ]; then
  fail "pnpm must be 10.28.2 for this repo, got $PNPM_VERSION"
fi

if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose plugin is not available"
fi

echo "Toolchain OK"
echo "node: $NODE_VERSION"
echo "pnpm: $PNPM_VERSION"
docker compose version
