#!/usr/bin/env bash
# Build the release zip and verify the folder/zip layout.
# No `zip` binary on this machine: python3's zipfile CLI is used for build + listing.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(sed -n 's/^## Version: //p' QuickBinds/QuickBinds.toc)"
if [ -z "$VERSION" ]; then
    echo "package.sh: ## Version missing from QuickBinds/QuickBinds.toc" >&2
    exit 1
fi

mkdir -p dist
ZIP="dist/QuickBinds-v${VERSION}.zip"
rm -f "$ZIP"
python3 -m zipfile -c "$ZIP" QuickBinds/

node tools/check-package.mjs "$ZIP"
echo "packaged: $ZIP"
