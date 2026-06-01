/**
 * Split the seeded experiment docs into two groups:
 *   - <hitl-count> randomly selected docs stay in HITL (queue keeps them).
 *   - The remaining docs are removed from the DB and their PDFs are copied
 *     into a sibling folder on the share for manual review.
 *
 * A manifest CSV is written to the share next to the manual folder so the
 * split is auditable.
 *
 * Usage (from repo root):
 *   bash scripts/sdpr-experiment/split-experiment-share.sh \
 *       '\\widget\SDPRDocuments\convert_sd0081\100-doc' \
 *       [--hitl-count 50] \
 *       [--manual-folder manual-review] \
 *       [--seed 12345]
 *
 * Or directly with DATABASE_URL exported:
 *   npx tsx scripts/sdpr-experiment/split-experiment.ts \
 *       --share-root '\\widget\SDPRDocuments\convert_sd0081\100-doc' \
 *       [--hitl-count 50] \
 *       [--manual-folder manual-review] \
 *       [--seed 12345]
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../apps/backend-services/src/generated/client";
import { getPrismaPgOptions } from "../../apps/backend-services/src/utils/database-url";

const EXPERIMENT_TAG = "sdpr-hitl-timing-experiment";
const POWERSHELL = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

type Args = {
  shareRoot: string;
  hitlCount: number;
  manualFolder: string;
  seed: number | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    shareRoot: "",
    hitlCount: 50,
    manualFolder: "manual-review",
    seed: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--share-root" && argv[i + 1]) {
      args.shareRoot = argv[++i];
      continue;
    }
    if (argv[i] === "--hitl-count" && argv[i + 1]) {
      args.hitlCount = Number.parseInt(argv[++i], 10);
      continue;
    }
    if (argv[i] === "--manual-folder" && argv[i + 1]) {
      args.manualFolder = argv[++i];
      continue;
    }
    if (argv[i] === "--seed" && argv[i + 1]) {
      args.seed = Number.parseInt(argv[++i], 10);
      continue;
    }
  }
  return args;
}

/**
 * Mulberry32 PRNG — small, deterministic, seedable. Used so a passed
 * --seed gives a reproducible split.
 */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function ps_quote(s: string): string {
  return s.replace(/'/g, "''");
}

function runPowershell(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = spawn(POWERSHELL, ["-NoProfile", "-Command", cmd], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ps.stdout.on("data", (c: Buffer) => out.push(c));
    ps.stderr.on("data", (c: Buffer) => err.push(c));
    ps.on("error", reject);
    ps.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `powershell exited ${code}: ${Buffer.concat(err).toString("utf8").trim()}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(out).toString("utf8"));
    });
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.shareRoot) {
    console.error("error: --share-root required");
    return 2;
  }
  if (!args.shareRoot.startsWith("\\\\")) {
    console.error("error: --share-root must be a UNC path (\\\\server\\share\\…)");
    return 2;
  }
  if (!args.hitlCount || args.hitlCount < 0) {
    console.error("error: --hitl-count must be a positive integer");
    return 2;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("error: DATABASE_URL not set");
    return 2;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg(getPrismaPgOptions(databaseUrl)),
  });

  // Pull all experiment docs (by metadata marker).
  const docs = await prisma.document.findMany({
    where: {
      metadata: { path: ["experiment"], equals: EXPERIMENT_TAG } as never,
    },
    select: { id: true, title: true, metadata: true },
  });
  console.log(`found ${docs.length} experiment documents`);

  if (docs.length < args.hitlCount) {
    console.error(
      `error: only ${docs.length} experiment docs exist; cannot keep ${args.hitlCount}`,
    );
    await prisma.$disconnect();
    return 2;
  }

  // Pick a seed if the caller didn't.
  const seed =
    args.seed ?? Math.floor(Math.random() * 0xffffffff);
  console.log(`shuffle seed: ${seed}`);
  const rand = mulberry32(seed);

  const shuffled = [...docs];
  shuffleInPlace(shuffled, rand);

  const hitl = shuffled.slice(0, args.hitlCount);
  const manual = shuffled.slice(args.hitlCount);
  console.log(
    `→ ${hitl.length} kept in HITL, ${manual.length} moved to manual review`,
  );

  // ---- Manifest CSV ----
  const sep = args.shareRoot.endsWith("\\") ? "" : "\\";
  const manualUnc = `${args.shareRoot}${sep}${args.manualFolder}`;
  const manifestUnc = `${args.shareRoot}${sep}${args.manualFolder}-manifest.csv`;

  const manifestRows = [["sampleId", "assignment", "documentId"].join(",")];
  for (const d of hitl) {
    const sampleId = (d.metadata as { sampleId?: string })?.sampleId ?? "?";
    manifestRows.push(`${sampleId},hitl,${d.id}`);
  }
  for (const d of manual) {
    const sampleId = (d.metadata as { sampleId?: string })?.sampleId ?? "?";
    manifestRows.push(`${sampleId},manual,${d.id}`);
  }

  // Stage manifest in a tmp file then PowerShell-copy to the share.
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "sdpr-split-"));
  const tmpManifest = path.join(tmpDir, "manifest.csv");
  writeFileSync(tmpManifest, manifestRows.join("\n") + "\n", "utf8");

  // ---- Copy PDFs + ensure folder, then publish manifest ----
  const manualUncEsc = ps_quote(manualUnc);
  const shareRootEsc = ps_quote(args.shareRoot);
  const manualSampleNames = manual.map((d) =>
    ps_quote((d.metadata as { sampleId?: string }).sampleId ?? ""),
  );
  const namesArrayLiteral = manualSampleNames
    .filter((s) => s.length > 0)
    .map((s) => `'${s}.pdf'`)
    .join(",");

  const psCmd = `
$ErrorActionPreference = 'Stop'
$dest = '${manualUncEsc}'
if (-not (Test-Path -LiteralPath $dest)) {
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
}
$root = '${shareRootEsc}'
$names = @(${namesArrayLiteral})
$copied = 0
$missing = @()
foreach ($n in $names) {
  $src = Join-Path $root $n
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination (Join-Path $dest $n) -Force
    $copied++
  } else {
    $missing += $n
  }
}
Write-Output ("copied=" + $copied)
if ($missing.Count -gt 0) {
  Write-Output ("missing_count=" + $missing.Count)
}
`;
  console.log("copying PDFs to manual folder…");
  const psOut = await runPowershell(psCmd);
  console.log(psOut.trim());

  // Publish manifest via PowerShell so backslash UNC works
  const manifestSrcWin = await runPowershell(
    `(Resolve-Path -LiteralPath '${ps_quote(tmpManifest.replace(/^\/mnt\/c/i, "C:").replace(/\//g, "\\\\"))}').Path`,
  ).catch(() => tmpManifest);
  // Use wsl path translation via wslpath
  const wslpathOut = await new Promise<string>((resolve) => {
    const cp = spawn("wslpath", ["-w", tmpManifest]);
    const chunks: Buffer[] = [];
    cp.stdout.on("data", (c: Buffer) => chunks.push(c));
    cp.on("close", () => resolve(Buffer.concat(chunks).toString("utf8").trim()));
  });
  const manifestWin = wslpathOut || manifestSrcWin.trim();
  await runPowershell(
    `Copy-Item -LiteralPath '${ps_quote(manifestWin)}' -Destination '${ps_quote(manifestUnc)}' -Force`,
  );
  console.log(`manifest → ${manifestUnc}`);

  rmSync(tmpDir, { recursive: true, force: true });

  // ---- Delete manual docs from DB ----
  const manualIds = manual.map((d) => d.id);
  if (manualIds.length > 0) {
    const lockResult = await prisma.documentLock.deleteMany({
      where: { document_id: { in: manualIds } },
    });
    const sessionResult = await prisma.reviewSession.deleteMany({
      where: { document_id: { in: manualIds } },
    });
    const docResult = await prisma.document.deleteMany({
      where: { id: { in: manualIds } },
    });
    console.log(
      `db: deleted ${docResult.count} docs (${sessionResult.count} sessions, ${lockResult.count} locks)`,
    );
  }

  await prisma.$disconnect();
  console.log("done.");
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
