import { describe, expect, it } from "vitest";
import { CorrectionAction } from "../../core/types/annotation";
import { unsavedCorrections } from "./unsaved-corrections";

const corrected = (field_key: string, corrected_value: string) => ({
  field_key,
  corrected_value,
  action: CorrectionAction.CORRECTED,
});

describe("unsavedCorrections", () => {
  it("sends a field corrected on the page when nothing is saved", () => {
    const onPage = { name: corrected("name", "John R. Bates") };

    expect(unsavedCorrections(onPage, [])).toEqual([onPage.name]);
  });

  it("leaves out a saved correction that was loaded back onto the page", () => {
    // A session taken over from another reviewer opens with their corrections.
    const onPage = {
      date: corrected("date", "2025-11-30"),
      name: corrected("name", "John R. Bates"),
    };
    const saved = [{ fieldKey: "date", correctedValue: "2025-11-30" }];

    expect(unsavedCorrections(onPage, saved)).toEqual([onPage.name]);
  });

  it("sends a saved field that was changed again on the page", () => {
    const onPage = { date: corrected("date", "2025-12-01") };
    const saved = [{ fieldKey: "date", correctedValue: "2025-11-30" }];

    expect(unsavedCorrections(onPage, saved)).toEqual([onPage.date]);
  });

  it("compares with a field's latest saved correction", () => {
    const saved = [
      { fieldKey: "date", correctedValue: "2025-11-30" },
      { fieldKey: "date", correctedValue: "2025-12-01" },
    ];

    expect(
      unsavedCorrections({ date: corrected("date", "2025-12-01") }, saved),
    ).toEqual([]);
    expect(
      unsavedCorrections({ date: corrected("date", "2025-11-30") }, saved),
    ).toHaveLength(1);
  });

  it("sends only corrected fields", () => {
    const onPage = {
      name: {
        ...corrected("name", "John Bates"),
        action: CorrectionAction.CONFIRMED,
      },
    };

    expect(unsavedCorrections(onPage, [])).toEqual([]);
  });
});
