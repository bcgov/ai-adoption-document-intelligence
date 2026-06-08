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
    <Group gap={4} wrap="nowrap" align="center">
      <Code data-testid="workflow-slug">{slug}</Code>
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
