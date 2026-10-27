import { ocrRecoverNumericZerosFromCheckboxesParametersSchema } from "./ocr-recover-numeric-zeros-from-checkboxes";

const incomeTable = {
  find: { firstCellTextContains: "Declare all income" },
  columns: [{ prefix: "applicant_", headerEquals: "Applicant" }],
  rows: [{ suffix: "rental_income", labelEquals: "Rental Income" }],
};

describe("ocr.recoverNumericZerosFromCheckboxes parameters", () => {
  it("accepts a table using every setting", () => {
    const result =
      ocrRecoverNumericZerosFromCheckboxesParametersSchema.safeParse({
        tables: [
          {
            ...incomeTable,
            recoveryValue: 0,
            cellEligibility: {
              stripBeforeCheck: ["$"],
              requireSelectionMarkInCell: true,
              acceptedMarkStates: ["unselected"],
            },
            fallbackTableFinder: {
              shape: {
                minRowCount: 18,
                maxRowCount: 21,
                minColumnCount: 2,
                maxColumnCount: 3,
              },
              labelAnchor: { minLabelMatches: 12 },
              positionalAnchor: { minVotes: 3, dominanceRatio: 2 },
            },
          },
        ],
      });
    expect(result.success).toBe(true);
  });

  it("accepts no tables, which leaves the result unchanged", () => {
    expect(
      ocrRecoverNumericZerosFromCheckboxesParametersSchema.safeParse({})
        .success,
    ).toBe(true);
  });

  it("refuses a table without its row mapping", () => {
    const { rows: _rows, ...withoutRows } = incomeTable;
    const result =
      ocrRecoverNumericZerosFromCheckboxesParametersSchema.safeParse({
        tables: [withoutRows],
      });
    expect(result.success).toBe(false);
  });

  it("refuses a mark state other than selected or unselected", () => {
    const result =
      ocrRecoverNumericZerosFromCheckboxesParametersSchema.safeParse({
        tables: [
          {
            ...incomeTable,
            cellEligibility: { acceptedMarkStates: ["ticked"] },
          },
        ],
      });
    expect(result.success).toBe(false);
  });
});
