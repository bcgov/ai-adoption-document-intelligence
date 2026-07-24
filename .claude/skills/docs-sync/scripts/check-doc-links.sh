#!/bin/bash
# Checks that every relative markdown link in docs-md/ resolves to an existing file.
# Prints "OK" or a list of dangling links (file: link). Exit 1 if any dangle.
set -e
cd "$(git rev-parse --show-toplevel)"

fail=0
while IFS= read -r -d '' f; do
  dir=$(dirname "$f")
  # extract markdown link targets: ](target)
  grep -oE '\]\([^)[:space:]]+\)' "$f" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//' | while IFS= read -r target; do
    case "$target" in
      http://*|https://*|mailto:*|\#*) continue ;;
    esac
    clean="${target%%#*}"
    clean="${clean%%\?*}"
    [ -z "$clean" ] && continue
    if [ "${clean#/}" != "$clean" ]; then
      resolved=".$clean"   # repo-root-absolute style
    else
      resolved="$dir/$clean"
    fi
    if [ ! -e "$resolved" ]; then
      echo "DANGLING $f: $target"
    fi
  done
done < <(find docs-md -name '*.md' -not -path 'docs-md/archive/*' -print0) | sort | tee /tmp/doc-link-check.out

if [ -s /tmp/doc-link-check.out ]; then
  echo "--- $(wc -l < /tmp/doc-link-check.out) dangling link(s) found"
  exit 1
else
  echo "OK: all relative links in docs-md resolve (archive/ excluded)"
fi
