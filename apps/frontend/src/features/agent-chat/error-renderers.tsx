import { Alert, Badge, Code, Stack, Text } from "@mantine/core";

export interface ParseError {
  stage: "jsdoc-parse" | "signature-semantics" | "ts-check" | "allowlist";
  message: string;
  line?: number;
  column?: number;
  tag?: string;
  unknownKind?: string;
  rejectedHost?: string;
}

interface BindingWalkErrorFields {
  port: string;
  consumerKind: string;
  nodeId: string;
  ctxKey: string;
  producerNodeId: string;
  producerKind: string;
}

const BINDING_WALK_RE =
  /Input port `([^`]+)` \(([^)]+)\) on node `([^`]+)` reads from ctx key `([^`]+)`, written by node `([^`]+)` \(([^)]+)\) — \2 not assignable to \2\.?/;

const BINDING_WALK_RE_LOOSE =
  /Input port `([^`]+)` \(([^)]+)\) on node `([^`]+)` reads from ctx key `([^`]+)`, written by node `([^`]+)` \(([^)]+)\) — ([^ ]+) not assignable to ([^.\s]+)/;

export function parseBindingWalkError(
  message: string,
): BindingWalkErrorFields | null {
  const strict = BINDING_WALK_RE.exec(message);
  const m = strict ?? BINDING_WALK_RE_LOOSE.exec(message);
  if (!m) return null;
  return {
    port: m[1],
    consumerKind: m[2],
    nodeId: m[3],
    ctxKey: m[4],
    producerNodeId: m[5],
    producerKind: m[6],
  };
}

export function ParseErrorList({ errors }: { errors: ParseError[] }) {
  return (
    <Alert color="red" variant="light" title="Dynamic node publish failed">
      <Stack gap={4}>
        {errors.map((err, idx) => (
          <Stack key={idx} gap={2}>
            <Badge size="xs" color="red" variant="filled">
              {err.stage}
            </Badge>
            {(err.line !== undefined || err.column !== undefined) && (
              <Text size="xs" c="dimmed">
                line {err.line ?? "?"}, column {err.column ?? "?"}
              </Text>
            )}
            <Text size="sm">{err.message}</Text>
            {err.tag && (
              <Text size="xs" c="dimmed">
                tag: <Code>{err.tag}</Code>
              </Text>
            )}
            {err.unknownKind && (
              <Text size="xs" c="dimmed">
                unknown kind: <Code>{err.unknownKind}</Code>
              </Text>
            )}
            {err.rejectedHost && (
              <Text size="xs" c="dimmed">
                rejected host: <Code>{err.rejectedHost}</Code>
              </Text>
            )}
          </Stack>
        ))}
      </Stack>
    </Alert>
  );
}

export function BindingWalkErrorCard({
  fields,
}: {
  fields: BindingWalkErrorFields;
}) {
  return (
    <Alert
      color="red"
      variant="light"
      title="Typed-I/O binding mismatch (Phase 3)"
    >
      <Stack gap={4}>
        <Text size="sm">
          Port <Code>{fields.port}</Code> on node <Code>{fields.nodeId}</Code>{" "}
          expects <Code>{fields.consumerKind}</Code> but is wired to ctx key{" "}
          <Code>{fields.ctxKey}</Code> produced by node{" "}
          <Code>{fields.producerNodeId}</Code> (
          <Code>{fields.producerKind}</Code>
          ).
        </Text>
        <Text size="xs" c="dimmed">
          Fix by either re-routing the binding to a compatible producer or by
          changing the producer's output kind.
        </Text>
      </Stack>
    </Alert>
  );
}

export function ErrorBodyRenderer({
  code,
  message,
  body,
}: {
  code: string;
  message: string;
  body: unknown;
}) {
  if (
    code === "dynamic-node-publish" &&
    body &&
    typeof body === "object" &&
    "errors" in body
  ) {
    const errs = (body as { errors?: ParseError[] }).errors;
    if (Array.isArray(errs)) return <ParseErrorList errors={errs} />;
  }
  if (
    code === "validation" &&
    body &&
    typeof body === "object" &&
    "errors" in body
  ) {
    const errs = (body as { errors?: Array<{ message: string }> }).errors;
    if (Array.isArray(errs)) {
      const bindingErrors = errs
        .map((e) => parseBindingWalkError(e.message))
        .filter((x): x is BindingWalkErrorFields => x !== null);
      if (bindingErrors.length > 0) {
        return (
          <Stack gap={6}>
            {bindingErrors.map((f, i) => (
              <BindingWalkErrorCard key={i} fields={f} />
            ))}
          </Stack>
        );
      }
      return (
        <Alert color="red" variant="light" title="Validation failed">
          <Stack gap={4}>
            {errs.map((e, i) => (
              <Text key={i} size="sm">
                {e.message}
              </Text>
            ))}
          </Stack>
        </Alert>
      );
    }
  }
  return (
    <Alert color="red" variant="light" title={code}>
      <Text size="sm">{message}</Text>
    </Alert>
  );
}
