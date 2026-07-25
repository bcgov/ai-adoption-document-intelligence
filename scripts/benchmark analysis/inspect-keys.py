#!/usr/bin/env python3
"""
Diagnostic helper for the SDPR benchmark JSON.

Reads one benchmark JSON from a path (or stdin if path is '-') and prints
ONLY the set of keys present at each interesting nesting level. No values
are printed, so it's safe to run against share data without leaking
case-level content.

Usage:
    python inspect-keys.py /path/to/benchmark.json
    python inspect-keys.py -            # JSON on stdin (FIFO friendly)
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path


def union_keys(items: list[dict]) -> Counter:
    """Counter of how often each key appears across the dicts."""
    c: Counter = Counter()
    for item in items:
        if isinstance(item, dict):
            for k in item.keys():
                c[k] += 1
    return c


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: inspect-keys.py <path>|-", file=sys.stderr)
        return 2
    src = argv[0]
    if src == "-":
        raw = json.load(sys.stdin)
    else:
        raw = json.loads(Path(src).read_text("utf-8"))

    print("=== top-level keys ===")
    if isinstance(raw, dict):
        for k in sorted(raw.keys()):
            v = raw[k]
            kind = type(v).__name__
            n = len(v) if hasattr(v, "__len__") else "—"
            print(f"  {k}: {kind} (len={n})")
    print()

    psr = raw.get("perSampleResults") or []
    print(f"=== perSampleResults: {len(psr)} samples ===")
    if psr:
        print("  sample-level keys (with frequency):")
        for k, n in union_keys(psr).most_common():
            print(f"    {k}: {n}")
        details_all = []
        for s in psr:
            d = s.get("evaluationDetails") or []
            details_all.extend(d)
        print()
        print(f"  evaluationDetails entries: {len(details_all)} across all samples")
        if details_all:
            print("  evaluationDetails keys (with frequency):")
            for k, n in union_keys(details_all).most_common():
                print(f"    {k}: {n}")
    print()

    pfr = raw.get("perFieldResults") or []
    print(f"=== perFieldResults: {len(pfr)} fields ===")
    if pfr:
        print("  field-level keys (with frequency):")
        for k, n in union_keys(pfr).most_common():
            print(f"    {k}: {n}")
        all_errors = []
        for f in pfr:
            all_errors.extend(f.get("errors") or [])
        print()
        print(f"  errors entries: {len(all_errors)} across all fields")
        if all_errors:
            print("  errors keys (with frequency):")
            for k, n in union_keys(all_errors).most_common():
                print(f"    {k}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
