import { FieldDefinition, FieldType } from "@generated/client";
import { Injectable, Logger } from "@nestjs/common";
import {
  AnalysisResponse,
  BoundingRegion,
  KeyValuePair,
  Table,
  TableCell,
} from "@/ocr/azure-types";
import { LabelSuggestionDto } from "./dto/suggestion.dto";

type WordElement = {
  id: string;
  pageNumber: number;
  polygon: number[];
  content: string;
  spanOffset: number;
  spanLength: number;
};

type SelectionElement = {
  id: string;
  pageNumber: number;
  polygon: number[];
  state: "selected" | "unselected";
  confidence: number;
  spanOffset: number;
};

type SuggestionRule = {
  fieldKey: string;
  sourceType: "keyValuePair" | "selectionMarkOrder" | "tableCellToWords";
  keyAliases?: string[];
  selectionOrder?: number;
  table?: {
    anchorText?: string;
    rowLabelAliases?: string[];
    columnLabel?: string;
    wordOverlapThreshold?: number;
  };
  confidenceThreshold?: number;
};

type SuggestionMapping = {
  version?: number;
  rules?: SuggestionRule[];
};

@Injectable()
export class SuggestionService {
  private readonly logger = new Logger(SuggestionService.name);

  generateSuggestions(
    ocrResult: AnalysisResponse,
    fieldSchema: FieldDefinition[],
    mappingInput?: Record<string, unknown> | null,
  ): LabelSuggestionDto[] {
    const mapping = mappingInput as unknown as SuggestionMapping | null;
    const analyzeResult = ocrResult?.analyzeResult;
    if (!analyzeResult?.pages?.length) {
      return [];
    }

    const words = this.extractWordElements(ocrResult);
    const selectionMarks = this.extractSelectionElements(ocrResult);

    const suggestions: LabelSuggestionDto[] = [];
    const usedWordIds = new Set<string>();
    const usedSelectionIds = new Set<string>();

    suggestions.push(
      ...this.suggestFromSelectionMarks(
        fieldSchema,
        selectionMarks,
        usedSelectionIds,
        mapping,
      ),
    );
    suggestions.push(
      ...this.suggestFromKeyValuePairs(
        fieldSchema,
        ocrResult,
        words,
        usedWordIds,
        mapping,
      ),
    );
    suggestions.push(
      ...this.suggestFromTables(
        fieldSchema,
        ocrResult,
        words,
        usedWordIds,
        mapping,
      ),
    );

    return suggestions.sort((a, b) => {
      if (a.page_number !== b.page_number) {
        return a.page_number - b.page_number;
      }
      const aOffset = a.bounding_box?.span?.offset ?? 0;
      const bOffset = b.bounding_box?.span?.offset ?? 0;
      return aOffset - bOffset;
    });
  }

  private extractWordElements(ocrResult: AnalysisResponse): WordElement[] {
    const elements: WordElement[] = [];
    for (const page of ocrResult.analyzeResult?.pages ?? []) {
      const pageNumber = page.pageNumber ?? 1;
      for (const [index, word] of (page.words ?? []).entries()) {
        if (!word.polygon || word.polygon.length < 8) continue;
        elements.push({
          id: `p${pageNumber}-w${index}`,
          pageNumber,
          polygon: word.polygon,
          content: word.content ?? "",
          spanOffset: word.span?.offset ?? 0,
          spanLength: word.span?.length ?? 0,
        });
      }
    }
    return elements;
  }

