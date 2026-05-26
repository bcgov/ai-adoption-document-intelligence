/**
 * Barrel exports for the dynamic-nodes feature directory
 * (Phase 6 Milestone E + earlier milestones).
 */

export { DYNAMIC_NODE_BOILERPLATE } from "./boilerplate";
export { CodePane, type CodePaneProps } from "./CodePane";
export {
  DynamicNodeEditor,
  type DynamicNodeEditorLayout,
  type DynamicNodeEditorProps,
  default as DynamicNodeEditorDefault,
} from "./DynamicNodeEditor";
export type {
  DynamicNodeHeadVersionSummary,
  DynamicNodeVersionDetail,
} from "./dynamic-node-api";
export { materialiseParamDefaults } from "./dynamic-node-defaults";
export {
  SignaturePreviewPane,
  type SignaturePreviewPaneProps,
} from "./SignaturePreviewPane";
export {
  adaptEntryToSignature,
  isParamsSchemaEmpty,
  KIND_COLOR_TOKENS,
  resolveKindColor,
} from "./signature-preview-helpers";
export {
  ACTIVITY_CATALOG_QUERY_KEY,
  type ActivityCatalogEntry,
  type ActivityCatalogPortDescriptor,
  type ActivityCatalogResponse,
  ApiError,
  fetchActivityCatalog,
  type UseActivityCatalogResult,
  useActivityCatalog,
} from "./useActivityCatalog";
export type { DynamicNodeDetail } from "./useDynamicNode";
export { dynamicNodeQueryKey, useDynamicNode } from "./useDynamicNode";
export type { DynamicNodeDeletedResult } from "./useDynamicNodeDelete";
export { useDynamicNodeDelete } from "./useDynamicNodeDelete";
export type {
  DynamicNodeListItem,
  DynamicNodeListResponse,
} from "./useDynamicNodeList";
export {
  DYNAMIC_NODE_LIST_QUERY_KEY,
  useDynamicNodeList,
} from "./useDynamicNodeList";
export type { DynamicNodePublishResult } from "./useDynamicNodePublish";
export {
  type PublishDynamicNodeInput,
  useDynamicNodePublish,
} from "./useDynamicNodePublish";
export {
  VersionHistoryPane,
  type VersionHistoryPaneProps,
} from "./VersionHistoryPane";
