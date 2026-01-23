import { BoundingBox } from "./canvas";

export enum FieldType {
  STRING = "string",
  NUMBER = "number",
  DATE = "date",
  SELECTION_MARK = "selectionMark",
  SIGNATURE = "signature",
  TABLE = "table",
}

export enum TableType {
  DYNAMIC = "dynamic",
  FIXED = "fixed",
}

export interface TableColumn {
  name: string;
  type: FieldType;
}

export interface FieldDefinition {
  id: string;
  fieldKey: string;
  fieldType: FieldType;
  fieldFormat?: string;
  displayOrder: number;
  isRequired: boolean;
  isTable: boolean;
  tableType?: TableType;
  columnHeaders?: TableColumn[];
}

export interface FieldValue {
  id: string;
  fieldKey: string;
  labelName: string;
  value?: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  confidence?: number;
  isManual: boolean;
}

export interface TableCell {
  rowIndex: number;
  columnIndex: number;
  columnName?: string;
  value: string;
  boundingBox: BoundingBox;
  confidence?: number;
}

export interface TableFieldValue extends FieldValue {
  cells: TableCell[];
  rowCount: number;
  columnCount: number;
}

export interface FieldState {
  selectedFieldKey: string | null;
  editingFieldId: string | null;
  fieldValues: Map<string, FieldValue[]>;
}
