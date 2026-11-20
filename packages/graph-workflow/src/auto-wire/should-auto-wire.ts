/**
 * Returns true iff the resolver should attempt to auto-wire this port.
 *
 * Ports with no declared kind, or with the wildcard base `Artifact` kind,
 * are excluded. `Artifact` is the wildcard base type in the artifact
 * taxonomy — using it as a target would accept any subtype as a producer,
 * defeating typed auto-wiring entirely. The catalog invariant (US-103)
 * requires every port on a kind-annotated activity to declare a kind, so
 * the convention is to use `Artifact` as the "no opinion" marker for
 * identifier-style ports (groupId, documentId, apimRequestId, etc.) that
 * should not participate in auto-wire.
 *
 * Used by the resolver, the per-node status helper, and the InputsSection
 * settings component — every consumer of `resolveInputPort` outputs must
 * apply this filter for consistent UX.
 */
export function shouldAutoWirePort(port: { kind?: string }): boolean {
  return port.kind !== undefined && port.kind !== "Artifact";
}