  private extractSelectionElements(
    ocrResult: AnalysisResponse,
  ): SelectionElement[] {
    const elements: SelectionElement[] = [];
    for (const page of ocrResult.analyzeResult?.pages ?? []) {
      const pageNumber = page.pageNumber ?? 1;
      for (const [index, mark] of (page.selectionMarks ?? []).entries()) {
        if (!mark.polygon || mark.polygon.length < 8) continue;
        elements.push({
          id: `p${pageNumber}-sm${index}`,
          pageNumber,
          polygon: mark.polygon,
          state:
            mark.state === "selected" || mark.state === "unselected"
              ? mark.state
              : "unselected",
          confidence: mark.confidence ?? 0,
          spanOffset: mark.span?.offset ?? 0,
        });
      }
    }
    return elements.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.spanOffset - b.spanOffset;
    });
  }

  private suggestFromSelectionMarks(
    fieldSchema: FieldDefinition[],
    marks: SelectionElement[],
    usedSelectionIds: Set<string>,
    mapping?: SuggestionMapping | null,
  ): LabelSuggestionDto[] {
    const selectionFields = [...fieldSchema]
      .filter((field) => field.field_type === FieldType.selectionMark)
      .sort((a, b) => a.display_order - b.display_order);

    const suggestions: LabelSuggestionDto[] = [];
    for (const [index, field] of selectionFields.entries()) {
      const rule = this.getRule(mapping, field.field_key, "selectionMarkOrder");
      const markIndex = rule?.selectionOrder ?? index;
      const mark = marks[markIndex];
      if (!mark || usedSelectionIds.has(mark.id)) continue;
      usedSelectionIds.add(mark.id);
      suggestions.push({
        field_key: field.field_key,
        label_name: field.field_key,
        value: mark.state,
        page_number: mark.pageNumber,
        element_ids: [mark.id],
        bounding_box: {
          polygon: mark.polygon,
          span: { offset: mark.spanOffset, length: 0 },
        },
        source_type: "selectionMarkOrder",
        confidence: mark.confidence,
        explanation:
          rule?.selectionOrder !== undefined
            ? `Assigned by configured selectionOrder=${rule.selectionOrder}`
            : "Assigned by field schema order to selection mark order",
      });
    }
    return suggestions;
  }

  private suggestFromKeyValuePairs(
    fieldSchema: FieldDefinition[],
    ocrResult: AnalysisResponse,
    words: WordElement[],
    usedWordIds: Set<string>,
    mapping?: SuggestionMapping | null,
  ): LabelSuggestionDto[] {
    const keyValuePairs = ocrResult.analyzeResult?.keyValuePairs ?? [];
    this.logger.debug(
      `[suggestFromKeyValuePairs] Found ${keyValuePairs.length} keyValuePairs`,
    );

    if (!keyValuePairs.length) return [];

    const kvpEligibleFields = fieldSchema
      .filter(
        (f) =>
          f.field_type !== FieldType.selectionMark &&
          f.field_type !== FieldType.number,
      )
      .sort((a, b) => a.display_order - b.display_order);

    this.logger.debug(
      `[suggestFromKeyValuePairs] Eligible fields (${kvpEligibleFields.length}): ${kvpEligibleFields.map((f) => `${f.field_key}(order=${f.display_order})`).join(", ")}`,
    );

    const fieldAliases = new Map<string, string[]>();
    const fieldRules = new Map<string, SuggestionRule | undefined>();
    for (const field of kvpEligibleFields) {
      const rule = this.getRule(mapping, field.field_key, "keyValuePair");
      fieldRules.set(field.field_key, rule);
      const aliases = rule?.keyAliases?.length
        ? rule.keyAliases
        : this.buildFieldAliases(field.field_key);
      fieldAliases.set(field.field_key, aliases);
      this.logger.debug(
        `[suggestFromKeyValuePairs] Field "${field.field_key}" aliases: [${aliases.join(", ")}]`,
      );
    }

    const assignedFields = new Set<string>();
    const suggestions: LabelSuggestionDto[] = [];

    // Sort keyValuePairs by best match score (descending) so exact matches get priority.
    // This ensures "Spouse Signature" matches before generic "Spouse" from table headers.
    // For repeated keys with same score (e.g. Date, SIN), document order is preserved.
    const pairsWithScores = keyValuePairs.map((pair, index) => {
      const keyText = this.normalizeText(pair.key?.content ?? "");
      let bestScore = 0;

      if (keyText) {
        for (const field of kvpEligibleFields) {
          const aliases = fieldAliases.get(field.field_key) ?? [];
          for (const alias of aliases) {
            const aliasNorm = this.normalizeText(alias);
            const score = this.scoreTextMatch(aliasNorm, keyText);
            bestScore = Math.max(bestScore, score);
          }
        }
      }

      return { pair, bestScore, originalIndex: index };
    });

    // Sort by best score (desc), then by original document order (asc) for ties
    pairsWithScores.sort((a, b) => {
      if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
      return a.originalIndex - b.originalIndex;
    });

    this.logger.debug(
      `[suggestFromKeyValuePairs] Sorted keyValuePairs by match quality: ${pairsWithScores.map((p) => `"${p.pair.key?.content}"(score=${p.bestScore.toFixed(2)})`).join(", ")}`,
    );

    for (const { pair } of pairsWithScores) {
      const keyText = this.normalizeText(pair.key?.content ?? "");
      if (!keyText) continue;

      this.logger.debug(
        `[suggestFromKeyValuePairs] Processing keyValuePair: key="${pair.key?.content}" (normalized="${keyText}"), value="${pair.value?.content}"`,
      );

      const best = this.findBestFieldForPair(
        pair,
        kvpEligibleFields,
        fieldAliases,
        assignedFields,
      );

      if (!best) {
        this.logger.debug(
          `[suggestFromKeyValuePairs] No matching field found for key="${pair.key?.content}"`,
        );
        continue;
      }

      this.logger.debug(
        `[suggestFromKeyValuePairs] Best match: field="${best.field.field_key}" (score=${best.score.toFixed(2)}, aliasLength=${best.aliasLength}, display_order=${best.field.display_order})`,
      );

      const { field } = best;
      const rule = fieldRules.get(field.field_key);
      if (
        rule?.confidenceThreshold !== undefined &&
        pair.confidence < rule.confidenceThreshold
      ) {
        this.logger.debug(
          `[suggestFromKeyValuePairs] Skipping field "${field.field_key}": confidence ${pair.confidence} < threshold ${rule.confidenceThreshold}`,
        );
        continue;
      }

      const valueRegion = this.getBestRegion(pair.value?.boundingRegions);
      const valueSpan = pair.value?.spans?.[0];
      const valueContent = (pair.value?.content ?? "").trim();

      if (!valueRegion && !valueSpan) {
        this.logger.debug(
          `[suggestFromKeyValuePairs] Skipping field "${field.field_key}": no value region or span`,
        );
        continue;
      }
      if (!valueContent) {
        this.logger.debug(
          `[suggestFromKeyValuePairs] Skipping field "${field.field_key}": empty value content`,
        );
        continue;
      }

      const matchedWords = valueSpan
        ? this.matchWordsBySpan(words, valueSpan, usedWordIds)
        : this.matchWordsInRegion(words, valueRegion, usedWordIds);
      if (!matchedWords.length) {
        this.logger.debug(
          `[suggestFromKeyValuePairs] Skipping field "${field.field_key}": no matched words in region`,
        );
        continue;
      }

      const region = valueRegion ?? this.regionFromWords(matchedWords);
      if (!region) {
        this.logger.debug(
          `[suggestFromKeyValuePairs] Skipping field "${field.field_key}": could not determine region`,
        );
        continue;
      }

      matchedWords.forEach((word) => usedWordIds.add(word.id));
      assignedFields.add(field.field_key);
      const valueText =
        pair.value?.content ??
        matchedWords.map((word) => word.content).join(" ");
      const suggestionSpan = pair.value?.spans?.[0] ?? pair.key?.spans?.[0];

      this.logger.debug(
        `[suggestFromKeyValuePairs] ✓ Assigned "${field.field_key}" = "${valueText}" (${matchedWords.length} words, page ${region.pageNumber})`,
      );

      suggestions.push({
        field_key: field.field_key,
        label_name: field.field_key,
        value: valueText,
        page_number: region.pageNumber,
        element_ids: matchedWords.map((word) => word.id),
        bounding_box: {
          polygon: region.polygon,
          span: suggestionSpan,
        },
        source_type: "keyValuePair",
        confidence: pair.confidence,
        explanation: `Matched key "${pair.key?.content}" from keyValuePairs`,
      });
    }

    this.logger.debug(
      `[suggestFromKeyValuePairs] Generated ${suggestions.length} suggestions from keyValuePairs`,
    );
    return suggestions;
  }

  /** Find the best unassigned field for this keyValuePair (by score, then alias length, then schema order). */
  private findBestFieldForPair(
    pair: KeyValuePair,
    fields: FieldDefinition[],
    fieldAliases: Map<string, string[]>,
    assignedFields: Set<string>,
  ): { field: FieldDefinition; score: number; aliasLength: number } | null {
    const keyText = this.normalizeText(pair.key?.content ?? "");
    if (!keyText) return null;

    let best: {
      field: FieldDefinition;
      score: number;
      aliasLength: number;
    } | null = null;

    const candidateFields: Array<{
      field: string;
      score: number;
      aliasLength: number;
      assigned: boolean;
    }> = [];

    for (const field of fields) {
      const isAssigned = assignedFields.has(field.field_key);

      const aliases = fieldAliases.get(field.field_key) ?? [];
      let score = 0;
      let bestAliasLength = 0;
      let matchedAlias = "";
      for (const alias of aliases) {
        const aliasNorm = this.normalizeText(alias);
        const s = this.scoreTextMatch(aliasNorm, keyText);
        if (s > score || (s === score && aliasNorm.length > bestAliasLength)) {
          score = s;
          bestAliasLength = aliasNorm.length;
          matchedAlias = alias;
        }
      }

      if (score >= 0.45) {
        candidateFields.push({
          field: `${field.field_key}(score=${score.toFixed(2)}, aliasLen=${bestAliasLength}, alias="${matchedAlias}", order=${field.display_order})`,
          score,
          aliasLength: bestAliasLength,
          assigned: isAssigned,
        });
      }

      if (isAssigned) continue;
      if (score < 0.45) continue;

      const prefer =
        !best ||
        score > best.score ||
        (score === best.score && bestAliasLength > best.aliasLength) ||
        (score === best.score &&
          bestAliasLength === best.aliasLength &&
          field.display_order < best.field.display_order);
      if (prefer) {
        best = { field, score, aliasLength: bestAliasLength };
      }
    }

    if (candidateFields.length > 0) {
      this.logger.debug(
        `[findBestFieldForPair] key="${pair.key?.content}" candidates: ${candidateFields.map((c) => `${c.field}${c.assigned ? "[ASSIGNED]" : ""}`).join(", ")}`,
      );
    }

    return best;
  }

  private suggestFromTables(
    fieldSchema: FieldDefinition[],
    ocrResult: AnalysisResponse,
    words: WordElement[],
    usedWordIds: Set<string>,
    mapping?: SuggestionMapping | null,
  ): LabelSuggestionDto[] {
    const tables = ocrResult.analyzeResult?.tables ?? [];
    this.logger.debug(
      `[suggestFromTables] tables=${tables.length}, words=${words.length}`,
    );
    if (!tables.length) return [];

    const suggestions: LabelSuggestionDto[] = [];
    const numericFields = fieldSchema
      .filter((field) => field.field_type === FieldType.number)
      .sort((a, b) => a.display_order - b.display_order);

    for (const field of numericFields) {
      const rule = this.getRule(mapping, field.field_key, "tableCellToWords");
      const inferred = this.parseTableFieldKey(field.field_key);
      const rowLabelAliases =
        rule?.table?.rowLabelAliases && rule.table.rowLabelAliases.length > 0
          ? rule.table.rowLabelAliases
          : inferred
            ? [inferred.rowLabel]
            : [];
      const columnLabel = rule?.table?.columnLabel ?? inferred?.columnLabel;
      const anchorText = rule?.table?.anchorText;
      const overlapThreshold = rule?.table?.wordOverlapThreshold ?? 0.05;
      if (!columnLabel || rowLabelAliases.length === 0) {
        this.logger.debug(
          `[suggestFromTables] skip ${field.field_key}: no columnLabel or rowLabelAliases`,
        );
        continue;
      }

      const tableMatch = this.findTableCellMatch(
        tables,
        rowLabelAliases,
        columnLabel,
        anchorText,
      );
      if (!tableMatch?.valueCell) {
        this.logger.debug(
          `[suggestFromTables] ${field.field_key}: no table match (rowLabels=[${rowLabelAliases.join(",")}], column=${columnLabel})`,
        );
        continue;
      }

      this.logger.debug(
        `[suggestFromTables] ${field.field_key}: matched row "${tableMatch.rowHeader.content}" col ${tableMatch.valueCell.columnIndex}, valueCell.content="${tableMatch.valueCell.content}"`,
      );

      const region = this.getBestRegion(tableMatch.valueCell.boundingRegions);
      if (!region) {
        this.logger.debug(
          `[suggestFromTables] ${field.field_key}: value cell has no boundingRegions`,
        );
        continue;
      }

      let matchedWords = this.matchWordsInRegion(
        words,
        region,
        usedWordIds,
        overlapThreshold,
        true,
      );
      if (!matchedWords.length) {
        const pageWords = words.filter(
          (w) => w.pageNumber === region.pageNumber,
        );
        const usedOnPage = pageWords.filter((w) =>
          usedWordIds.has(w.id),
        ).length;
        this.logger.debug(
          `[suggestFromTables] ${field.field_key}: no words in region (page=${region.pageNumber}, ` +
            `regionPolygon=[${region.polygon.slice(0, 4).join(",")}...], ` +
            `pageWords=${pageWords.length}, usedOnPage=${usedOnPage})`,
        );
        continue;
      }

      // Exclude currency-only tokens (e.g. "$") so we suggest only the numeric value.
      matchedWords = matchedWords.filter(
        (word) => !this.isCurrencyOnlyWord(word.content),
      );
      if (!matchedWords.length) {
        this.logger.debug(
          `[suggestFromTables] ${field.field_key}: only currency symbols in cell, skipping`,
        );
        continue;
      }

      matchedWords.forEach((word) => usedWordIds.add(word.id));
      const valueText = matchedWords
        .map((word) => word.content)
        .join(" ")
        .trim();

      suggestions.push({
        field_key: field.field_key,
        label_name: field.field_key,
        value: valueText,
        page_number: region.pageNumber,
        element_ids: matchedWords.map((word) => word.id),
        bounding_box: {
          polygon: region.polygon,
          span: tableMatch.valueCell.spans?.[0],
        },
        source_type: "tableCellToWords",
        confidence: 0.85,
        explanation: `Mapped from table row "${tableMatch.rowHeader.content}" and column "${columnLabel}"`,
      });
    }

    return suggestions;
  }

  private buildFieldAliases(fieldKey: string): string[] {
    const aliases = new Set<string>();
    aliases.add(fieldKey);
    aliases.add(fieldKey.replace(/_/g, " "));

    const parts = fieldKey.split("_").filter(Boolean);

    // Don't generate generic prefixes like "spouse" or "applicant" as aliases for fields
    // that end with common suffixes (date, name, signature, etc.)
    // This prevents "spouse_date" from matching "Spouse:" labels incorrectly
    const commonFieldSuffixes = new Set([
      "date",
      "name",
      "signature",
      "phone",
      "sin",
      "email",
      "address",
      "city",
      "province",
      "postal",
      "code",
      "number",
    ]);
    const lastPart = parts[parts.length - 1];
    const shouldSkipGenericPrefixAlias = commonFieldSuffixes.has(lastPart);

    if (parts.length > 1) {
      const withoutPrefix = parts.slice(1).join("_");
      aliases.add(withoutPrefix);
      aliases.add(withoutPrefix.replace(/_/g, " "));

      // Only add withoutSuffix alias if it's not a generic prefix
      if (!shouldSkipGenericPrefixAlias) {
        const withoutSuffix = parts.slice(0, -1).join("_");
        aliases.add(withoutSuffix);
        aliases.add(withoutSuffix.replace(/_/g, " "));
      }
    }

    // Common form label aliases for known field keys (OCR often uses full labels).
    if (fieldKey === "sin") {
      aliases.add("social insurance number");
      aliases.add("sin number");
      aliases.add("sin #");
    }
    if (fieldKey === "spouse_sin") {
      aliases.add("social insurance number");
      aliases.add("sin number");
      aliases.add("sin #");
      aliases.add("spouse social insurance number");
    }
    if (fieldKey === "phone") {
      aliases.add("telephone");
    }
    if (fieldKey === "spouse_phone") {
      aliases.add("telephone");
      aliases.add("spouse telephone");
    }

    return [...aliases];
  }

  private parseTableFieldKey(
    fieldKey: string,
  ): { columnLabel: string; rowLabel: string } | null {
    const parts = fieldKey.split("_").filter(Boolean);
    if (parts.length < 2) return null;

    const columnLabel = parts[0]
      .split(" ")
      .map((part) =>
        part.length > 0
          ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
          : part,
      )
      .join(" ");
    const rowLabel = parts.slice(1).join(" ").trim();
    if (!columnLabel || !rowLabel) return null;

    return { columnLabel, rowLabel };
  }

  private getRule(
    mapping: SuggestionMapping | null | undefined,
    fieldKey: string,
    sourceType: SuggestionRule["sourceType"],
  ): SuggestionRule | undefined {
    return mapping?.rules?.find(
      (rule) => rule.fieldKey === fieldKey && rule.sourceType === sourceType,
    );
  }

  private findTableCellMatch(
    tables: Table[],
    rowLabels: string[],
    columnLabel: string,
    anchorText?: string,
  ): { rowHeader: TableCell; valueCell: TableCell } | null {
    const normalizedRowLabels = rowLabels.map((label) =>
      this.normalizeText(label),
    );
    const normalizedColumnLabel = this.normalizeText(columnLabel);
    const normalizedAnchor = anchorText ? this.normalizeText(anchorText) : null;

    for (let ti = 0; ti < tables.length; ti++) {
      const table = tables[ti];
      if (normalizedAnchor) {
        const hasAnchor = table.cells.some((cell) =>
          this.normalizeText(cell.content ?? "").includes(normalizedAnchor),
        );
        if (!hasAnchor) continue;
      }

      let bestColumnHeader: { cell: TableCell; score: number } | null = null;
      for (const cell of table.cells) {
        const text = this.normalizeText(cell.content ?? "");
        const score = this.scoreTextMatch(normalizedColumnLabel, text);
        if (
          score > 0 &&
          (!bestColumnHeader || score > bestColumnHeader.score)
        ) {
          bestColumnHeader = { cell, score };
        }
      }
      if (!bestColumnHeader || bestColumnHeader.score < 0.4) {
        this.logger.debug(
          `[findTableCellMatch] table ${ti}: no column match for "${columnLabel}" (bestScore=${bestColumnHeader?.score ?? 0})`,
        );
        continue;
      }
      const applicantOrSpouseHeader = bestColumnHeader.cell;

      const valueColumnIndex = applicantOrSpouseHeader.columnIndex;
      const rowHeaderCells = table.cells.filter(
        (cell) => cell.columnIndex === 0,
      );

      let bestRow: { cell: TableCell; score: number } | null = null;
      for (const rowHeader of rowHeaderCells) {
        const rowText = this.normalizeText(rowHeader.content ?? "");
        let score = 0;
        for (const normalizedRowLabel of normalizedRowLabels) {
          score = Math.max(
            score,
            this.scoreTextMatch(normalizedRowLabel, rowText),
          );
        }
        if (score > 0 && (!bestRow || score > bestRow.score)) {
          bestRow = { cell: rowHeader, score };
        }
      }
      if (!bestRow || bestRow.score < 0.4) {
        this.logger.debug(
          `[findTableCellMatch] table ${ti}: no row match for [${rowLabels.join("|")}] (bestScore=${bestRow?.score ?? 0}, rowHeaderCells=${rowHeaderCells.length})`,
        );
        continue;
      }

      const valueCell = table.cells.find(
        (cell) =>
          cell.rowIndex === bestRow.cell.rowIndex &&
          cell.columnIndex === valueColumnIndex,
      );
      if (!valueCell) {
        this.logger.debug(
          `[findTableCellMatch] table ${ti}: no value cell at row ${bestRow.cell.rowIndex} col ${valueColumnIndex}`,
        );
        continue;
      }

      this.logger.debug(
        `[findTableCellMatch] table ${ti}: matched row "${bestRow.cell.content}" (rowIndex=${bestRow.cell.rowIndex}) col ${valueColumnIndex}`,
      );
      return { rowHeader: bestRow.cell, valueCell };
    }

    return null;
  }

  private matchWordsInRegion(
    words: WordElement[],
    region: BoundingRegion,
    usedWordIds: Set<string>,
    overlapThreshold = 0.05,
    useContainment = false,
  ): WordElement[] {
    const candidates = words.filter(
      (word) => word.pageNumber === region.pageNumber,
    );
    const regionRect = this.toBoundingRect(region.polygon);
    const withOverlap = candidates
      .map((word) => {
        const overlap = this.computeIoU(region.polygon, word.polygon);
        let containment = 0;
        if (useContainment && regionRect) {
          const wordRect = this.toBoundingRect(word.polygon);
          if (wordRect) {
            const left = Math.max(regionRect.minX, wordRect.minX);
            const right = Math.min(regionRect.maxX, wordRect.maxX);
            const top = Math.max(regionRect.minY, wordRect.minY);
            const bottom = Math.min(regionRect.maxY, wordRect.maxY);
            if (right > left && bottom > top) {
              const intersection = (right - left) * (bottom - top);
              const wordArea =
                (wordRect.maxX - wordRect.minX) *
                (wordRect.maxY - wordRect.minY);
              containment = wordArea > 0 ? intersection / wordArea : 0;
            }
          }
        }
        return { word, overlap, containment };
      })
      .filter(({ overlap, containment, word }) => {
        if (usedWordIds.has(word.id)) return false;
        if (overlap > overlapThreshold) return true;
        if (useContainment && containment >= 0.5) return true;
        return false;
      })
      .sort((a, b) => {
        const scoreA = Math.max(a.overlap, a.containment);
        const scoreB = Math.max(b.overlap, b.containment);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.word.spanOffset - b.word.spanOffset;
      });

    if (useContainment && withOverlap.length > 0) {
      this.logger.debug(
        `[matchWordsInRegion] containment: matched ${withOverlap.length} words, ` +
          `overlaps=[${withOverlap.map((e) => e.overlap.toFixed(3)).join(",")}], ` +
          `containments=[${withOverlap.map((e) => e.containment.toFixed(3)).join(",")}]`,
      );
    }
    return withOverlap.map((entry) => entry.word);
  }

  /** Match words whose span overlaps the given value span (document character range). */
  private matchWordsBySpan(
    words: WordElement[],
    valueSpan: { offset: number; length: number },
    usedWordIds: Set<string>,
  ): WordElement[] {
    const valueEnd = valueSpan.offset + valueSpan.length;
    return words
      .filter((word) => {
        if (usedWordIds.has(word.id)) return false;
        const wordEnd = word.spanOffset + word.spanLength;
        return wordEnd > valueSpan.offset && word.spanOffset < valueEnd;
      })
      .sort((a, b) => a.spanOffset - b.spanOffset);
  }

  /** Build a bounding region from the combined polygons of words (same page). */
  private regionFromWords(words: WordElement[]): BoundingRegion | null {
    if (!words.length) return null;
    const pageNumber = words[0].pageNumber;
    const allPolygons = words
      .map((w) => w.polygon)
      .filter((p) => p?.length >= 8);
    if (!allPolygons.length) return null;
    const xs = allPolygons.flatMap((p) => p.filter((_, i) => i % 2 === 0));
    const ys = allPolygons.flatMap((p) => p.filter((_, i) => i % 2 === 1));
    const polygon = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
      Math.min(...xs),
      Math.max(...ys),
    ];
    return { pageNumber, polygon };
  }

  private getBestRegion(regions?: BoundingRegion[]): BoundingRegion | null {
    if (!regions?.length) return null;
    return regions[0] ?? null;
  }

  /** True if the word is only a currency symbol (e.g. "$"), so we skip it for numeric table values. */
  private isCurrencyOnlyWord(content: string): boolean {
    const t = content.trim();
    if (!t) return false;
    return /^[$€£¥]+$/.test(t);
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[\u2018\u2019']/g, "") // collapse apostrophes so "worker's" -> "workers"
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private scoreTextMatch(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;

    // Check token-level matching first (more accurate than substring matching)
    // a = alias (from field), b = key (from document OCR)
    const aTokens = new Set(a.split(" ").filter(Boolean));
    const bTokens = new Set(b.split(" ").filter(Boolean));
    const intersection = [...aTokens].filter((token) => bTokens.has(token));
    const union = new Set([...aTokens, ...bTokens]);

    // If all tokens match, it's a perfect match
    if (
      intersection.length === aTokens.size &&
      intersection.length === bTokens.size
    ) {
      return 1;
    }

    // Check if all tokens from the ALIAS are contained in the KEY
    // This is the desired direction: we want the alias to be fully represented in the key text
    // Example: alias "date" should match key "Date (yyyy-mmm-dd)"
    // Example: alias "spouse date" should NOT match key "Spouse" (only 1 of 2 tokens)
    if (intersection.length === aTokens.size) {
      // All alias tokens are present in the key
      // If token counts are close (within 1), it's a strong match
      if (bTokens.size - aTokens.size <= 1) {
        const score = 0.9;
        this.logger.debug(
          `[scoreTextMatch] "${a}" vs "${b}" → ${score.toFixed(2)} (all alias tokens in key, counts close: ${aTokens.size} vs ${bTokens.size})`,
        );
        return score;
      }
      // For longer keys with extra descriptive text (e.g., "Date (yyyy-mmm-dd)"),
      // still give a good score if the alias is fully contained
      // Base score 0.8 for full alias containment, reduced slightly by extra tokens
      const extraTokenRatio = (bTokens.size - aTokens.size) / bTokens.size;
      const score = 0.8 - 0.2 * extraTokenRatio;
      this.logger.debug(
        `[scoreTextMatch] "${a}" vs "${b}" → ${score.toFixed(2)} (all alias tokens contained in key with ${bTokens.size - aTokens.size} extra tokens)`,
      );
      return score;
    }

    // Jaccard similarity for partial token overlap
    const score = union.size > 0 ? intersection.length / union.size : 0;
    if (score > 0) {
      this.logger.debug(
        `[scoreTextMatch] "${a}" vs "${b}" → ${score.toFixed(2)} (jaccard: ${intersection.length} / ${union.size} tokens)`,
      );
    }
    return score;
  }

  private computeIoU(polygonA: number[], polygonB: number[]): number {
    const a = this.toBoundingRect(polygonA);
    const b = this.toBoundingRect(polygonB);
    if (!a || !b) return 0;

    const left = Math.max(a.minX, b.minX);
    const right = Math.min(a.maxX, b.maxX);
    const top = Math.max(a.minY, b.minY);
    const bottom = Math.min(a.maxY, b.maxY);

    if (right <= left || bottom <= top) return 0;

    const intersection = (right - left) * (bottom - top);
    const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
    const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
    const union = areaA + areaB - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private toBoundingRect(
    polygon: number[],
  ): { minX: number; minY: number; maxX: number; maxY: number } | null {
    if (!polygon || polygon.length < 8) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < polygon.length; i += 2) {
      xs.push(polygon[i]);
      ys.push(polygon[i + 1]);
    }
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
}
