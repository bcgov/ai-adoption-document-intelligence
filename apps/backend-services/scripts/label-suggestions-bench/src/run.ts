import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BenchApi, type BenchDocument } from "./api";
import { CACHE_DIR, readForms, readSettings } from "./config";
import { listCopies, readAnswers } from "./corpus";
import type { AnswerKey } from "./fill";
import { buildTruth } from "./ground-truth";
import {
  type FieldFormResult,
  type LabelFormResult,
  writeFieldReport,
  writeLabelReport,
} from "./report";
import { type CopyScore, scoreCopy, scoreFieldList } from "./score";

const TERMINAL = new Set(["extracted", "failed", "conversion_failed"]);
const OCR_TIMEOUT_MS = 15 * 60_000;
const OCR_POLL_MS = 10_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function waitForOcr(
  api: BenchApi,
  modelId: string,
  expected: number,
): Promise<BenchDocument[]> {
  const deadline = Date.now() + OCR_TIMEOUT_MS;
  for (;;) {
    const documents = await api.listDocuments(modelId);
    const finished = documents.filter((d) =>
      TERMINAL.has(d.labeling_document.status),
    );
    if (documents.length >= expected && finished.length === documents.length) {
      return documents;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `OCR did not finish for template model ${modelId} within 15 minutes`,
      );
    }
    await sleep(OCR_POLL_MS);
  }
}

async function uploadCopies(
  api: BenchApi,
  modelId: string,
  formId: string,
  copies: Array<{ copy: number; pdfPath: string; answers: AnswerKey }>,
): Promise<Map<string, AnswerKey>> {
  const byDocument = new Map<string, AnswerKey>();
  for (const copy of copies) {
    const uploaded = await api.uploadDocument(
      modelId,
      `${formId} copy ${copy.copy}`,
      `${formId}-copy-${copy.copy}.pdf`,
      readFileSync(copy.pdfPath),
    );
    byDocument.set(uploaded.labelingDocument.id, copy.answers);
  }
  return byDocument;
}

function runInfo(name: string, engine: string) {
  return {
    name,
    engine,
    date: new Date().toISOString(),
    backendUrl: readSettings().backendUrl,
  };
}

export async function runLabels(options: {
  name: string;
  engine: string;
  copies: number;
  withDescriptions: boolean;
}): Promise<string> {
  const api = new BenchApi(readSettings());
  const dir = join(CACHE_DIR, "runs", options.name);
  mkdirSync(dir, { recursive: true });
  const results: LabelFormResult[] = [];

  for (const form of readForms()) {
    const copies = listCopies(form.id)
      .slice(0, options.copies)
      .map((c) => ({ ...c, answers: readAnswers(c.answersPath) }));
    if (copies.length === 0) {
      console.log(`skip ${form.id}: no generated copies`);
      continue;
    }
    const model = await api.createTemplateModel(
      `bench ${form.id} ${options.name}`,
    );
    for (const field of copies[0].answers.fields) {
      await api.addField(model.id, {
        field_key: field.key,
        field_type: field.type,
        ...(options.withDescriptions && field.description
          ? { description: field.description }
          : {}),
      });
    }
    const answersByDocument = await uploadCopies(
      api,
      model.id,
      form.id,
      copies,
    );
    const documents = await waitForOcr(api, model.id, answersByDocument.size);

    const scores: CopyScore[] = [];
    const latencies: number[] = [];
    let failedOcr = 0;
    let failedCalls = 0;
    for (const document of documents) {
      const answers = answersByDocument.get(document.labeling_document_id);
      const result = document.labeling_document.ocr_result?.analyzeResult;
      if (
        !answers ||
        document.labeling_document.status !== "extracted" ||
        !result
      ) {
        failedOcr += 1;
        continue;
      }
      const started = Date.now();
      try {
        const suggestions = await api.suggestLabels(
          model.id,
          document.labeling_document_id,
        );
        latencies.push(Date.now() - started);
        scores.push(
          scoreCopy(
            document.labeling_document.original_filename,
            buildTruth(answers, result),
            suggestions,
          ),
        );
      } catch (error) {
        failedCalls += 1;
        console.log(
          `${form.id}: suggestion call failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    results.push({
      formId: form.id,
      title: form.title,
      templateModelId: model.id,
      copies: copies.length,
      failedOcr,
      failedCalls,
      medianLatencyMs: median(latencies),
      scores,
    });
    console.log(`${form.id}: scored ${scores.length} copies`);
  }

  writeLabelReport(dir, runInfo(options.name, options.engine), results);
  return dir;
}

export async function runFields(options: {
  name: string;
  engine: string;
}): Promise<string> {
  const api = new BenchApi(readSettings());
  const dir = join(CACHE_DIR, "runs", options.name);
  mkdirSync(dir, { recursive: true });
  const results: FieldFormResult[] = [];

  for (const form of readForms()) {
    const [first] = listCopies(form.id);
    if (!first) {
      console.log(`skip ${form.id}: no generated copies`);
      continue;
    }
    const answers = readAnswers(first.answersPath);
    const model = await api.createTemplateModel(
      `bench ${form.id} ${options.name} fields`,
    );
    const byDocument = await uploadCopies(api, model.id, form.id, [
      { copy: first.copy, pdfPath: first.pdfPath, answers },
    ]);
    const documents = await waitForOcr(api, model.id, byDocument.size);
    const document = documents[0];
    if (!document || document.labeling_document.status !== "extracted") {
      results.push({
        formId: form.id,
        title: form.title,
        templateModelId: model.id,
        latencyMs: null,
        error: "OCR did not finish",
        score: null,
      });
      continue;
    }
    const started = Date.now();
    try {
      const suggested = await api.suggestFields(
        model.id,
        document.labeling_document_id,
      );
      results.push({
        formId: form.id,
        title: form.title,
        templateModelId: model.id,
        latencyMs: Date.now() - started,
        error: null,
        score: scoreFieldList(answers, suggested),
      });
    } catch (error) {
      results.push({
        formId: form.id,
        title: form.title,
        templateModelId: model.id,
        latencyMs: null,
        error: error instanceof Error ? error.message : String(error),
        score: null,
      });
    }
    console.log(`${form.id}: suggested fields scored`);
  }

  writeFieldReport(dir, runInfo(options.name, options.engine), results);
  return dir;
}
