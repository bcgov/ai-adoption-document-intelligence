import { Anchor, JsonInput, Modal, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";

const INLINE_STRING_LIMIT = 80;
const SNIPPET_LIMIT = 120;

export interface JsonValuePreviewProps {
  value: unknown;
}

function isPrimitive(v: unknown): boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

/**
 * Generic fallback preview for a wire value whose kind has no dedicated
 * widget (scalars, URLs, `Artifact`-wildcard values, unknown kinds).
 * Short primitives render inline; anything longer/structured shows a
 * truncated snippet with a "View raw" modal of the pretty-printed JSON.
 */
export function JsonValuePreview({ value }: JsonValuePreviewProps): ReactNode {
  const [opened, { open, close }] = useDisclosure(false);
  const raw = JSON.stringify(value, null, 2) ?? String(value);

  const shortPrimitive =
    isPrimitive(value) &&
    !(typeof value === "string" && value.length > INLINE_STRING_LIMIT);

  if (shortPrimitive) {
    return (
      <Text size="sm" data-testid="json-value-preview">
        {value === null ? "null" : String(value)}
      </Text>
    );
  }

  const flat =
    typeof value === "string"
      ? value
      : (JSON.stringify(value) ?? String(value));
  const snippet =
    flat.length > SNIPPET_LIMIT ? `${flat.slice(0, SNIPPET_LIMIT)}…` : flat;

  return (
    <>
      <Text
        size="sm"
        data-testid="json-value-preview"
        style={{ wordBreak: "break-word" }}
      >
        {snippet}{" "}
        <Anchor
          component="button"
          type="button"
          size="xs"
          onClick={open}
          data-testid="json-value-preview-raw"
        >
          View raw
        </Anchor>
      </Text>
      <Modal opened={opened} onClose={close} title="Raw value" size="lg">
        <JsonInput
          readOnly
          autosize
          minRows={6}
          maxRows={24}
          value={raw}
          data-testid="json-value-preview-raw-content"
        />
      </Modal>
    </>
  );
}
