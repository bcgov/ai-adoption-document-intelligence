import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, readForms } from "./config";
import { type AnswerKey, fillForm } from "./fill";

const FORMS_DIR = join(CACHE_DIR, "forms");
const COPIES_DIR = join(CACHE_DIR, "copies");

export async function downloadForms(): Promise<void> {
  mkdirSync(FORMS_DIR, { recursive: true });
  for (const form of readForms()) {
    const target = join(FORMS_DIR, `${form.id}.pdf`);
    if (existsSync(target)) {
      console.log(`have ${form.id}`);
      continue;
    }
    const response = await fetch(form.url);
    if (!response.ok) {
      throw new Error(`Downloading ${form.id} failed with ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (Buffer.from(bytes.subarray(0, 5)).toString("latin1") !== "%PDF-") {
      throw new Error(`${form.id} did not download as a PDF`);
    }
    writeFileSync(target, bytes);
    console.log(`downloaded ${form.id}`);
  }
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
