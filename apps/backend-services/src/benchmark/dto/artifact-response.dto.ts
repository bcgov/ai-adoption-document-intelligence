/**
 * Artifact Response DTOs
 *
 * Data transfer objects for benchmark artifact responses.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-013-benchmark-artifact-management.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 2.7
 */

export interface ArtifactResponseDto {
  id: string;
  runId: string;
  type: string;
  path: string;
  sampleId: string | null;
  nodeId: string | null;
  sizeBytes: bigint;
  mimeType: string;
  createdAt: Date;
}

export interface ArtifactListResponseDto {
  artifacts: ArtifactResponseDto[];
  total: number;
}
