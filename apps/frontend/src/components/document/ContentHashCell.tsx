import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useState } from "react";
import {
  ActionIcon,
  Code,
  CopyButton,
  Group,
  Text,
  Tooltip,
  UnstyledButton,
} from "../../ui";

const TRUNCATE_PREFIX = 8;
const TRUNCATE_SUFFIX = 4;

function truncateHash(hash: string): string {
  if (hash.length <= TRUNCATE_PREFIX + TRUNCATE_SUFFIX + 1) {
    return hash;
  }
  return `${hash.slice(0, TRUNCATE_PREFIX)}…${hash.slice(-TRUNCATE_SUFFIX)}`;
}

interface ContentHashCellProps {
  hash: string | null | undefined;
}

/** Truncated Content ID (SHA-256 file hash); click to expand and copy the full value. */
export function ContentHashCell({ hash }: ContentHashCellProps) {
  const [expanded, setExpanded] = useState(false);

  if (!hash) {
    return (
      <Text size="sm" c="dimmed" data-testid="content-hash-empty">
        —
      </Text>
    );
  }

  const display = expanded ? hash : truncateHash(hash);

  return (
    <Group
      gap={4}
      wrap="nowrap"
      align="center"
      onClick={(event) => event.stopPropagation()}
    >
      <Tooltip
        label={expanded ? "Click to collapse" : "Click to show full Content ID"}
        withArrow
      >
        <UnstyledButton
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse Content ID" : "Expand Content ID"}
          data-testid="content-hash-toggle"
        >
          <Code
            data-testid="content-hash-value"
            style={{
              maxWidth: expanded ? "16rem" : undefined,
              wordBreak: expanded ? "break-all" : "normal",
              whiteSpace: expanded ? "normal" : "nowrap",
            }}
          >
            {display}
          </Code>
        </UnstyledButton>
      </Tooltip>
      {expanded ? (
        <CopyButton value={hash} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy Content ID"} withArrow>
              <ActionIcon
                size="sm"
                variant="subtle"
                color={copied ? "green" : "gray"}
                onClick={copy}
                aria-label="Copy Content ID"
                data-testid="content-hash-copy"
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      ) : null}
    </Group>
  );
}
