import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface SampleDocumentMeta {
  id: string;
  name: string;
  description: string;
  file: string;
  mimeType: string;
}

export interface SampleDocumentBytes {
  id: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

/**
 * Bundled sample documents are co-located with the agent code at
 * `src/agent/sample-document-assets/` and copied verbatim into
 * `dist/agent/sample-document-assets/` by nest-cli's `assets` config. Anchor
 * the path on the compiled file's own directory so it resolves the SAME way in
 * dev (ts-jest, from `src/agent`) and prod (from `dist/agent`) — the prod image
 * ships only `dist`, so the assets must live inside it. The backend compiles
 * to CommonJS (ts-jest + swc + `node dist/main`), so `__dirname` is always
 * defined.
 */
const ASSETS_DIR = resolve(__dirname, "sample-document-assets");

function readManifest(): SampleDocumentMeta[] {
  const raw = readFileSync(join(ASSETS_DIR, "manifest.json"), "utf-8");
  return JSON.parse(raw) as SampleDocumentMeta[];
}

/** Public metadata for every bundled sample (no bytes). */
export function listSampleDocuments(): Omit<SampleDocumentMeta, "file">[] {
  return readManifest().map(({ id, name, description, mimeType }) => ({
    id,
    name,
    description,
    mimeType,
  }));
}

/** Load one sample's bytes by id, or null if unknown. */
export function getSampleDocument(id: string): SampleDocumentBytes | null {
  const meta = readManifest().find((m) => m.id === id);
  if (!meta) return null;
  return {
    id: meta.id,
    filename: meta.file,
    mimeType: meta.mimeType,
    bytes: readFileSync(join(ASSETS_DIR, meta.file)),
  };
}
