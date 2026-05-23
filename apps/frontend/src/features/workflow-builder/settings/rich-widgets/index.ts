/**
 * Barrel for the workflow-builder rich-widget components — bespoke editors
 * routed off `x-widget` hints in the catalog parameter schemas. The generic
 * `JsonSchemaForm` renderer delegates here for fields it can't represent
 * generically.
 */

export type { ValidationRuleEditorProps } from "./ValidationRuleEditor";
export {
  defaultValueForRule,
  ValidationRuleEditor,
} from "./ValidationRuleEditor";
