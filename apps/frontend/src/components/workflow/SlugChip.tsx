import { IconCheck, IconCopy } from "@tabler/icons-react";
import { ActionIcon, Code, CopyButton, Group, Tooltip } from "../../ui";

type Size = "xs" | "sm";

interface SlugChipProps {
  slug: string;
  /** Visual scale of the rendered chip. Defaults to "sm". */
  size?: Size;
}

/**
 * Renders a workflow's slug as a copyable code chip.
 *
 * The slug is the stable, URL/CLI-friendly handle used in upload requests
 * (`workflow_slug`) -- exposed here so operators can copy it without digging
 * through the API response.
 */
export function SlugChip({ slug, size = "sm" }: SlugChipProps) {
  return (
    <Group gap={4} wrap="nowrap" align="center" style={{ minWidth: 0 }}>
      {/*
        A slug is one unbroken token. In a width-constrained table cell the
        browser will break it anywhere rather than overflow, turning a
        five-word slug into five lines and making the row taller than every
        other row in the table. Truncate on one line instead — the copy
        button beside it is how the full value gets used anyway, and the
        title attribute keeps it readable on hover.
      */}
      <Code
        data-testid="workflow-slug"
        title={slug}
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {slug}
      </Code>
      <CopyButton value={slug} timeout={1500}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Copied" : "Copy slug"} withArrow>
            <ActionIcon
              size={size}
              variant="subtle"
              color={copied ? "green" : "gray"}
              onClick={copy}
              aria-label="Copy workflow slug"
            >
              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}
