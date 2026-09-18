/**
 * `KindInfoPopover` — an inspectable kind chip (D27).
 *
 * *"How can a user know what the `Document` type contains?"* Until now they
 * could not: a kind was a bare word on a dot, a tooltip and a `<Select>`
 * option. This turns the word itself into the affordance — click it and the
 * shape opens.
 *
 * Everything shown comes from {@link describeKind}, i.e. from the artifact
 * registry and the Zod-derived field schemas. Nothing here is a per-kind
 * sentence someone typed, because a typed sentence goes stale the first time a
 * schema changes and nothing fails when it does.
 */

import { Anchor, List, Popover, Stack, Text } from "@mantine/core";
import { describeKind } from "./kind-shape";

export interface KindInfoPopoverProps {
  /** Kind reference as written, e.g. `"Document"` or `"DocumentSegment[]"`. */
  kind: string;
  /** Test-id stem; the trigger and the dropdown derive theirs from it. */
  testId?: string;
}

export function KindInfoPopover({
  kind,
  testId = "kind-info",
}: KindInfoPopoverProps) {
  const shape = describeKind(kind);

  return (
    <Popover width={340} position="bottom-start" withArrow shadow="md">
      <Popover.Target>
        <Anchor
          component="button"
          type="button"
          size="xs"
          underline="hover"
          aria-label={`What does ${kind} contain?`}
          data-testid={`${testId}-trigger`}
          data-kind={kind}
        >
          {kind}
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown data-testid={`${testId}-dropdown`}>
        <Stack gap="xs">
          <Stack gap={2}>
            <Text size="sm" fw={600}>
              {shape.displayName}
              {shape.isList ? " (a list)" : ""}
            </Text>
            {shape.ancestry.length > 0 && (
              <Text size="xs" c="dimmed" data-testid={`${testId}-ancestry`}>
                A kind of {shape.ancestry.join(", which is a kind of ")}.
              </Text>
            )}
            {shape.isList && (
              <Text size="xs" c="dimmed">
                Each item in the list is one {shape.elementKind}.
              </Text>
            )}
          </Stack>

          {shape.variant.kind === "fields" && (
            <Stack gap={4} data-testid={`${testId}-fields`}>
              <Text size="xs" fw={600}>
                It contains
              </Text>
              <List size="xs" spacing={2}>
                {shape.variant.fields.map((field) => (
                  <List.Item key={field.name}>
                    <Text size="xs" component="span">
                      <strong>{field.name}</strong>
                      {" — "}
                      {field.kind ?? field.type}
                      {field.required ? "" : ", optional"}
                      {field.description !== undefined
                        ? `. ${field.description}`
                        : ""}
                    </Text>
                  </List.Item>
                ))}
              </List>
            </Stack>
          )}

          {shape.variant.kind === "wildcard" && (
            <Stack gap={4} data-testid={`${testId}-wildcard`}>
              <Text size="xs">
                {shape.displayName} has no fixed shape on purpose — it stands
                for a whole family, so a step that asks for one accepts any
                member of it.
              </Text>
              {shape.variant.describedSubkinds.length > 0 && (
                <>
                  <Text size="xs" fw={600}>
                    Members with a known shape
                  </Text>
                  <Text size="xs" c="dimmed">
                    {shape.variant.describedSubkinds.join(", ")}
                  </Text>
                </>
              )}
            </Stack>
          )}

          {shape.variant.kind === "unregistered" && (
            <Text size="xs" data-testid={`${testId}-unregistered`}>
              This name is not in the kind registry, so nothing is known about
              its shape. Steps treat it as untyped.
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
