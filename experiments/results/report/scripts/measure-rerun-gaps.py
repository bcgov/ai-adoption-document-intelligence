#!/usr/bin/env python3
"""
Re-run only the (engine, sample) cells that failed in the first pass:
  E03 — all 5 samples (CU script could not find JPGs; fixed via symlink)
  E04 — all 5 samples (VLM-direct script could not find JPGs; fixed via symlink)
  E07 — 2 samples (Azure HTTP 429s)

Appends results to the existing CSV. Adds 8 s sleep between calls to
avoid the gpt-4o capacity burst-throttle E07 hit on the first pass.
"""
import csv
import json
import os
import subprocess
import time
from pathlib import Path

REPO_ROOT = Path("/home/alstruk/GitHub/ai-adoption-document-intelligence")
TEMPORAL_DIR = REPO_ROOT / "apps" / "temporal"
RESULTS_DIR = REPO_ROOT / "experiments" / "results"
OUT_CSV = REPO_ROOT / "experiments" / "results" / "report" / "data" / "token-usage-by-sample.csv"

SLEEP_BETWEEN_CALLS = 8

# (engine_code, results_subdir, script_path, deployment_arg, iteration_dir_override, samples_to_run)
JOBS = [
    ("E03", "03-content-understanding", "iterate-cu-extraction.ts", None, None,
     ["synth-full (1)", "manual sample (1)", "1 81", "HR0081 (10)", "81 blank"]),
    ("E04", "04-vlm-direct",            "iterate-vlm-extraction.ts", "gpt-5.4", None,
     ["synth-full (1)", "manual sample (1)", "1 81", "HR0081 (10)", "81 blank"]),
    ("E07", "07-vlm-ocr-hybrid-gpt-4o", "iterate-hybrid-extraction.ts", "gpt-4o",
     str(RESULTS_DIR / "07-vlm-ocr-hybrid-gpt-4o" / "iteration"),
     ["manual sample (1)", "1 81"]),
]


def extract_usage(engine_code: str, last_response_path: Path) -> dict:
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
        # Print short error
        err = proc.stderr or ""
        for line in err.splitlines():
            if "Error" in line or "429" in line or "JPG" in line:
                print(f"   {line.strip()}")
                break
        return None
    if not last_response.exists():
        print(f"  FAIL {engine_code}/{sample!r}: no last-response.json")
        return None
    usage = extract_usage(engine_code, last_response)
    usage["wallclock_s"] = round(elapsed, 1)
    return usage


def load_existing_rows():
    if not OUT_CSV.exists():
        return []
    with OUT_CSV.open() as f:
        return list(csv.DictReader(f))


def main():
    rows = load_existing_rows()
    seen = {(r["engine"], r["sample"]) for r in rows}
    fieldnames = [
        "engine", "sample", "input_tokens", "output_tokens", "cached_tokens",
        "document_pages_standard", "contextualization_tokens", "wallclock_s",
    ]
    print(f"Existing rows: {len(rows)}. Sleep between calls: {SLEEP_BETWEEN_CALLS}s.\n")

    for engine_code, subdir, script, deployment, it_dir, samples in JOBS:
        for sample in samples:
            if (engine_code, sample) in seen:
                print(f"   skip {engine_code}/{sample!r} — already in CSV")
                continue
            print(f"-> {engine_code} | {sample}", flush=True)
            usage = run_one(engine_code, subdir, script, deployment, it_dir, sample)
            if usage is None:
                # retry once after a longer pause for 429s
                print(f"   retrying after 20s ...")
                time.sleep(20)
                usage = run_one(engine_code, subdir, script, deployment, it_dir, sample)
                if usage is None:
                    continue
            row = {"engine": engine_code, "sample": sample, **usage}
            rows.append(row)
            with OUT_CSV.open("w", newline="") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerows(rows)
            print(f"   in={usage['input_tokens']:>6}  out={usage['output_tokens']:>6}  cached={usage['cached_tokens']:>6}  pages={usage['document_pages_standard']}  ctx={usage['contextualization_tokens']}  {usage['wallclock_s']:>5}s")
            time.sleep(SLEEP_BETWEEN_CALLS)

    print(f"\nDone. {len(rows)} total rows in {OUT_CSV}")


if __name__ == "__main__":
    main()
