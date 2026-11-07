#!/usr/bin/env bash
set -euo pipefail
# Run this script from an extracted london-cycleflow directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT/playground}"
if [ -e "$DEST/.git" ]; then
  echo "Destination already contains a Git repo. Refusing to overwrite: $DEST" >&2
  exit 1
fi
git clone https://github.com/dsi-icl/do-starter-playground.git "$DEST"
git -C "$DEST" checkout --detach f8b4690c78dc709167443d36e7d661fa4e21f2bc
cp -R "$ROOT/apps/website/src/." "$DEST/apps/website/src/"
mkdir -p "$DEST/apps/website/public/data"
cp "$ROOT/apps/website/public/data/"*.json "$DEST/apps/website/public/data/"
cp -R "$ROOT/cycleflow" "$DEST/cycleflow"
cp -R "$ROOT/tests" "$DEST/tests"
cp "$ROOT/pyproject.toml" "$ROOT/environment.yml" "$ROOT/LICENSE" "$DEST/"
echo "Official playground cloned + custom overlay installed at: $DEST"
echo "Next: cd '$DEST' && python -m pip install -e '.[dev]' && vp run dev"
