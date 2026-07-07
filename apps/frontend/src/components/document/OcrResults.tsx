import {
  ToggleButton,
  ToggleButtonGroup,
} from "@bcgov/design-system-react-components";
import { Code, Text } from "@mantine/core";
import { useState } from "react";
import { OcrResult } from "@/shared/types";
import ExtractedFieldsTable from "./ExtractedFieldsTable";
import { ExtractedTextView } from "./ExtractedTextView";

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
  const hasKeyValues = !!ocr?.keyValuePairs;
  const hasText = !!(ocr?.content?.markdown || ocr?.content?.text);

  // Default to whichever view has data; field-extraction models lead with the
  // table, read/layout models lead with the text.
  const [toggleId, setToggleId] = useState(
    hasKeyValues ? ToggleStates.EXTRACTED : ToggleStates.TEXT,
  );

  if (ocr == null) {
    return <Text c="dimmed">No OCR results available.</Text>;
  }

  const renderContent = () => {
    switch (toggleId) {
      case ToggleStates.EXTRACTED:
        return <ExtractedFieldsTable fields={ocr.keyValuePairs ?? {}} />;
      case ToggleStates.TEXT:
        // Delegate to ExtractedTextView so Azure layout markdown renders (with
        // a rendered/raw sub-toggle) instead of being dumped as plain text.
        return ocr.content ? (
          <ExtractedTextView content={ocr.content} />
        ) : (
          <Text c="dimmed">No extracted text available.</Text>
        );
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
          <Text>
            Invalid results selection. Use the selector above to choose a valid
            results view.
          </Text>
        );
    }
  };

  return (
    <>
      <ToggleButtonGroup
        orientation="horizontal"
        selectionMode="single"
        disallowEmptySelection
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
        <ToggleButton id={ToggleStates.EXTRACTED} isDisabled={!hasKeyValues}>
          Extracted
        </ToggleButton>
        <ToggleButton id={ToggleStates.TEXT} isDisabled={!hasText}>
          Text
        </ToggleButton>
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
        {renderContent()}
      </div>
    </>
  );
};

export default OcrResults;
