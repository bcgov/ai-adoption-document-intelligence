import { FieldDefinition, FieldType } from "@generated/client";
import { Injectable } from "@nestjs/common";
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
      ...this.suggestFromTables(fieldSchema, ocrResult, words, usedWordIds, mapping),
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

  private extractSelectionElements(ocrResult: AnalysisResponse): SelectionElement[] {
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
    if (!keyValuePairs.length) return [];

    const suggestions: LabelSuggestionDto[] = [];
    for (const field of fieldSchema) {
      if (field.field_type === FieldType.selectionMark) continue;
      if (field.field_type === FieldType.number) continue;

      const rule = this.getRule(mapping, field.field_key, "keyValuePair");
      const aliases =
        rule?.keyAliases && rule.keyAliases.length > 0
          ? rule.keyAliases
          : this.buildFieldAliases(field.field_key);
      const bestMatch = this.findBestKeyValuePair(aliases, keyValuePairs);
      if (!bestMatch) continue;

      if (
        rule?.confidenceThreshold !== undefined
        && bestMatch.confidence < rule.confidenceThreshold
      ) {
        continue;
      }

      // Use only the value's region: do not fall back to key region, so we never
      // assign the key label (e.g. "Spouse signature") as the value, and we skip
      // when there is no value region (e.g. empty spouse signature).
      const valueRegion = this.getBestRegion(bestMatch.value?.boundingRegions);
      const valueSpan = bestMatch.value?.spans?.[0];
      const valueContent = (bestMatch.value?.content ?? "").trim();

      if (!valueRegion && !valueSpan) continue;
      // Do not suggest when value has no content (e.g. no spouse signature on form).
      if (!valueContent) continue;

      const matchedWords = valueSpan
        ? this.matchWordsBySpan(words, valueSpan, usedWordIds)
        : this.matchWordsInRegion(words, valueRegion, usedWordIds);
      if (!matchedWords.length) continue;

      const region = valueRegion ?? this.regionFromWords(matchedWords);
      if (!region) continue;

      matchedWords.forEach((word) => usedWordIds.add(word.id));
      const valueText =
        bestMatch.value?.content
        ?? matchedWords.map((word) => word.content).join(" ");

      const suggestionSpan = bestMatch.value?.spans?.[0] ?? bestMatch.key?.spans?.[0];
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
        confidence: bestMatch.confidence,
        explanation: `Matched key "${bestMatch.key.content}" from keyValuePairs`,
      });
    }
    return suggestions;
  }

  private suggestFromTables(
    fieldSchema: FieldDefinition[],
    ocrResult: AnalysisResponse,
    words: WordElement[],
    usedWordIds: Set<string>,
    mapping?: SuggestionMapping | null,
  ): LabelSuggestionDto[] {
    const tables = ocrResult.analyzeResult?.tables ?? [];
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
      if (!columnLabel || rowLabelAliases.length === 0) continue;

      const tableMatch = this.findTableCellMatch(
        tables,
        rowLabelAliases,
        columnLabel,
        anchorText,
      );
      if (!tableMatch?.valueCell) continue;

      const region = this.getBestRegion(tableMatch.valueCell.boundingRegions);
      if (!region) continue;

      const matchedWords = this.matchWordsInRegion(
        words,
        region,
        usedWordIds,
        overlapThreshold,
      );
      if (!matchedWords.length) continue;

      matchedWords.forEach((word) => usedWordIds.add(word.id));
      const valueText = matchedWords.map((word) => word.content).join(" ").trim();

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

  private findBestKeyValuePair(
    aliases: string[],
    keyValuePairs: KeyValuePair[],
  ): KeyValuePair | null {
    let best: { pair: KeyValuePair; score: number } | null = null;

    for (const pair of keyValuePairs) {
      const keyText = this.normalizeText(pair.key?.content ?? "");
      if (!keyText) continue;

      let score = 0;
      for (const alias of aliases) {
        const aliasNorm = this.normalizeText(alias);
        score = Math.max(score, this.scoreTextMatch(aliasNorm, keyText));
      }

      if (score > 0 && (!best || score > best.score)) {
        best = { pair, score };
      }
    }

    return best && best.score >= 0.45 ? best.pair : null;
  }

  private buildFieldAliases(fieldKey: string): string[] {
    const aliases = new Set<string>();
    aliases.add(fieldKey);
    aliases.add(fieldKey.replace(/_/g, " "));

    const parts = fieldKey.split("_").filter(Boolean);
    if (parts.length > 1) {
      const withoutPrefix = parts.slice(1).join("_");
      aliases.add(withoutPrefix);
      aliases.add(withoutPrefix.replace(/_/g, " "));

      const withoutSuffix = parts.slice(0, -1).join("_");
      aliases.add(withoutSuffix);
      aliases.add(withoutSuffix.replace(/_/g, " "));
    }

    // Common form label aliases for known field keys (OCR often uses full labels).
    if (fieldKey === "sin") {
      aliases.add("social insurance number");
      aliases.add("sin number");
      aliases.add("sin #");
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
    const normalizedRowLabels = rowLabels.map((label) => this.normalizeText(label));
    const normalizedColumnLabel = this.normalizeText(columnLabel);
    const normalizedAnchor = anchorText ? this.normalizeText(anchorText) : null;

    for (const table of tables) {
      if (normalizedAnchor) {
        const hasAnchor = table.cells.some((cell) =>
          this.normalizeText(cell.content ?? "").includes(normalizedAnchor),
        );
        if (!hasAnchor) continue;
      }

      const applicantOrSpouseHeader = table.cells.find((cell) => {
        const text = this.normalizeText(cell.content ?? "");
        return text.includes(normalizedColumnLabel);
      });
      if (!applicantOrSpouseHeader) continue;

      const valueColumnIndex = applicantOrSpouseHeader.columnIndex;
      const rowHeaderCells = table.cells.filter((cell) => cell.columnIndex === 0);

      let bestRow: { cell: TableCell; score: number } | null = null;
      for (const rowHeader of rowHeaderCells) {
        const rowText = this.normalizeText(rowHeader.content ?? "");
        let score = 0;
        for (const normalizedRowLabel of normalizedRowLabels) {
          score = Math.max(score, this.scoreTextMatch(normalizedRowLabel, rowText));
        }
        if (score > 0 && (!bestRow || score > bestRow.score)) {
          bestRow = { cell: rowHeader, score };
        }
      }
      if (!bestRow || bestRow.score < 0.4) continue;

      const valueCell = table.cells.find(
        (cell) =>
          cell.rowIndex === bestRow.cell.rowIndex
          && cell.columnIndex === valueColumnIndex,
      );
      if (!valueCell) continue;

      return { rowHeader: bestRow.cell, valueCell };
    }

    return null;
  }

  private matchWordsInRegion(
    words: WordElement[],
    region: BoundingRegion,
    usedWordIds: Set<string>,
    overlapThreshold = 0.05,
  ): WordElement[] {
    const candidates = words.filter((word) => word.pageNumber === region.pageNumber);
    const withOverlap = candidates
      .map((word) => ({
        word,
        overlap: this.computeIoU(region.polygon, word.polygon),
      }))
      .filter(
        ({ overlap, word }) => overlap > overlapThreshold && !usedWordIds.has(word.id),
      )
      .sort((a, b) => {
        if (b.overlap !== a.overlap) return b.overlap - a.overlap;
        return a.word.spanOffset - b.word.spanOffset;
      });

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
    const allPolygons = words.map((w) => w.polygon).filter((p) => p?.length >= 8);
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

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private scoreTextMatch(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;

    const aTokens = new Set(a.split(" "));
    const bTokens = new Set(b.split(" "));
    const intersection = [...aTokens].filter((token) => bTokens.has(token));
    const union = new Set([...aTokens, ...bTokens]).size;
    return union > 0 ? intersection.length / union : 0;
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
