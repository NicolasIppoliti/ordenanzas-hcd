#!/usr/bin/env bash
# Commit and push data/ only, if it changed (design.md D3, load-bearing
# gotcha #5). Runs inside job 1 of .github/workflows/sync-and-deploy.yml,
# after `hcd-sync run` has written into `data/`.
#
# - `git add data/` only, never `git commit -a` -- an empty index must
#   skip the commit and exit 0, not stage unrelated working-tree drift.
# - Push uses an explicit refspec, never a bare `git push`, so the target
#   branch is never implicit.
# - Exactly one `git pull --rebase` retry on a non-fast-forward push,
#   then fail loudly (non-zero exit, no further retries).
set -euo pipefail

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add data/

if git diff --cached --quiet; then
  echo "No changes under data/; nothing to commit."
  exit 0
fi

git commit -m "chore(data): sync HCD ordinance archive"

if git push origin HEAD:main; then
  exit 0
fi

echo "Push rejected (non-fast-forward); retrying once after 'git pull --rebase'." >&2
git pull --rebase origin main
git push origin HEAD:main
