/**
 * Per-type settings forms for control-flow nodes.
 *
 * Each form is hand-rolled and consumes the graph-aware primitives from
 * `../graph-widgets` plus Mantine inputs. Forms are wired into
 * `NodeSettingsPanel` once US-010 lands.
 */

export {
  MapNodeSettings,
  type MapNodeSettingsProps,
} from "./MapNodeSettings";
export {
  SwitchNodeSettings,
  type SwitchNodeSettingsProps,
} from "./SwitchNodeSettings";
