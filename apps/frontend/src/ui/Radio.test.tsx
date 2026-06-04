import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { Radio } from "./Radio";

describe("Radio adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsRadio.mockClear();
    getBcdsMocks().mockBcdsRadioGroup.mockClear();
  });

  it("renders radio options inside a group", () => {
    render(
      <Radio.Group label="Mode" value="a" onChange={() => undefined}>
        <Radio value="a" label="Alpha" />
        <Radio value="b" label="Beta" />
      </Radio.Group>,
    );

    expect(screen.getByTestId("bcds-radio-group")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(getBcdsMocks().mockBcdsRadioGroup).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Mode", value: "a" }),
    );
  });
});
