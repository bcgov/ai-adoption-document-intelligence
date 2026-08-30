-- The azureOcr.poll activity's output port was renamed from "response" to
-- "ocrResponse" (the catalog, runtime executor and shipped templates all use
-- the new name). A stored graph config binds ports by name — a node's
-- `outputs` array holds `{ "port": ..., "ctxKey": ... }` entries — so any
-- workflow_versions row saved before the rename still binds "response" and
-- would no longer receive the poll result. This rewrites those rows in place.
--
-- Only the `outputs` entries of nodes whose activityType is "azureOcr.poll"
-- are touched; "response" appearing anywhere else in a config (other nodes'
-- ports, ctx keys, parameters, labels) is left alone. Idempotent: once no
-- azureOcr.poll node binds an output port named "response", the WHERE clause
-- matches nothing.
UPDATE "workflow_versions" wv
SET "config" = jsonb_set(
  wv."config",
  '{nodes}',
  (
    SELECT jsonb_object_agg(
      n.node_id,
      CASE
        WHEN n.node->>'activityType' = 'azureOcr.poll'
         AND jsonb_typeof(n.node->'outputs') = 'array'
        THEN jsonb_set(
          n.node,
          '{outputs}',
          (
            SELECT jsonb_agg(
              CASE
                WHEN o.output->>'port' = 'response'
                THEN jsonb_set(o.output, '{port}', '"ocrResponse"')
                ELSE o.output
              END
              ORDER BY o.ord
            )
            FROM jsonb_array_elements(n.node->'outputs') WITH ORDINALITY AS o(output, ord)
          )
        )
        ELSE n.node
      END
    )
    FROM jsonb_each(wv."config"->'nodes') AS n(node_id, node)
  )
)
WHERE jsonb_typeof(wv."config"->'nodes') = 'object'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(wv."config"->'nodes') AS n(node_id, node)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(n.node->'outputs') = 'array' THEN n.node->'outputs'
        ELSE '[]'::jsonb
      END
    ) AS o(output)
    WHERE n.node->>'activityType' = 'azureOcr.poll'
      AND o.output->>'port' = 'response'
  );
