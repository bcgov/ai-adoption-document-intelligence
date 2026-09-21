import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { fillForm, toFieldKey } from "./fill";

async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const name = form.createTextField("Applicant Name");
  name.addToPage(page, {
    x: 72,
    y: 700,
    width: 200,
    height: 20,
    borderWidth: 0,
  });
  const agree = form.createCheckBox("Agree");
  agree.addToPage(page, {
    x: 72,
    y: 650,
    width: 12,
    height: 12,
    borderWidth: 0,
  });
  return doc.save();
}

describe("toFieldKey", () => {
  it("makes lowercase snake_case keys that start with a letter", () => {
    assert.equal(toFieldKey("Applicant Name"), "applicant_name");
    assert.equal(toFieldKey("1st Party (Name)"), "field_1st_party_name");
    assert.equal(toFieldKey("---"), "field");
  });
});

describe("fillForm", () => {
  it("fills every field, flattens the form and records where each value sits", async () => {
    const { pdf, answers } = await fillForm(await samplePdf(), "sample", 1);

    assert.equal(answers.fields.length, 2);
    const [text, checkbox] = answers.fields;
    assert.equal(text.key, "applicant_name");
    assert.equal(text.type, "string");
    assert.ok(text.value.length > 0);
    assert.equal(text.locations.length, 1);
    assert.equal(text.locations[0].page, 1);
    const [left, top, right, bottom] = text.locations[0].rect;
    assert.ok(Math.abs(left - 72 / 612) < 1e-6);
    assert.ok(Math.abs(top - (1 - 720 / 792)) < 1e-6);
    assert.ok(Math.abs(right - 272 / 612) < 1e-6);
    assert.ok(Math.abs(bottom - (1 - 700 / 792)) < 1e-6);
    assert.equal(checkbox.type, "selectionMark");
    assert.ok(["selected", "unselected"].includes(checkbox.value));

    const flattened = await PDFDocument.load(pdf);
    assert.equal(flattened.getForm().getFields().length, 0);
  });

  it("gives the same copy the same values", async () => {
    const source = await samplePdf();
    const a = await fillForm(source, "sample", 3);
    const b = await fillForm(source, "sample", 3);
    assert.deepEqual(a.answers, b.answers);
  });
});
