import { getErrorStack,
  getErrorMessage,
} from "@ai-di/shared-logging";
import { createActivityLogger } from "../logger";
import type { OCRResult } from "../types";

/**
 * Activity: Post-OCR processing cleanup
 * Performs text cleanup including unicode/encoding fixes, dehyphenation, and number/date normalization
 */
export async function postOcrCleanup(params: {
  ocrResult: OCRResult;
}): Promise<{ cleanedResult: OCRResult }> {
  const activityName = "postOcrCleanup";
  const { ocrResult } = params;
  const log = createActivityLogger(activityName);

  log.info("Post-OCR cleanup start", {
    event: "start",
    fileName: ocrResult.fileName,
    extractedTextLength: ocrResult.extractedText.length,
  });

  try {
    // Create a deep copy of the OCR result to avoid mutating the original
    const cleanedResult: OCRResult = {
      success: ocrResult.success,
      status: ocrResult.status,
      apimRequestId: ocrResult.apimRequestId,
      fileName: ocrResult.fileName,
      fileType: ocrResult.fileType,
      modelId: ocrResult.modelId,
      processedAt: ocrResult.processedAt,
      extractedText: ocrResult.extractedText,
      pages: ocrResult.pages.map((page) => ({ ...page })),
      paragraphs: ocrResult.paragraphs.map((para) => ({ ...para })),
      tables: ocrResult.tables.map((table) => ({ ...table })),
      keyValuePairs: ocrResult.keyValuePairs.map((kvp) => ({ ...kvp })),
      sections: ocrResult.sections.map((section) => ({ ...section })),
      figures: ocrResult.figures.map((figure) => ({ ...figure })),
      documents: ocrResult.documents,
    };

    // Helper function to clean text
    const cleanText = (text: string): string => {
      if (!text) return text;

      let cleaned = text;

      // 1. Unicode/encoding fix
      // Normalize unicode characters (NFD to NFC)
      cleaned = cleaned.normalize("NFC");

      // Fix common encoding issues
      // Replace common encoding artifacts
      cleaned = cleaned
        .replace(/\u00A0/g, " ") // Non-breaking space to regular space
        .replace(/\u200B/g, "") // Zero-width space
        .replace(/\u200C/g, "") // Zero-width non-joiner
        .replace(/\u200D/g, "") // Zero-width joiner
        .replace(/\uFEFF/g, "") // Zero-width no-break space (BOM)
        .replace(/\u2028/g, "\n") // Line separator
        .replace(/\u2029/g, "\n\n") // Paragraph separator
        .replace(/[\u2000-\u200A]/g, " ") // Various space characters
        .replace(/\u2013/g, "-") // En dash to hyphen
        .replace(/\u2014/g, "--") // Em dash to double hyphen
        .replace(/\u2018/g, "'") // Left single quotation mark
        .replace(/\u2019/g, "'") // Right single quotation mark
        .replace(/\u201C/g, '"') // Left double quotation mark
        .replace(/\u201D/g, '"') // Right double quotation mark
        .replace(/\u2026/g, "...") // Ellipsis
        .replace(/\u00AD/g, "") // Soft hyphen (invisible hyphen)
        .replace(/[\u00A0-\u00FF]/g, (char) => {
          // Keep common Latin-1 characters, but normalize some
          const map: Record<string, string> = {
            "\u00E9": "é",
            "\u00E8": "è",
            "\u00E0": "à",
            "\u00E1": "á",
            "\u00F1": "ñ",
            "\u00FC": "ü",
            "\u00F6": "ö",
            "\u00E4": "ä",
          };
          return map[char] || char;
        });

      // 2. Dehyphenation + line join
      // Remove hyphens at end of lines and join words
      // Pattern: word-hyphen followed by newline/space and continuation
      cleaned = cleaned
        // Remove soft hyphens (already removed above, but keep for safety)
        .replace(/\u00AD/g, "")
        // Handle hyphenated words split across lines
        // Pattern: word- followed by whitespace and lowercase letter
        .replace(/([a-zA-Z])-\s+([a-z])/g, "$1$2")
        // Handle hyphenated words split across lines with newlines
        .replace(/([a-zA-Z])-\n\s*([a-z])/g, "$1$2")
        // Handle hyphenated words with multiple spaces
        .replace(/([a-zA-Z])-\s{2,}([a-z])/g, "$1$2")
        // Clean up multiple consecutive spaces
        .replace(/\s{2,}/g, " ")
        // Clean up spaces around newlines
        .replace(/\s+\n/g, "\n")
        .replace(/\n\s+/g, "\n");

      // 3. Number/date cleanup
      // Normalize number formats
      cleaned = cleaned
        // Fix common OCR number errors (O vs 0, I vs 1, l vs 1 in number contexts)
        // This is conservative - only fix obvious cases
        .replace(/([^a-zA-Z])O(?=\d)/g, "$10") // O before digit -> 0
        .replace(/(\d)O(?=\d)/g, "$10") // O between digits -> 0
        .replace(/(\d)O(?=[^a-zA-Z0-9])/g, "$10") // O after digit -> 0
        // Normalize date separators
        .replace(
          /(\d{1,2})[.\s]+(\d{1,2})[.\s]+(\d{2,4})/g,
          (_match, d, m, y) => {
            // Normalize dates - keep format but normalize separators
            return `${d}/${m}/${y}`;
          },
        )
        // Normalize time separators (but not decimal numbers)
        // Only match if not preceded by a digit (to avoid matching 105.00)
        .replace(
          /(?<!\d)(\d{1,2})[.\s]+(\d{2})[.\s]*([ap]m)?/gi,
          (_match, h, m, ampm) => {
            return ampm ? `${h}:${m} ${ampm}` : `${h}:${m}`;
          },
        )
        // Fix common decimal point issues (comma to period in number contexts)
        .replace(/(\d),(\d)/g, (match, before, after) => {
          // Only replace if it looks like a decimal (not thousands separator)
          // If after has 1-2 digits, likely decimal; if 3+, likely thousands
          if (after.length <= 2) {
            return `${before}.${after}`;
          }
          return match;
        })
        // Normalize currency formats
        .replace(/([£$€¥])\s*(\d)/g, "$1$2") // Remove space after currency symbol
        .replace(/(\d)\s*([£$€¥])/g, "$1$2"); // Remove space before currency symbol

      return cleaned;
    };

    // Clean extracted text
    cleanedResult.extractedText = cleanText(cleanedResult.extractedText);

    // Clean text in pages (words and lines)
    cleanedResult.pages = cleanedResult.pages.map((page) => ({
      ...page,
      words: page.words.map((word) => ({
        ...word,
        content: cleanText(word.content),
      })),
      lines: page.lines.map((line) => ({
        ...line,
        content: cleanText(line.content),
      })),
    }));

    // Clean text in paragraphs
    cleanedResult.paragraphs = cleanedResult.paragraphs.map((para) => ({
      ...para,
      content: cleanText(para.content),
    }));

    // Clean text in table cells
    cleanedResult.tables = cleanedResult.tables.map((table) => ({
      ...table,
      cells: table.cells.map((cell) => ({
        ...cell,
        content: cleanText(cell.content),
      })),
    }));

    // Clean text in key-value pairs
    cleanedResult.keyValuePairs = cleanedResult.keyValuePairs.map((kvp) => ({
      ...kvp,
      key: {
        ...kvp.key,
        content: cleanText(kvp.key.content),
      },
      value: kvp.value
        ? {
            ...kvp.value,
            content: cleanText(kvp.value.content),
          }
        : undefined,
    }));

    // Clean text in sections
    cleanedResult.sections = cleanedResult.sections.map((section) => ({
      ...section,
      content: cleanText(section.content),
    }));

    // Clean text in figures
    cleanedResult.figures = cleanedResult.figures.map((figure) => ({
      ...figure,
      content: cleanText(figure.content),
    }));

    log.info("Post-OCR cleanup complete", {
      event: "complete",
      fileName: cleanedResult.fileName,
      originalTextLength: ocrResult.extractedText.length,
      cleanedTextLength: cleanedResult.extractedText.length,
    });

    // Return with port name as key for output binding
    return { cleanedResult };
  } catch (error) {
    const errorMessage =
      getErrorMessage(error);
    log.error("Post-OCR cleanup error", {
      event: "error",
      fileName: ocrResult.fileName,
      error: errorMessage,
      stack: getErrorStack(error),
    });
    // Return original result if cleanup fails
    return { cleanedResult: ocrResult };
  }
}
