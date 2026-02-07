import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

export interface SplitDocumentInput {
  blobKey: string;
  strategy: 'per-page' | 'fixed-range' | 'boundary-detection';
  fixedRangeSize?: number;
  documentId?: string;
}

export interface DocumentSegment {
  segmentIndex: number;
  pageRange: { start: number; end: number };
  blobKey: string;
  pageCount: number;
}

export interface SplitDocumentOutput {
  segments: DocumentSegment[];
}

const DEFAULT_BLOB_BASE_PATH = './data/blobs';

export async function splitDocument(
  input: SplitDocumentInput,
): Promise<SplitDocumentOutput> {
  const sourcePath = resolveBlobKeyToPath(input.blobKey);
  await assertFileExists(sourcePath, input.blobKey);

  const totalPages = await getTotalPages(sourcePath);
  const ranges = await buildRanges(input, sourcePath, totalPages);

  const documentId = input.documentId ?? extractDocumentId(input.blobKey);
  if (!documentId) {
    throw new Error(
      `documentId is required to build segment keys (blobKey=${input.blobKey})`,
    );
  }

  const segments: DocumentSegment[] = [];
  for (let i = 0; i < ranges.length; i += 1) {
    const range = ranges[i];
    const segmentIndex = i + 1;
    const segmentKey = `documents/${documentId}/segments/segment-${padIndex(
      segmentIndex,
    )}-pages-${range.start}-${range.end}.pdf`;
    const outputPath = resolveBlobKeyToPath(segmentKey);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await extractRange(sourcePath, outputPath, range.start, range.end);

    segments.push({
      segmentIndex,
      pageRange: { start: range.start, end: range.end },
      blobKey: segmentKey,
      pageCount: range.end - range.start + 1,
    });
  }

  return { segments };
}

function resolveBlobKeyToPath(blobKey: string): string {
  const basePath =
    process.env.LOCAL_BLOB_STORAGE_PATH ?? DEFAULT_BLOB_BASE_PATH;
  const normalized = path.normalize(blobKey);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error(`Invalid blob key: "${blobKey}"`);
  }
  return path.join(basePath, normalized);
}

async function assertFileExists(filePath: string, blobKey: string) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Blob not found: "${blobKey}"`);
  }
}

async function getTotalPages(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('qpdf', ['--show-npages', filePath]);
  const count = Number(stdout.trim());
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`Unable to read page count for ${filePath}`);
  }
  return count;
}

async function buildRanges(
  input: SplitDocumentInput,
  sourcePath: string,
  totalPages: number,
): Promise<Array<{ start: number; end: number }>> {
  if (input.strategy === 'per-page') {
    return Array.from({ length: totalPages }, (_, index) => ({
      start: index + 1,
      end: index + 1,
    }));
  }

  if (input.strategy === 'fixed-range') {
    const size = input.fixedRangeSize;
    if (!size || size <= 0) {
      throw new Error('fixedRangeSize is required for fixed-range strategy');
    }
    const ranges: Array<{ start: number; end: number }> = [];
    for (let start = 1; start <= totalPages; start += size) {
      const end = Math.min(start + size - 1, totalPages);
      ranges.push({ start, end });
    }
    return ranges;
  }

  return detectBoundaries(sourcePath, totalPages);
}

async function detectBoundaries(
  sourcePath: string,
  totalPages: number,
): Promise<Array<{ start: number; end: number }>> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'split-document-'),
  );
  try {
    const boundaries = new Set<number>([1]);
    let previousFirstLine = '';
    let previousLength = 0;

    for (let page = 1; page <= totalPages; page += 1) {
      const pagePath = path.join(tempDir, `page-${page}.pdf`);
      await extractRange(sourcePath, pagePath, page, page);
      const text = await extractText(pagePath);
      const normalized = normalizeText(text);
      const isBlank = normalized.length < 10;
      const pageOneIndicator = isPageOneIndicator(normalized);
      const barcodeIndicator = hasBarcodeIndicator(normalized);
      const layoutChange = hasLayoutChange(
        previousFirstLine,
        previousLength,
        normalized,
      );

      if (page > 1 && (pageOneIndicator || barcodeIndicator || layoutChange)) {
        boundaries.add(page);
      }

      if (isBlank && page < totalPages) {
        boundaries.add(page + 1);
      }

      if (!isBlank) {
        previousFirstLine = firstNonEmptyLine(normalized);
        previousLength = normalized.length;
      }
    }

    const sorted = Array.from(boundaries).filter((b) => b <= totalPages);
    sorted.sort((a, b) => a - b);

    const ranges: Array<{ start: number; end: number }> = [];
    for (let i = 0; i < sorted.length; i += 1) {
      const start = sorted[i];
      const end = i + 1 < sorted.length ? sorted[i + 1] - 1 : totalPages;
      if (start <= end) {
        ranges.push({ start, end });
      }
    }
    return ranges;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function extractText(filePath: string): Promise<string> {
  const { stdout } = await execFileAsync('pdftotext', [
    '-layout',
    '-q',
    filePath,
    '-',
  ]);
  return stdout;
}

async function extractRange(
  sourcePath: string,
  outputPath: string,
  start: number,
  end: number,
): Promise<void> {
  const range = start === end ? `${start}` : `${start}-${end}`;
  await execFileAsync('qpdf', [
    '--empty',
    '--pages',
    sourcePath,
    range,
    '--',
    outputPath,
  ]);
}

function extractDocumentId(blobKey: string): string | undefined {
  const match = blobKey.match(/^documents\/([^/]+)\//);
  return match?.[1];
}

function padIndex(index: number): string {
  return String(index).padStart(3, '0');
}

function normalizeText(text: string): string {
  return text.replace(/\r/g, '').trim();
}

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  );
}

function isPageOneIndicator(text: string): boolean {
  return /page\s*1(\b|[^0-9])/.test(text.toLowerCase());
}

function hasBarcodeIndicator(text: string): boolean {
  return /(barcode|qr\s*code)/i.test(text);
}

function hasLayoutChange(
  previousFirstLine: string,
  previousLength: number,
  currentText: string,
): boolean {
  if (!previousFirstLine || !currentText) {
    return false;
  }

  const currentFirstLine = firstNonEmptyLine(currentText);
  if (!currentFirstLine) {
    return false;
  }

  if (previousLength < 200 || currentText.length < 200) {
    return false;
  }

  const lengthDelta =
    previousLength > 0
      ? Math.abs(currentText.length - previousLength) / previousLength
      : 0;

  return (
    previousFirstLine.toLowerCase() !== currentFirstLine.toLowerCase() &&
    lengthDelta > 0.6
  );
}
