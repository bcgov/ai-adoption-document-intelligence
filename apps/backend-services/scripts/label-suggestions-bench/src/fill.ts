import {
  type PDFAcroField,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  type PDFField,
  PDFHexString,
  PDFName,
  type PDFPage,
  PDFRadioGroup,
  PDFString,
  PDFTextField,
  StandardFonts,
} from "pdf-lib";
import { createRng, seedFor, valueFor } from "./values";

export interface AnswerLocation {
  page: number;
  /** [left, top, right, bottom], normalised to 0–1 with the origin top-left. */
  rect: [number, number, number, number];
}

export interface AnswerField {
  key: string;
  pdfName: string;
  type: "string" | "selectionMark";
  /** The text written, or "selected" / "unselected" for a checkbox. */
  value: string;
  /** The field's tooltip (/TU), used as its description when present. */
  description: string | null;
  locations: AnswerLocation[];
}

export interface AnswerKey {
  formId: string;
  copy: number;
  seed: number;
  fields: AnswerField[];
}

/** Same rules as the backend's suggested-field keys: lowercase snake_case starting with a letter. */
export function toFieldKey(pdfName: string): string {
  const key = pdfName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (key.length === 0) return "field";
  return /^[a-z]/.test(key) ? key : `field_${key}`;
}

function uniqueKey(key: string, used: Set<string>): string {
  let candidate = key;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${key}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function tooltip(acroField: PDFAcroField): string | null {
  const raw = acroField.dict.lookup(PDFName.of("TU"));
  if (raw instanceof PDFString || raw instanceof PDFHexString) {
    const text = raw.decodeText().trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

function locationsOf(
  field: PDFField,
  doc: PDFDocument,
  pages: PDFPage[],
): AnswerLocation[] {
  const locations: AnswerLocation[] = [];
  for (const widget of field.acroField.getWidgets()) {
    const pageRef = widget.P();
    let pageIndex = pages.findIndex((page) => page.ref === pageRef);
    if (pageIndex < 0) {
      const widgetRef = doc.context.getObjectRef(widget.dict);
      pageIndex = pages.findIndex(
        (page) =>
          page.node
            .Annots()
            ?.asArray()
            .some((annot) => annot === widgetRef) ?? false,
      );
    }
    if (pageIndex < 0) continue;
    const box = pages[pageIndex].getMediaBox();
    const rect = widget.getRectangle();
    locations.push({
      page: pageIndex + 1,
      rect: [
        (rect.x - box.x) / box.width,
        1 - (rect.y - box.y + rect.height) / box.height,
        (rect.x - box.x + rect.width) / box.width,
        1 - (rect.y - box.y) / box.height,
      ],
    });
  }
  return locations;
}

/**
 * Fills every writable field with seeded made-up values, flattens the form
 * into plain page content, and returns the answer key. Radio groups and
 * dropdowns are filled for realism but not recorded, because they are not scored.
 */
export async function fillForm(
  source: Uint8Array,
  formId: string,
  copy: number,
): Promise<{ pdf: Uint8Array; answers: AnswerKey }> {
  const doc = await PDFDocument.load(source);
  const form = doc.getForm();
  const pages = doc.getPages();
  const seed = seedFor(formId, copy);
  const rng = createRng(seed);
  const usedKeys = new Set<string>();
  const fields: AnswerField[] = [];

  for (const field of form.getFields()) {
    if (field.isReadOnly()) continue;
    const pdfName = field.getName();
    if (field instanceof PDFTextField) {
      const value = valueFor(
        pdfName,
        field.isMultiline(),
        field.getMaxLength(),
        rng,
      );
      field.setText(value);
      fields.push({
        key: uniqueKey(toFieldKey(pdfName), usedKeys),
        pdfName,
        type: "string",
        value,
        description: tooltip(field.acroField),
        locations: locationsOf(field, doc, pages),
      });
    } else if (field instanceof PDFCheckBox) {
      const ticked = rng() < 0.5;
      if (ticked) field.check();
      else field.uncheck();
      fields.push({
        key: uniqueKey(toFieldKey(pdfName), usedKeys),
        pdfName,
        type: "selectionMark",
        value: ticked ? "selected" : "unselected",
        description: tooltip(field.acroField),
        locations: locationsOf(field, doc, pages),
      });
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown) {
      const options = field.getOptions();
      if (options.length > 0) {
        field.select(options[Math.floor(rng() * options.length)]);
      }
    }
  }

  const font = await doc.embedFont(StandardFonts.Helvetica);
  form.updateFieldAppearances(font);
  form.flatten();
  return { pdf: await doc.save(), answers: { formId, copy, seed, fields } };
}
