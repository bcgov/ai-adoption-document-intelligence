/**
 * Graph-aware reusable UI primitives.
 *
 * Each widget is purely presentational — it takes the current graph
 * config as a prop, surfaces the picker UI, and emits the user's
 * selection through `onChange`. The widgets never mutate the graph
 * themselves; the parent per-type settings form owns the mutation.
 */

export {
  ConditionExpressionEditor,
  type ConditionExpressionEditorProps,
} from "./ConditionExpressionEditor";
export { EdgePicker, type EdgePickerProps } from "./EdgePicker";
export { NodePicker, type NodePickerProps } from "./NodePicker";
export {
  buildVariableOptions,
  VariablePicker,
  type VariablePickerProps,
} from "./VariablePicker";
