import type { TableProps } from "@mantine/core";
import { Table } from "@mantine/core";
import type { ReactNode } from "react";

export interface AppDataTableProps extends TableProps {
  children: ReactNode;
  /** Optional table caption (accessibility / queue-style summaries) */
  caption?: ReactNode;
}

/**
 * Mantine `Table` with BC DS token styling (`bcds-mantine-table`).
 * Use for document lists and other tabular data until a BC DS table exists.
 */
export function DataTable({
  children,
  className,
  caption,
  highlightOnHover = true,
  verticalSpacing = "sm",
  withTableBorder = true,
  striped = false,
  ...props
}: AppDataTableProps) {
  const mergedClassName = className
    ? `bcds-data-table bcds-mantine-table ${className}`
    : "bcds-data-table bcds-mantine-table";

  return (
    <div className="bcds-data-table-wrapper">
      <Table
        className={mergedClassName}
        highlightOnHover={highlightOnHover}
        verticalSpacing={verticalSpacing}
        withTableBorder={withTableBorder}
        striped={striped}
        {...props}
      >
        {caption != null && caption !== "" ? (
          <Table.Caption>{caption}</Table.Caption>
        ) : null}
        {children}
      </Table>
    </div>
  );
}

DataTable.Thead = Table.Thead;
DataTable.Tbody = Table.Tbody;
DataTable.Tr = Table.Tr;
DataTable.Th = Table.Th;
DataTable.Td = Table.Td;
DataTable.Tfoot = Table.Tfoot;
DataTable.Caption = Table.Caption;
