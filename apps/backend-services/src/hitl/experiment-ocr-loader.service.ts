/**
 * In-memory loader for SDPR HITL timing experiment OCR data.
 *
 * Streams the benchmark JSON from a Windows UNC share via PowerShell on
 * first use, parses it once, and caches a `Map<sampleId, ExtractedFields>`
 * for subsequent reads. Avoids any on-disk staging of the field data —
 * values live only in process memory and are gone on backend restart.
 *
 * Activation:
 *   - EXPERIMENT_BENCHMARK_JSON_PATH must be set to a UNC path
 *     (e.g. `\\widget\…\benchmark-result-neural-normalized.json`).
 *   - When the env var is empty, the loader is inactive and
 *     `getFieldsForSample()` always returns null. HitlService treats this
 *     as "no experiment overlay" and falls back to DB behavior.
 *
 * Concurrency: first call awaits the load; concurrent callers share the
 * same in-flight promise. Subsequent calls return synchronously from the
 * cache.
 */
import { spawn } from "node:child_process";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "@/logging/app-logger.service";

const POWERSHELL =
  "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

export const EXPERIMENT_BENCHMARK_JSON_PATH_ENV =
  "EXPERIMENT_BENCHMARK_JSON_PATH";
export const EXPERIMENT_OCR_CACHE_DIR_ENV = "EXPERIMENT_OCR_CACHE_DIR";

export interface BoundingRegion {
  polygon: number[];
  pageNumber?: number;
}

/** Matches the OcrField shape used by ReviewWorkspacePage.tsx. */
export interface ExperimentOcrField {
  valueString?: string;
  content?: string;
  confidence?: number;
  boundingRegions?: BoundingRegion[];
}

interface SampleFromJson {
  sampleId?: string;
  evaluationDetails?: Array<{
    field?: string;
    predicted?: unknown;
    expected?: unknown;
    confidence?: unknown;
  }>;
}

function toOcrField(
  predicted: unknown,
  confidence: unknown,
): ExperimentOcrField {
  const f: ExperimentOcrField = {};
  if (predicted !== null && predicted !== undefined && predicted !== "") {
    f.valueString =
      typeof predicted === "string" ? predicted : JSON.stringify(predicted);
    f.content = f.valueString;
  } else {
    f.valueString = "";
    f.content = "";
  }
  if (typeof confidence === "number") f.confidence = confidence;
  return f;
}

// Mirror of scripts/benchmark analysis/reviewable-items.py filter policy.
// Categories the SDPR experiment routes through HITL:
const HITL_CATEGORIES = new Set([
  "sin",
  "phone",
  "name",
  "date",
  "income_amounts",
]);
const SKIP_TRIVIAL_CATEGORIES = new Set(["income_amounts"]);

function classifyField(field: string): string {
  if (field === "sin" || field === "spouse_sin") return "sin";
  if (field === "date" || field === "spouse_date") return "date";
  if (field === "phone" || field === "spouse_phone") return "phone";
  if (field === "name" || field === "spouse_name") return "name";
  if (field === "signature" || field === "spouse_signature") return "signature";
  if (field === "explain_changes") return "freeform_text";
  if (field === "case_id") return "case_id";
  if (field.startsWith("checkbox_")) return "checkboxes";
  return "income_amounts";
}

function valueIsEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v) || (typeof v === "object" && v !== null)) {
    return Object.keys(v as object).length === 0;
  }
  return false;
}

/**
 * Same trivial-prediction rule as hitl-planner._predicted_looks_trivial and
 * reviewable-items.py.is_trivial: empty, single non-whitespace character, or
 * a single-digit integer (-10 < n < 10, integer-equivalent).
 */
function predictionIsTrivial(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "boolean") return false;
  if (typeof v === "number") {
    return Number.isFinite(v) && v > -10 && v < 10 && Math.floor(v) === v;
  }
  if (typeof v === "string") return v.trim().length <= 1;
  return false;
}

/**
 * Same reviewable rule as reviewable-items.py: keep predictions whose
 * category is in HITL_CATEGORIES, drop blank-blank cells, drop trivial
 * predictions for income_amounts. Uses both `predicted` AND `expected` —
 * something only the backend-side benchmark JSON provides; the production
 * HITL endpoint sees only `predicted`.
 */
function isReviewable(
  field: string,
  predicted: unknown,
  expected: unknown,
): boolean {
  const cat = classifyField(field);
  if (!HITL_CATEGORIES.has(cat)) return false;
  if (valueIsEmpty(predicted) && valueIsEmpty(expected)) return false;
  if (SKIP_TRIVIAL_CATEGORIES.has(cat)) {
    if (valueIsEmpty(predicted) || predictionIsTrivial(predicted)) return false;
  }
  return true;
}

