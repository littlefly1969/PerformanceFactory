#!/usr/bin/env bash
# Usage: prune-ghcr-versions.sh OWNER PACKAGE KEEP
# Deletes every version of a ghcr.io container package except the KEEP most
# recent ones. Requires GH_TOKEN with packages:write.
set -euo pipefail

owner="$1"
package="$2"
keep="$3"

case "$keep" in
  '' | *[!0-9]*) echo "KEEP must be a positive integer, got: $keep" >&2; exit 2 ;;
esac
if [ "$keep" -lt 1 ]; then
  echo "KEEP must be at least 1." >&2
  exit 2
fi

# The repository owner can be a user or an organization.
base="/users/$owner/packages/container/$package"
if ! gh api "$base" >/dev/null 2>&1; then
  base="/orgs/$owner/packages/container/$package"
fi

ids="$(gh api --paginate "$base/versions?per_page=100" \
  --jq '.[] | [.created_at, (.id | tostring)] | @tsv' |
  sort -r | cut -f2 | tail -n +"$((keep + 1))")"

if [ -z "$ids" ]; then
  echo "$package: nothing to delete (keeping $keep)."
  exit 0
fi

for id in $ids; do
  echo "$package: deleting version $id"
  gh api --method DELETE "$base/versions/$id" >/dev/null
done
