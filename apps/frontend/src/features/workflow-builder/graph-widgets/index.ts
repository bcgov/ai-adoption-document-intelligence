/**
 * Graph-aware reusable UI primitives.
 *
 * Each widget is purely presentational — it takes the current graph
 * config as a prop, surfaces the picker UI, and emits the user's
 * selection through `onChange`. The widgets never mutate the graph
 * themselves; the parent per-type settings form owns the mutation.
 */

export { NodePicker, type NodePickerProps } from "./NodePicker";
