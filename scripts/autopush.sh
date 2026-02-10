#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-all}"
MSG="${2:-}"
if ! command -v git >/dev/null 2>&1; then
  echo "git not found"
  exit 1
fi
if [[ "$MODE" == "all" ]]; then
  git add .
else
  git add -u
fi
STAGED=$(git diff --cached --name-only)
if [[ -z "$STAGED" ]]; then
  echo "No changes to commit."
  exit 0
fi
if [[ -z "$MSG" ]]; then
  COUNT=$(echo "$STAGED" | wc -l | tr -d ' ')
  SAMPLE=$(echo "$STAGED" | head -n 4 | tr '\n' ',' | sed 's/,$//')
  MSG="auto: update ${COUNT} file(s)"
  if [[ -n "$SAMPLE" ]]; then
    MSG+=" [$SAMPLE]"
  fi
fi
git commit -m "$MSG"
git push