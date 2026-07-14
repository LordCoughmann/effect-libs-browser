#!/usr/bin/env bash
# Sync the vendored @cloudflare/playwright source to a new upstream version.
#
# Replaces lib/, *.d.ts, and types/ from the upstream npm tarball into this
# repo. Skips package.json, README.md, LICENSE, NOTICE — those are
# fork-owned and preserved. After running this, manually re-apply the
# four patches documented in patches/CHECKLIST.md.
#
# Usage:
#   scripts/sync-upstream.sh <new-version>
# Example:
#   scripts/sync-upstream.sh 1.4.0
#
# Modeled on cloudflare/playwright's browser_patches/roll_from_upstream.sh:
# fetch → validate → rsync a hardcoded path list → remind the human.
#
# Out of scope (humans only):
#   - Re-applying the 4 patches (see patches/CHECKLIST.md)
#   - Bumping the fork's own 0.x version in package.json
#   - Updating README "currently tracking" line
#   - Running integration tests (verify in the monorepo root from here)
#   - Committing / pushing / opening PRs

set -euo pipefail

NEW="${1:?usage: $0 <new-version>}"
OLD="$(cat patches/BASE_VERSION)"
WORK="$(mktemp -d)"
TARBALL="@cloudflare/playwright@${NEW}"

# Resolve to this package's directory regardless of where the script is
# invoked from. The fork now lives inside the @effect-libs/browser monorepo
# at packages/cloudflare-playwright/, so the upstream sync operates on
# files relative to that directory.
cd "$(git rev-parse --show-toplevel)/packages/cloudflare-playwright"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "→ Fetching ${TARBALL} (was ${OLD})..."
npm pack "$TARBALL" --pack-destination="$WORK" >/dev/null
# npm pack names the file <name>-<version>.tgz. The package name has a
# scope so the file is e.g. cloudflare-playwright-1.4.0.tgz.
TAR_FILE="$(ls "$WORK"/*.tgz | head -1)"
tar -xzf "$TAR_FILE" -C "$WORK"
SRC="$WORK/package"

# Sanity check: looks like @cloudflare/playwright, not some other tarball.
if [[ ! -f "$SRC/index.d.ts" || ! -d "$SRC/lib/playwright-core" ]]; then
  echo "ERROR: tarball doesn't look like @cloudflare/playwright" >&2
  echo "  expected $SRC/index.d.ts and $SRC/lib/playwright-core to exist" >&2
  exit 1
fi

# Replace the vendored paths. The exclusion list keeps fork-owned files:
# package.json (fork name/version/exports/files), README.md, LICENSE, NOTICE.
# --delete on directories so upstream file removals propagate.
rsync -av --delete \
  --exclude='package.json' \
  --exclude='README.md' \
  --exclude='LICENSE' \
  --exclude='NOTICE' \
  "$SRC/lib/" ./lib/
rsync -av \
  "$SRC/index.d.ts" \
  "$SRC/internal.d.ts" \
  "$SRC/test.d.ts" \
  ./
rsync -av --delete "$SRC/types/" ./types/

echo
echo "✓ Vendored files updated to upstream@${NEW}."
echo
echo "Next steps:"
echo "  1. Re-apply the 4 patches:"
echo "       cat patches/CHECKLIST.md"
echo "  2. Update the tracking version:"
echo "       echo ${NEW} > patches/BASE_VERSION"
echo "  3. Bump 0.x version in package.json (fork is on its own semver)."
echo "  4. Update '🏷️ Upstream Playwright version:' line in README.md."
echo "  5. Verify in the consumer monorepo:"
echo "       cd ../../ && pnpm install && pnpm test:integration --runtime node -t 'playwright'"
echo "  6. Commit:"
echo "       git add -A && git commit -m 'chore: sync upstream @cloudflare/playwright@${NEW}'"