/**
 * Activity: Spellcheck correction tool
 *
 * Performs spellcheck on the full OCR result using an in-process dictionary
 * (nspell with dictionary-en). Returns corrected OCR result and change metadata.
 *
 * See feature-docs/008-ocr-correction-agentic-sdlc/step-02-ocr-correction-tools-and-nodes.md
 */

import * as fs from "fs";
import nspell from "nspell";
import * as path from "path";
import type {
  CorrectionResult,
  CorrectionToolParams,
} from "../correction-types";
import { deepCopyOcrResult } from "../correction-types";
import { createActivityLogger } from "../logger";
import type { EnrichmentChange, KeyValuePair } from "../types";

interface SpellcheckParams extends CorrectionToolParams {
  language?: string;
}

interface SpellChecker {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

let cachedSpellChecker: SpellChecker | null = null;

function findDictionaryDir(): string {
  // Walk up from node_modules to find dictionary-en, since package "exports"
  // may restrict require.resolve to specific entry points.
  const candidates = [
    path.join(__dirname, "..", "..", "node_modules", "dictionary-en"),
    path.join(__dirname, "..", "..", "..", "node_modules", "dictionary-en"),
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "node_modules",
      "dictionary-en",
    ),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.aff"))) return dir;
  }
  throw new Error(
    "Could not find dictionary-en package. Ensure it is installed in apps/temporal.",
  );
}

function getSpellChecker(): SpellChecker {
  if (cachedSpellChecker) return cachedSpellChecker;

  const dicDir = findDictionaryDir();
  const aff = fs.readFileSync(path.join(dicDir, "index.aff"));
  const dic = fs.readFileSync(path.join(dicDir, "index.dic"));
  cachedSpellChecker = nspell(aff, dic);
  return cachedSpellChecker;
}

const SKIP_PATTERN = /^[\d.,/$€£¥%@#+\-=*&!?;:'"()[\]{}<>\\|~^`]+$/;
const WORD_PATTERN = /[a-zA-Z]+(?:'[a-zA-Z]+)*/g;

function shouldSkipWord(word: string): boolean {
  if (word.length <= 1) return true;
  if (SKIP_PATTERN.test(word)) return true;
  if (word === word.toUpperCase() && word.length <= 4) return true;
  if (/^\d/.test(word)) return true;
  return false;
}

function spellcheckText(
  text: string,
  spell: SpellChecker,
): {
  corrected: string;
  corrections: Array<{ original: string; replacement: string }>;
} {
  const corrections: Array<{ original: string; replacement: string }> = [];
  let corrected = text;

  const words = text.match(WORD_PATTERN);
  if (!words) return { corrected, corrections };

  const seen = new Set<string>();
  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);

    if (shouldSkipWord(word)) continue;
    if (spell.correct(word)) continue;

    const suggestions = spell.suggest(word);
    if (suggestions.length === 0) continue;

    const best = suggestions[0];
    if (best.toLowerCase() === word.toLowerCase()) continue;

    const re = new RegExp(
      `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "g",
    );
    corrected = corrected.replace(re, best);
    corrections.push({ original: word, replacement: best });
  }

  return { corrected, corrections };
}

function isFieldInScope(
  fieldKey: string,
  fieldScope: string[] | undefined,
): boolean {
  if (!fieldScope || fieldScope.length === 0) return true;
  return fieldScope.includes(fieldKey);
}

/**
 * Spellcheck correction activity.
 * Walks all text-bearing fields of OCRResult and applies dictionary-based spellcheck.
 */
export async function spellcheckOcrResult(
  params: SpellcheckParams,
): Promise<CorrectionResult> {
  const log = createActivityLogger("spellcheckOcrResult");
  const { ocrResult, fieldScope } = params;

  log.info("Spellcheck correction start", {
    event: "start",
    fileName: ocrResult.fileName,
    fieldScope,
  });

  const spell = getSpellChecker();
  const result = deepCopyOcrResult(ocrResult);
  const changes: EnrichmentChange[] = [];
  let totalWordsChecked = 0;

  function processKvp(kvp: KeyValuePair): void {
    const key = (kvp.key?.content ?? "").trim();
    if (!key || !isFieldInScope(key, fieldScope)) return;
    if (!kvp.value?.content) return;

    const { corrected, corrections } = spellcheckText(kvp.value.content, spell);
    totalWordsChecked++;

    if (corrections.length > 0) {
      kvp.value.content = corrected;
      for (const c of corrections) {
        changes.push({
          fieldKey: key,
          originalValue: c.original,
          correctedValue: c.replacement,
          reason: `Spellcheck: "${c.original}" → "${c.replacement}"`,
          source: "rule",
        });
      }
    }
  }

  for (const kvp of result.keyValuePairs) {
    processKvp(kvp);
  }

  if (result.documents) {
    for (const doc of result.documents) {
      for (const [fieldKey, fieldData] of Object.entries(doc.fields)) {
        if (!isFieldInScope(fieldKey, fieldScope)) continue;
        const content = (fieldData as { content?: string }).content ?? "";
        if (!content || typeof content !== "string") continue;

        const { corrected, corrections } = spellcheckText(content, spell);
        totalWordsChecked++;

        if (corrections.length > 0) {
          (fieldData as { content?: string }).content = corrected;
          for (const c of corrections) {
            changes.push({
              fieldKey,
              originalValue: c.original,
              correctedValue: c.replacement,
              reason: `Spellcheck: "${c.original}" → "${c.replacement}"`,
              source: "rule",
            });
          }
        }
      }
    }
  }

  log.info("Spellcheck correction complete", {
    event: "complete",
    fileName: ocrResult.fileName,
    changesApplied: changes.length,
    totalWordsChecked,
  });

  return {
    ocrResult: result,
    changes,
    metadata: { totalWordsChecked, language: params.language ?? "en" },
  };
}
