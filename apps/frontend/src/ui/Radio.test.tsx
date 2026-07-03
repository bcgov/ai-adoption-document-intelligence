import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@bcgov/design-system-react-components", () =>
  import("../test/mockBcdsComponents").then((mod) =>
    mod.mockBcdsDesignSystem(),
  ),
);

import { render, screen } from "@testing-library/react";
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
