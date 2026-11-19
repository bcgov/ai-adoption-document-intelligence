import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AnswerKey } from "./fill";
import type { TruthField } from "./ground-truth";
import { scoreCopy, scoreFieldList, totals } from "./score";

const truth: TruthField[] = [
  { key: "a", type: "string", verified: true, alternatives: [["w1", "w2"]] },
  { key: "b", type: "string", verified: true, alternatives: [["w3"], ["w9"]] },
  { key: "c", type: "string", verified: true, alternatives: [["w4"]] },
  { key: "d", type: "string", verified: true, alternatives: [["w5"]] },
  { key: "e", type: "string", verified: false, alternatives: [] },
];

describe("scoreCopy", () => {
  it("classifies each verified field", () => {
    const score = scoreCopy("copy-1.pdf", truth, [
      { field_key: "a", element_ids: ["w2", "w1"] },
      { field_key: "b", element_ids: ["w9", "w10"] },
      { field_key: "c", element_ids: ["w7"] },
      { field_key: "e", element_ids: ["w8"] },
    ]);
    assert.deepEqual(score, {
      copy: "copy-1.pdf",
      verifiedFields: 4,
      unverifiedFields: 1,
      fields: [
        { key: "a", outcome: "exact" },
        { key: "b", outcome: "partial" },
        { key: "c", outcome: "wrong" },
        { key: "d", outcome: "missed" },
      ],
    });
  });
});

describe("totals", () => {
  it("adds up outcomes and the exact rate", () => {
    const score = scoreCopy("copy-1.pdf", truth, [
      { field_key: "a", element_ids: ["w1", "w2"] },
    ]);
    assert.deepEqual(totals([score, score]), {
      verified: 8,
      unverified: 2,
      exact: 2,
      partial: 0,
      wrong: 0,
      missed: 6,
      exactRate: 0.25,
    });
  });
});

describe("scoreFieldList", () => {
  it("matches suggested fields to the answer key by value", () => {
    const answers: AnswerKey = {
      formId: "t",
      copy: 1,
      seed: 1,
      fields: [
        {
          key: "name",
          pdfName: "Name",
          type: "string",
          value: "Jane Doe",
          description: null,
          locations: [],
        },
        {
          key: "city",
          pdfName: "City",
          type: "string",
          value: "Victoria",
          description: null,
          locations: [],
        },
        {
          key: "agree",
          pdfName: "Agree",
          type: "selectionMark",
          value: "selected",
          description: null,
          locations: [],
        },
      ],
    };
    const score = scoreFieldList(answers, [
      {
        field_key: "applicant",
        field_type: "string",
        description: "",
        value: "JANE  doe",
        page_number: 1,
        already_exists: false,
      },
      {
        field_key: "heading",
        field_type: "string",
        description: "",
        value: "Form 7",
        page_number: 1,
        already_exists: false,
      },
      {
        field_key: "blank",
        field_type: "date",
        description: "",
        value: null,
        page_number: null,
        already_exists: false,
      },
      {
        field_key: "agree",
        field_type: "selectionMark",
        description: "",
        value: "selected",
        page_number: 1,
        already_exists: false,
      },
    ]);
    assert.deepEqual(score, {
      answerTextFields: 2,
      foundTextFields: 1,
      suggestedWithValue: 2,
      suggestedMatching: 1,
      answerCheckboxes: 1,
      suggestedCheckboxes: 1,
    });
  });

  it("matches repeated values one-to-one", () => {
    const answers: AnswerKey = {
      formId: "t",
      copy: 1,
      seed: 1,
      fields: [
        {
          key: "name1",
          pdfName: "Name 1",
          type: "string",
          value: "Jane Doe",
          description: null,
          locations: [],
        },
        {
          key: "name2",
          pdfName: "Name 2",
          type: "string",
          value: "Jane Doe",
          description: null,
          locations: [],
        },
      ],
    };
    const score = scoreFieldList(answers, [
      {
        field_key: "applicant",
        field_type: "string",
        description: "",
        value: "jane doe",
        page_number: 1,
        already_exists: false,
      },
    ]);
    assert.deepEqual(score, {
      answerTextFields: 2,
      foundTextFields: 1,
      suggestedWithValue: 1,
      suggestedMatching: 1,
      answerCheckboxes: 0,
      suggestedCheckboxes: 0,
    });
  });
});
