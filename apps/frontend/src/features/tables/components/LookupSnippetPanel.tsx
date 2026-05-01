import { Button, Code, Group, Modal, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { LookupDef } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  tableId: string;
  lookup: LookupDef | null;
}

export function LookupSnippetPanel({
  opened,
  onClose,
  tableId,
  lookup,
}: Props) {
  const [copied, setCopied] = useState(false);

  if (!lookup) return null;

  const snippet = {
    type: "activity",
    activityType: "tables.lookup",
    label: `Lookup: ${lookup.name}`,
    parameters: {
      tableId,
      lookupName: lookup.name,
    },
    inputs: lookup.params.map((p) => ({
      port: p.name,
      ctxKey: "<source ctx key>",
    })),
    outputs: [{ port: "result", ctxKey: "<destination ctx key>" }],
  };
  const text = JSON.stringify(snippet, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Use in workflow" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          Paste this node into a graph workflow. Replace{" "}
          <code>{"<source ctx key>"}</code> with the upstream context key
          containing each param value, and{" "}
          <code>{"<destination ctx key>"}</code> with where the result should
          land.
        </Text>
        <Code block>{text}</Code>
        <Group justify="flex-end">
          <Button onClick={handleCopy}>
            {copied ? "Copied!" : "Copy to clipboard"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
