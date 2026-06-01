/**
 * UNC Filesystem Blob Storage Service — temporary experiment-only adapter.
 *
 * Reads blobs from a Windows network share configured by `UNC_BLOB_STORAGE_BASE`
 * (e.g. `\\widget\SDPRDocuments\convert_sd0081\100-doc`). Resolves only the
 * basename of each blob key against that base — the rest of the structured
 * `groupId/category/.../filename` path is ignored, so seeded documents can
 * carry valid CUID-shaped blob paths while still mapping to flat filenames
 * on the share.
 *
 * Used for the SDPR HITL timing experiment. Read-only — write/delete/list/
 * deleteByPrefix throw. Selected via `BLOB_STORAGE_PROVIDER=unc-filesystem`.
 *
 * From WSL, UNC paths aren't directly accessible, so reads go through
 * PowerShell via Windows interop. Each read spawns a short-lived powershell.exe
 * process that streams the file bytes to stdout. Acceptable latency for the
 * ~99-document experiment scale.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "@/logging/app-logger.service";
import { BlobStorageInterface } from "./blob-storage.interface";

const POWERSHELL =
  "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

@Injectable()
export class UncFilesystemBlobStorageService implements BlobStorageInterface {
  private readonly baseUnc: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    this.baseUnc = this.configService.get<string>("UNC_BLOB_STORAGE_BASE", "");
    if (!this.baseUnc) {
      this.logger.warn(
        "UNC_BLOB_STORAGE_BASE not set — UNC filesystem blob storage will fail on read.",
      );
    } else {
      this.logger.info(
        `UNC filesystem blob storage initialized: base=${this.baseUnc}`,
      );
    }
  }

  /** Resolve a structured blob key to the absolute UNC path of the file. */
  private resolvePath(key: string): string {
    const filename = path.posix.basename(key);
    if (
      !filename ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\")
    ) {
      throw new Error(`Invalid blob key for UNC adapter: "${key}"`);
    }
    const sep = this.baseUnc.endsWith("\\") ? "" : "\\";
    return `${this.baseUnc}${sep}${filename}`;
  }

  /** Stream a UNC file's bytes through powershell.exe and return them. */
  private readUnc(absPath: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      // Single-quote-escape the path for PowerShell literal-string handling.
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

  private existsUnc(absPath: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const psPath = absPath.replace(/'/g, "''");
      const cmd = `if (Test-Path -LiteralPath '${psPath}') { Write-Output 'YES' } else { Write-Output 'NO' }`;
      const ps = spawn(POWERSHELL, ["-NoProfile", "-Command", cmd], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      ps.stdout.on("data", (c: Buffer) => chunks.push(c));
      ps.on("error", reject);
      ps.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`powershell exited ${code}`));
          return;
        }
        const out = Buffer.concat(chunks).toString("utf8").trim();
        resolve(out === "YES");
      });
    });
  }

  async read(key: string): Promise<Buffer> {
    const abs = this.resolvePath(key);
    try {
      const data = await this.readUnc(abs);
      this.logger.debug(`Read blob: ${key} → ${abs} (${data.length} bytes)`);
      return data;
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(
        `Failed to read blob "${key}" from "${abs}": ${err.message}`,
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return await this.existsUnc(this.resolvePath(key));
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to check existence: ${key}`, {
        stack: err.stack,
      });
      return false;
    }
  }

  async write(_key: string, _data: Buffer): Promise<void> {
    throw new Error(
      "UNC filesystem blob storage is read-only (experiment adapter)",
    );
  }

  async delete(_key: string): Promise<void> {
    throw new Error(
      "UNC filesystem blob storage is read-only (experiment adapter)",
    );
  }

  async list(_prefix: string): Promise<string[]> {
    throw new Error(
      "UNC filesystem blob storage does not support list (experiment adapter)",
    );
  }

  async deleteByPrefix(_prefix: string): Promise<void> {
    throw new Error(
      "UNC filesystem blob storage is read-only (experiment adapter)",
    );
  }
}
