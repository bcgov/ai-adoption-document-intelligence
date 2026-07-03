import {
  Code,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TypographyStylesProvider,
} from "@mantine/core";
import { useState } from "react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { OcrContent } from "../../shared/types";

/**
 * Renders the OCR text output of read/layout models. The source string (markdown
 * when available, otherwise plain text) can be viewed either rendered or raw.
 * Defaults to the rendered view.
 */
export function ExtractedTextView({ content }: { content: OcrContent }) {
  const source = content.markdown ?? content.text ?? "";
  const canRender = content.format === "markdown" && !!content.markdown;
  const [view, setView] = useState<"rendered" | "raw">(
    canRender ? "rendered" : "raw",
  );

  if (!source.trim()) {
    return <Text c="dimmed">No extracted text available.</Text>;
  }

  return (
    <Stack gap="sm">
      {canRender && (
        <Group justify="flex-end">
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(value) => setView(value as "rendered" | "raw")}
            data={[
              { label: "Rendered", value: "rendered" },
              { label: "Raw text", value: "raw" },
            ]}
            aria-label="Extracted text view mode"
          />
        </Group>
      )}

      {view === "rendered" && canRender ? (
        <TypographyStylesProvider>
          {/* Azure layout markdown embeds raw HTML (e.g. <figure>, HTML tables).
              rehypeRaw parses it into the tree; rehypeSanitize then strips
              anything unsafe before render. Order matters: raw before sanitize. */}
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeSanitize]}
          >
            {source}
          </Markdown>
        </TypographyStylesProvider>
      ) : (
        <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {source}
        </Code>
      )}
    </Stack>
  );
}
