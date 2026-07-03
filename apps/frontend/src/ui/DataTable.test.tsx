import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { DataTable } from "./DataTable";

function renderTable(ui: ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe("DataTable adapter", () => {
  it("wraps Mantine table with BC DS classes", () => {
    const { container } = renderTable(
      <DataTable caption="Documents">
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Name</DataTable.Th>
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          <DataTable.Tr>
            <DataTable.Td>Invoice</DataTable.Td>
          </DataTable.Tr>
        </DataTable.Tbody>
      </DataTable>,
    );

    expect(
      container.querySelector(".bcds-data-table-wrapper"),
    ).toBeInTheDocument();
    expect(container.querySelector(".bcds-data-table")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("Invoice")).toBeInTheDocument();
  });

  it("exposes Table static aliases", () => {
    expect(DataTable.Thead).toBeDefined();
    expect(DataTable.Tbody).toBeDefined();
    expect(DataTable.Tr).toBeDefined();
    expect(DataTable.Th).toBeDefined();
    expect(DataTable.Td).toBeDefined();
  });
});
