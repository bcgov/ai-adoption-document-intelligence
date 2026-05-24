/**
 * Source Upload DTO (US-114)
 *
 * Swagger response shape for the
 * `POST /api/workflows/:id/sources/:sourceNodeId/upload` endpoint.
 *
 * The response is a single-property object whose key is dynamic — it is
 * sourced from the `source.upload` node's configured `ctxKey` parameter
 * (default `"documentUrl"`). Because the property name is dynamic and
 * not enumerable at schema-generation time, the controller's
 * `@ApiOkResponse({ schema: { type: "object", additionalProperties: ... } })`
 * expresses the contract directly per OpenAPI 3.0 — i.e. "an object
 * with string-valued properties of unspecified keys".
 *
 * This DTO is exported only as a typed-record marker so consumers in
 * generated clients still see a named type. The actual return type
 * from the controller is `Record<string, string>` (one entry keyed by
 * the resolved `ctxKey`).
 */

export type SourceUploadResponseDto = Record<string, string>;
