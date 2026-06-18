import {
  ToggleButton,
  ToggleButtonGroup,
} from "@bcgov/design-system-react-components";
import { Code, LoadingOverlay } from "@mantine/core";
import { useState } from "react";
import { OcrResult } from "@/shared/types";
import ExtractedFieldsTable from "./ExtractedFieldsTable";

interface OcrResultsProps {
  ocr: OcrResult | null;
}

enum ToggleStates {
  EXTRACTED,
  TEXT,
  JSON,
}

const OcrResults = (props: OcrResultsProps) => {
  const { ocr } = props;
  if (ocr == null) {
    return <LoadingOverlay />;
  }

  const [toggleId, setToggleId] = useState(
    ocr?.keyValuePairs ? ToggleStates.EXTRACTED : ToggleStates.TEXT,
  );

  const Content = () => {
    switch (toggleId) {
      case ToggleStates.EXTRACTED:
        return <ExtractedFieldsTable fields={ocr?.keyValuePairs || {}} />;
      case ToggleStates.TEXT:
        return ocr?.content.text.split("\n").map((l) => <p>{l}</p>);
      case ToggleStates.JSON:
        return (
          <Code
            block
            color="dark.6"
            c="white"
            style={{
              borderRadius: "0.5em",
            }}
          >
            {JSON.stringify(ocr, undefined, 2)}
          </Code>
        );
      default:
        return (
          <p>
            Invalid results selection. Use the selector above to choose a valid
            results view.
          </p>
        );
    }
  };

  return (
    <>
      <ToggleButtonGroup
        orientation="horizontal"
        selectionMode="single"
        size="small"
        selectedKeys={[toggleId]}
        onSelectionChange={(set) => {
          // Set contains all selected ids, but we only use single select.
          setToggleId(set.values().next().value as ToggleStates);
        }}
        style={{
          flex: "0 0 auto",
          margin: "0.5em auto",
        }}
      >
        <ToggleButton
          id={ToggleStates.EXTRACTED}
          isDisabled={!ocr?.keyValuePairs}
        >
          Extracted
        </ToggleButton>
        <ToggleButton id={ToggleStates.TEXT}>Text</ToggleButton>
        <ToggleButton id={ToggleStates.JSON}>JSON</ToggleButton>
      </ToggleButtonGroup>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "1rem",
          paddingBottom: "3rem",
        }}
      >
        <Content />
      </div>
    </>
  );
};

export default OcrResults;
