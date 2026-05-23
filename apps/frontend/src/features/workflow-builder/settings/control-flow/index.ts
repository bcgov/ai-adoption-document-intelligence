/**
 * Per-type settings forms for control-flow nodes.
 *
 * Each form is hand-rolled and consumes the graph-aware primitives from
 * `../graph-widgets` plus Mantine inputs. Forms are wired into
 * `NodeSettingsPanel` once US-010 lands.
 */

export {
  ChildWorkflowNodeSettings,
  type ChildWorkflowNodeSettingsProps,
} from "./ChildWorkflowNodeSettings";
export {
  HumanGateNodeSettings,
  type HumanGateNodeSettingsProps,
} from "./HumanGateNodeSettings";
export {
  JoinNodeSettings,
  type JoinNodeSettingsProps,
} from "./JoinNodeSettings";
export {
  MapNodeSettings,
  type MapNodeSettingsProps,
} from "./MapNodeSettings";
export {
  PollUntilNodeSettings,
  type PollUntilNodeSettingsProps,
} from "./PollUntilNodeSettings";
export {
  SwitchNodeSettings,
  type SwitchNodeSettingsProps,
} from "./SwitchNodeSettings";
