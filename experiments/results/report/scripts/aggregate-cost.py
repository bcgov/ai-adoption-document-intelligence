#!/usr/bin/env python3
"""
Reads token-usage-by-sample.csv and computes per-engine cost aggregates
(cold-cache and warm-cache) and total measured spend across all calls.
Writes per-sample-cost.csv with one row per (engine, sample) and prints
the summary table.

Rates (USD, eastus2 Global Standard, per Microsoft's published rate card
2026-05-14):
  gpt-5.2 : $1.75 / $14   / $0.18  per 1M input / output / cached input
  gpt-5.4 : $2.50 / $15   / $0.25
  gpt-4o  : $2.50 / $10   / $1.25
  DI prebuilt-layout (S0)   : $10 / 1K pages = $0.010 / page
  CU Doc Content Extraction Standard : $5 / 1K = $0.005 / page
  CU Std Contextualization : $1 / 1M tokens
"""
import csv
import statistics
from pathlib import Path
from collections import defaultdict

CSV_IN = Path("/home/alstruk/GitHub/ai-adoption-document-intelligence/experiments/results/report/data/token-usage-by-sample.csv")
CSV_OUT = Path("/home/alstruk/GitHub/ai-adoption-document-intelligence/experiments/results/report/data/per-sample-cost.csv")

# (in $/M tokens)
RATES = {
    "gpt-5.2": {"in": 1.75, "out": 14.00, "cached": 0.18},
    "gpt-5.4": {"in": 2.50, "out": 15.00, "cached": 0.25},
    "gpt-4o":  {"in": 2.50, "out": 10.00, "cached": 1.25},
}

# (engine -> (deployment, page_meter_dollars, contextualization_rate_dollars_per_M))
ENGINE_CFG = {
    "E03": {"deployment": "gpt-5.2", "page_meter": 0.005, "ctx_rate": 1.00},      # CU + gpt-5.2 (page = CU Std)
    "E04": {"deployment": "gpt-5.4", "page_meter": 0.000, "ctx_rate": 0.00},      # VLM direct, no OCR
    "E05": {"deployment": "gpt-5.4", "page_meter": 0.010, "ctx_rate": 0.00},      # DI Layout + gpt-5.4
    "E07": {"deployment": "gpt-4o",  "page_meter": 0.010, "ctx_rate": 0.00},      # DI Layout + gpt-4o
    "E08": {"deployment": "gpt-5.2", "page_meter": 0.010, "ctx_rate": 0.00},      # DI Layout + gpt-5.2
}


def cost_for_row(row):
    eng = row["engine"]
    cfg = ENGINE_CFG[eng]
    r = RATES[cfg["deployment"]]
    inp = int(row["input_tokens"])
    out = int(row["output_tokens"])
    cached = int(row["cached_tokens"])
    pages = int(row["document_pages_standard"])
    ctx = int(row["contextualization_tokens"])
    M = 1_000_000

    # Cold-cache cost: all input tokens billed at base rate (no cache discount)
    cold = inp * r["in"] / M + out * r["out"] / M + cfg["page_meter"] * pages
    if eng == "E03":
        cold += ctx * cfg["ctx_rate"] / M

    # Warm-cache cost: cached portion at cached rate, rest at base
    fresh = max(inp - cached, 0)
    warm = fresh * r["in"] / M + cached * r["cached"] / M + out * r["out"] / M + cfg["page_meter"] * pages
    if eng == "E03":
        warm += ctx * cfg["ctx_rate"] / M

    return cold, warm


def main():
    rows = list(csv.DictReader(CSV_IN.open()))
    per_engine = defaultdict(list)
    out_rows = []
    total_actual = 0.0  # what we actually paid for the measurement run (warm-cache where applicable)
    for r in rows:
        cold, warm = cost_for_row(r)
        per_engine[r["engine"]].append((r["sample"], int(r["input_tokens"]), int(r["output_tokens"]),
                                         int(r["cached_tokens"]), cold, warm))
        out_rows.append({**r, "cost_cold_cache_usd": f"{cold:.4f}", "cost_warm_cache_usd": f"{warm:.4f}"})
        total_actual += warm
    # Write per-sample CSV
    fieldnames = list(rows[0].keys()) + ["cost_cold_cache_usd", "cost_warm_cache_usd"]
    with CSV_OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(out_rows)

    # Print summary
    print(f"{'engine':<6} {'n':<3} {'in_mean':>8} {'in_p50':>8} {'in_min':>8} {'in_max':>8} {'out_mean':>9} {'cold_$/page':>13} {'warm_$/page':>13}")
    print('-' * 90)
    for eng in ["E03", "E04", "E05", "E07", "E08"]:
        data = per_engine[eng]
        if not data: continue
        ins = [d[1] for d in data]
        outs = [d[2] for d in data]
        colds = [d[4] for d in data]
        warms = [d[5] for d in data]
        print(f"{eng:<6} {len(data):<3} "
              f"{statistics.mean(ins):>8.0f} {statistics.median(ins):>8.0f} {min(ins):>8d} {max(ins):>8d} "
              f"{statistics.mean(outs):>9.0f} "
              f"{statistics.mean(colds):>12.4f}  {statistics.mean(warms):>12.4f}")
    print()
    print(f"Total measured Azure spend on this re-run: ${total_actual:.4f}")
    print(f"(That is the sum of warm-cache per-call costs across all {len(rows)} calls.)")


if __name__ == "__main__":
    main()
