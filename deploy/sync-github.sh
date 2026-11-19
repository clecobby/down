#!/usr/bin/env bash
# Copy every branch from GitHub (where everyone pushes) to CodeCommit (which triggers the AWS pipelines).
#   deploy/sync-github.sh            # all branches
#   deploy/sync-github.sh dev        # just one (or several) branches
# Pushing to CodeCommit then starts:  main → down-prod (deploy production)
#                                     dev  → down-dev  (deploy dev)
#                                     any other branch → down-checks (tests only)
# Never forces: if CodeCommit has commits GitHub doesn't, that branch is skipped and reported.
set -euo pipefail
cd "$(dirname "$0")/.."
git remote get-url github >/dev/null 2>&1 || git remote add github https://github.com/clecobby/down.git

git fetch --prune github
git fetch --prune origin

branches=("$@")
if [ ${#branches[@]} -eq 0 ]; then
  while IFS= read -r b; do branches+=("$b"); done < <(git for-each-ref --format='%(refname:lstrip=3)' refs/remotes/github | grep -v '^HEAD$')
fi

failed=()
for b in "${branches[@]}"; do
  gh=$(git rev-parse -q --verify "refs/remotes/github/$b") || { echo "?  $b: not on GitHub"; continue; }
  cc=$(git rev-parse -q --verify "refs/remotes/origin/$b" || true)
  if [ "$gh" = "$cc" ]; then echo "=  $b: already up to date"; continue; fi
  if [ -n "$cc" ] && ! git merge-base --is-ancestor "$cc" "$gh"; then
    echo "!  $b: CodeCommit has commits that aren't on GitHub — push those to GitHub first"; failed+=("$b"); continue
  fi
  git push -q origin "refs/remotes/github/$b:refs/heads/$b"
  echo "↑  $b: ${cc:0:7}${cc:+ → }${gh:0:7}"
  # keep the local branch in step if it's simply behind (and not checked out with changes)
  if git rev-parse -q --verify "refs/heads/$b" >/dev/null && git merge-base --is-ancestor "refs/heads/$b" "$gh"; then
    if [ "$(git branch --show-current)" = "$b" ]; then git merge -q --ff-only "$gh" 2>/dev/null || true
    else git update-ref "refs/heads/$b" "$gh"; fi
  fi
done

[ ${#failed[@]} -eq 0 ] || { echo "Not synced: ${failed[*]}"; exit 1; }
