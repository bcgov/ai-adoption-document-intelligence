#!/usr/bin/env python3
"""
Re-runs each token-consuming engine on a fixed set of samples to measure
real per-page token usage across more than one sample. Captures the
`usage` block from each engine's `last-response.json` immediately after
each call (before the next overwrites it) and writes the aggregated
results to `report/data/token-usage-by-sample.csv`.

Engines covered (token-consuming only):
  E03  Content Understanding + gpt-5.2 (iterate-cu-extraction.ts)
  E04  VLM direct, gpt-5.4              (iterate-vlm-extraction.ts)
  E05  VLM + OCR hybrid, gpt-5.4        (iterate-hybrid-extraction.ts)
  E07  VLM + OCR hybrid, gpt-4o         (iterate-hybrid-extraction.ts)
  E08  VLM + OCR hybrid, gpt-5.2        (iterate-hybrid-extraction.ts)

E00 (DI custom template) and E02 (Mistral) are per-page billing only
and are skipped — their cost does not depend on token usage.

Each call costs real money. Estimate: ~$2 total at the volume below.
"""
import csv
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

REPO_ROOT = Path("/home/alstruk/GitHub/ai-adoption-document-intelligence")
TEMPORAL_DIR = REPO_ROOT / "apps" / "temporal"
RESULTS_DIR = REPO_ROOT / "experiments" / "results"
OUT_CSV = REPO_ROOT / "experiments" / "results" / "report" / "data" / "token-usage-by-sample.csv"

# (engine_code, results_subdir, script_path, deployment_arg, iteration_dir_override)
ENGINES = [
    ("E03", "03-content-understanding", "iterate-cu-extraction.ts", None, None),
    ("E04", "04-vlm-direct",            "iterate-vlm-extraction.ts", "gpt-5.4", None),
    ("E05", "05-vlm-ocr-hybrid",        "iterate-hybrid-extraction.ts", "gpt-5.4", None),
    ("E07", "07-vlm-ocr-hybrid-gpt-4o", "iterate-hybrid-extraction.ts", "gpt-4o",
     str(RESULTS_DIR / "07-vlm-ocr-hybrid-gpt-4o" / "iteration")),
    ("E08", "08-vlm-ocr-hybrid-gpt-5.2","iterate-hybrid-extraction.ts", "gpt-5.2",
     str(RESULTS_DIR / "08-vlm-ocr-hybrid-gpt-5.2" / "iteration")),
]

SAMPLES = [
    "synth-full (1)",
    "manual sample (1)",
    "1 81",
    "HR0081 (10)",
    "81 blank",
]


def extract_usage(engine_code: str, last_response_path: Path) -> dict:
    """Pulls the `usage` block out of the engine's last-response.json."""
    d = json.loads(last_response_path.read_text())
    if engine_code == "E03":
        u = d.get("usage", {})
        toks = u.get("tokens", {})
        return {
            "input_tokens": toks.get("gpt-5.2-input", 0),
            "output_tokens": toks.get("gpt-5.2-output", 0),
            "cached_tokens": 0,
            "document_pages_standard": u.get("documentPagesStandard", 0),
            "contextualization_tokens": u.get("contextualizationTokens", 0),
        }
    # E04 / E05 / E07 / E08 — Azure OpenAI chat-completion usage shape
    u = d.get("usage", {})
    return {
        "input_tokens": u.get("prompt_tokens", 0),
        "output_tokens": u.get("completion_tokens", 0),
        "cached_tokens": (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0),
        "document_pages_standard": 0,
        "contextualization_tokens": 0,
    }


def run_one(engine_code, results_subdir, script, deployment, iteration_dir, sample):
    last_response = RESULTS_DIR / results_subdir / "iteration" / "last-response.json"
    cmd = [
        "npx", "tsx", "-r", "tsconfig-paths/register",
        f"src/scripts/{script}", sample,
    ]
    if deployment:
        cmd.append(deployment)
    env = os.environ.copy()
    if iteration_dir:
        env["ITERATION_DIR"] = iteration_dir
    t0 = time.time()
    proc = subprocess.run(
        cmd, cwd=TEMPORAL_DIR, env=env,
        capture_output=True, text=True, timeout=600,
    )
    elapsed = time.time() - t0
    if proc.returncode != 0:
        print(f"  FAIL {engine_code}/{sample!r} (exit {proc.returncode})")
        print(proc.stderr[-2000:])
        return None
    if not last_response.exists():
        print(f"  FAIL {engine_code}/{sample!r}: no last-response.json")
        return None
    usage = extract_usage(engine_code, last_response)
    usage["wallclock_s"] = round(elapsed, 1)
    return usage


def main():
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    fieldnames = [
        "engine", "sample", "input_tokens", "output_tokens", "cached_tokens",
        "document_pages_standard", "contextualization_tokens", "wallclock_s",
    ]
    print(f"Running {len(ENGINES)} engines × {len(SAMPLES)} samples = {len(ENGINES) * len(SAMPLES)} calls")
    print(f"Writing CSV to: {OUT_CSV}\n")
    for engine_code, subdir, script, deployment, it_dir in ENGINES:
        for sample in SAMPLES:
            print(f"-> {engine_code} | {sample}", flush=True)
            usage = run_one(engine_code, subdir, script, deployment, it_dir, sample)
            if usage is None:
                continue
            row = {"engine": engine_code, "sample": sample, **usage}
            rows.append(row)
            # Write CSV incrementally so a mid-run failure doesn't lose data
            with OUT_CSV.open("w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerows(rows)
            print(f"   in={usage['input_tokens']:>6}  out={usage['output_tokens']:>6}  cached={usage['cached_tokens']:>6}  {usage['wallclock_s']:>5}s")
    print(f"\nDone. {len(rows)} rows written to {OUT_CSV}")


if __name__ == "__main__":
    main()