@Injectable()
export class ExperimentOcrLoaderService {
  private readonly path: string;
  private readonly cacheDir: string;
  private cache: Map<string, Record<string, ExperimentOcrField>> | null = null;
  /**
   * Per-sample allow-list of field names that should appear in HITL — the
   * exact set computed by reviewable-items.py from `predicted` + `expected`.
   * Populated alongside `cache` during load.
   */
  private reviewableFieldsBySample: Map<string, Set<string>> | null = null;
  /**
   * Per-sample bounding-region map: `Map<sampleId, Map<fieldName, BoundingRegion[]>>`.
   * Lazy-loaded from the OCR cache files (one per sample) on first read.
   */
  private boundingRegionsBySample = new Map<
    string,
    Map<string, BoundingRegion[]>
  >();
  /** In-flight per-sample bounding-region loads, so concurrent reads share work. */
  private boundingRegionLoadsInFlight = new Map<string, Promise<void>>();
  private loading: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    this.path = this.configService.get<string>(
      EXPERIMENT_BENCHMARK_JSON_PATH_ENV,
      "",
    );
    this.cacheDir = this.configService.get<string>(
      EXPERIMENT_OCR_CACHE_DIR_ENV,
      "",
    );
    if (this.cacheDir) {
      this.logger.info(
        `ExperimentOcrLoaderService bounding-region cache: ${this.cacheDir} (lazy per-sample)`,
      );
    } else {
      this.logger.debug(
        "EXPERIMENT_OCR_CACHE_DIR not set — HITL fields will not include boundingRegions",
      );
    }
    if (this.path) {
      this.logger.info(
        `ExperimentOcrLoaderService configured: ${this.path} (lazy load on first request)`,
      );
    } else {
      this.logger.debug(
        "ExperimentOcrLoaderService inactive (EXPERIMENT_BENCHMARK_JSON_PATH not set)",
      );
    }
  }

  /** True when the loader is configured to overlay experiment OCR data. */
  isEnabled(): boolean {
    return this.path.length > 0;
  }

  /** Stream the configured benchmark JSON through PowerShell into a Buffer. */
  private streamBenchmarkJson(): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const psPath = this.path.replace(/'/g, "''");
      const cmd = `$b = [System.IO.File]::ReadAllBytes('${psPath}'); $o = [System.Console]::OpenStandardOutput(); $o.Write($b, 0, $b.Length); $o.Close()`;
      const ps = spawn(POWERSHELL, ["-NoProfile", "-Command", cmd], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      ps.stdout.on("data", (c: Buffer) => chunks.push(c));
      ps.stderr.on("data", (c: Buffer) => errChunks.push(c));
      ps.on("error", reject);
      ps.on("close", (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(errChunks).toString("utf8");
          reject(
            new Error(
              `powershell exited ${code} streaming ${this.path}: ${stderr.trim() || "no stderr"}`,
            ),
          );
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  }

  private async load(): Promise<void> {
    this.logger.info(`Loading experiment benchmark JSON from ${this.path}…`);
    const t0 = Date.now();
    const buf = await this.streamBenchmarkJson();
    const data = JSON.parse(buf.toString("utf8"));
    const samples = (data?.perSampleResults ?? []) as SampleFromJson[];

    const cache = new Map<string, Record<string, ExperimentOcrField>>();
    const reviewable = new Map<string, Set<string>>();
    let totalReviewable = 0;
    for (const sample of samples) {
      const sampleId =
        typeof sample.sampleId === "string"
          ? sample.sampleId.replace(/\.(jpg|jpeg|png|tif|tiff|pdf)$/i, "")
          : "";
      if (!sampleId) continue;
      const fields: Record<string, ExperimentOcrField> = {};
      const allow = new Set<string>();
      for (const det of sample.evaluationDetails ?? []) {
        if (typeof det.field !== "string") continue;
        fields[det.field] = toOcrField(det.predicted, det.confidence);
        // Compute reviewability HERE while GT is in scope. The result is
        // exactly equivalent to running reviewable-items.py on this JSON.
        if (isReviewable(det.field, det.predicted, det.expected)) {
          allow.add(det.field);
        }
      }
      cache.set(sampleId, fields);
      reviewable.set(sampleId, allow);
      totalReviewable += allow.size;
    }

    this.cache = cache;
    this.reviewableFieldsBySample = reviewable;
    this.logger.info(
      `Loaded ${cache.size} samples from benchmark JSON (${buf.length} bytes, ${Date.now() - t0}ms). Reviewable items: ${totalReviewable}`,
    );
  }

  /** Return cached fields for a sampleId, loading on first call. */
  async getFieldsForSample(
    sampleId: string,
  ): Promise<Record<string, ExperimentOcrField> | null> {
    if (!this.isEnabled()) return null;
    await this.ensureLoaded();
    const fields = this.cache?.get(sampleId);
    if (!fields) return null;
    // If a bounding-region cache dir is configured, lazily load the cache
    // file for this sample and merge regions into the field objects.
    if (this.cacheDir) {
      await this.ensureBoundingRegionsLoaded(sampleId);
      const regions = this.boundingRegionsBySample.get(sampleId);
      if (regions) {
        const merged: Record<string, ExperimentOcrField> = {};
        for (const [field, raw] of Object.entries(fields)) {
          const br = regions.get(field);
          merged[field] = br ? { ...raw, boundingRegions: br } : raw;
        }
        return merged;
      }
    }
    return fields;
  }

  /**
   * Stream the per-sample OCR cache file (`<cacheDir>\<sampleId>.json`)
   * via PowerShell, parse Azure DI's response, and extract per-field
   * boundingRegions. Cached for the rest of the process lifetime.
   * If the file is missing or unreadable, an empty map is cached so
   * we don't repeatedly retry.
   */
  private async ensureBoundingRegionsLoaded(sampleId: string): Promise<void> {
    if (this.boundingRegionsBySample.has(sampleId)) return;
    let inFlight = this.boundingRegionLoadsInFlight.get(sampleId);
    if (!inFlight) {
      inFlight = this.loadBoundingRegionsForSample(sampleId).finally(() => {
        this.boundingRegionLoadsInFlight.delete(sampleId);
      });
      this.boundingRegionLoadsInFlight.set(sampleId, inFlight);
    }
    await inFlight;
  }

  private async loadBoundingRegionsForSample(sampleId: string): Promise<void> {
    const sep = this.cacheDir.endsWith("\\") ? "" : "\\";
    const absPath = `${this.cacheDir}${sep}${sampleId}.json`;
    try {
      const buf = await this.streamFile(absPath);
      const data = JSON.parse(buf.toString("utf8")) as {
        analyzeResult?: {
          documents?: Array<{
            fields?: Record<string, { boundingRegions?: BoundingRegion[] }>;
          }>;
        };
      };
      const fields = data.analyzeResult?.documents?.[0]?.fields ?? {};
      const regions = new Map<string, BoundingRegion[]>();
      for (const [fieldName, fieldData] of Object.entries(fields)) {
        if (Array.isArray(fieldData?.boundingRegions)) {
          regions.set(fieldName, fieldData.boundingRegions);
        }
      }
      this.boundingRegionsBySample.set(sampleId, regions);
      this.logger.debug(
        `Loaded bounding regions for ${sampleId}: ${regions.size} fields (${buf.length} bytes)`,
      );
    } catch (err) {
      const e = err as Error;
      this.logger.warn(
        `Failed to load OCR cache for ${sampleId} at ${absPath}: ${e.message}`,
      );
      this.boundingRegionsBySample.set(sampleId, new Map()); // negative-cache
    }
  }

  /** Stream an arbitrary UNC file's bytes through powershell.exe. */
  private streamFile(absPath: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const psPath = absPath.replace(/'/g, "''");
      const cmd = `$b = [System.IO.File]::ReadAllBytes('${psPath}'); $o = [System.Console]::OpenStandardOutput(); $o.Write($b, 0, $b.Length); $o.Close()`;
      const ps = spawn(POWERSHELL, ["-NoProfile", "-Command", cmd], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      ps.stdout.on("data", (c: Buffer) => chunks.push(c));
      ps.stderr.on("data", (c: Buffer) => errChunks.push(c));
      ps.on("error", reject);
      ps.on("close", (code) => {
        if (code !== 0) {
          const stderr = Buffer.concat(errChunks).toString("utf8");
          reject(
            new Error(
              `powershell exited ${code} reading ${absPath}: ${stderr.trim() || "no stderr"}`,
            ),
          );
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
  }

  /**
   * Return the exact per-sample allow-list of fields that should appear
   * in HITL. Same answer as reviewable-items.py for this benchmark JSON.
   */
  async getReviewableFieldsForSample(
    sampleId: string,
  ): Promise<Set<string> | null> {
    if (!this.isEnabled()) return null;
    await this.ensureLoaded();
    return this.reviewableFieldsBySample?.get(sampleId) ?? null;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.cache) return;
    if (!this.loading) {
      this.loading = this.load().catch((err) => {
        this.loading = null;
        throw err;
      });
    }
    await this.loading;
  }
}
