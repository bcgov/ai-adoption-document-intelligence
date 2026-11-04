import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, readForms } from "./config";
import { type AnswerKey, fillForm } from "./fill";

const FORMS_DIR = join(CACHE_DIR, "forms");
const COPIES_DIR = join(CACHE_DIR, "copies");
const BC_FORMS_HOST = "www2.gov.bc.ca";

/**
 * Download each form PDF once. Re-running the benchmark must not
 * re-download (and must not depend on the network at all).
 *
 * The file is created exclusively before the download, so two runs
 * cannot both decide the form is missing and write it.
 */
export async function downloadForms(): Promise<void> {
  mkdirSync(FORMS_DIR, { recursive: true });
  for (const form of readForms()) {
    const target = join(FORMS_DIR, formFileName(form.id));
    const handle = reserveNewFile(target);
    if (handle === null) {
      console.log(`have ${form.id}`);
      continue;
    }
    try {
      const bytes = await downloadPublicForm(form);
      // The downloaded public PDF is stored in the git-ignored bench cache.
      // codeql[js/http-to-file-access]
      writeSync(handle, bytes);
      console.log(`downloaded ${form.id}`);
    } catch (error) {
      unlinkSync(target);
      throw error;
    } finally {
      closeSync(handle);
    }
  }
}

/**
 * The form list is a checked-in file. An address from it is fetched
 * only when it is https on the BC forms host.
 */
function bcFormUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Form URL is not a valid URL");
  }
  if (url.protocol !== "https:" || url.hostname !== BC_FORMS_HOST) {
    throw new Error(`Refusing to download from ${url.hostname || raw}`);
  }
  return url.toString();
}

function formFileName(id: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`Form id ${id} is not a safe file name`);
  }
  return `${id}.pdf`;
}

/** Open the path only when it does not already exist. Returns null when it does. */
function reserveNewFile(target: string): number | null {
  try {
    return openSync(target, "wx");
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return null;
    }
    throw error;
  }
}

async function downloadPublicForm(form: {
  id: string;
  url: string;
}): Promise<Uint8Array> {
  const url = bcFormUrl(form.url);
  // The address comes from the checked-in form list and must be https://www2.gov.bc.ca.
  // codeql[js/file-access-to-http]
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Downloading ${form.id} failed with ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") {
    throw new Error(`${form.id} did not download as a PDF`);
  }
  return bytes;
}

export async function generateCopies(copies: number): Promise<void> {
  for (const form of readForms()) {
    const sourcePath = join(FORMS_DIR, `${form.id}.pdf`);
    if (!existsSync(sourcePath)) {
      throw new Error(
        `${form.id} is not downloaded; run the download command first`,
      );
    }
    const source = readFileSync(sourcePath);
    const dir = join(COPIES_DIR, form.id);
    mkdirSync(dir, { recursive: true });
    for (let copy = 1; copy <= copies; copy += 1) {
      const { pdf, answers } = await fillForm(source, form.id, copy);
      writeFileSync(join(dir, `copy-${copy}.pdf`), pdf);
      writeFileSync(
        join(dir, `copy-${copy}.answers.json`),
        JSON.stringify(answers, null, 2),
      );
    }
    console.log(`generated ${copies} copies of ${form.id}`);
  }
}

export interface CopyFiles {
  copy: number;
  pdfPath: string;
  answersPath: string;
}

export function listCopies(formId: string): CopyFiles[] {
  const dir = join(COPIES_DIR, formId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => /^copy-(\d+)\.pdf$/.exec(name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      copy: Number(match[1]),
      pdfPath: join(dir, match[0]),
      answersPath: join(dir, `copy-${match[1]}.answers.json`),
    }))
    .sort((a, b) => a.copy - b.copy);
}

export function readAnswers(path: string): AnswerKey {
  return JSON.parse(readFileSync(path, "utf-8")) as AnswerKey;
}
