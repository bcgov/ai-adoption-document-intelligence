import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { getBcdsMocks } from "../test/mockBcdsComponents";
import { Alert } from "./Alert";

describe("Alert adapter", () => {
  beforeEach(() => {
    getBcdsMocks().mockBcdsInlineAlert.mockClear();
  });

  it("maps red color to danger variant", () => {
    render(
      <Alert color="red" title="Error">
        Something failed
      </Alert>,
    );
    expect(getBcdsMocks().mockBcdsInlineAlert).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "danger", title: "Error" }),
    );
  });

  it("maps green color to success variant", () => {
    render(<Alert color="green">Saved</Alert>);
    expect(getBcdsMocks().mockBcdsInlineAlert).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success" }),
    );
  });
});
