import { ApplicationFailure } from "@temporalio/common";
import { executeLookup, LookupError } from "../tables/lookup-engine";
import type { LookupDef } from "../tables/types";
import { getPrismaClient } from "./database-client";

export interface TablesLookupInput {
  groupId: string;
  tableId: string;
  lookupName: string;
  // Lookup parameters arrive as additional fields on the input object
  // (params, e.g. submissionDate, are passed alongside the routing fields).
  [paramName: string]: unknown;
}

export interface TablesLookupOutput {
  result: Record<string, unknown> | Array<Record<string, unknown>> | null;
}

export async function tablesLookup(
  input: TablesLookupInput,
): Promise<TablesLookupOutput> {
  const { groupId, tableId, lookupName, ...params } = input;
  const prisma = getPrismaClient();

  const table = await prisma.referenceTable.findUnique({
    where: { group_id_table_id: { group_id: groupId, table_id: tableId } },
  });
  if (!table) {
    throw ApplicationFailure.create({
      type: "TABLES_NOT_FOUND",
      message: `table not found: groupId=${groupId} tableId=${tableId}`,
      nonRetryable: true,
    });
  }

  const lookups = (table.lookups as unknown as LookupDef[]) ?? [];
  const lookup = lookups.find((l) => l.name === lookupName);
  if (!lookup) {
    throw ApplicationFailure.create({
      type: "TABLES_LOOKUP_NOT_FOUND",
      message: `lookup not found: ${lookupName} on table ${tableId}`,
      nonRetryable: true,
    });
  }

  const rows = await prisma.referenceTableRow.findMany({
    where: { group_id: groupId, table_id: tableId },
  });

  try {
    const result = executeLookup(
      lookup,
      params,
      rows.map((r) => r.data as unknown as Record<string, unknown>),
    );
    return { result };
  } catch (e) {
    if (e instanceof LookupError) {
      throw ApplicationFailure.create({
        type: e.code,
        message: e.message,
        nonRetryable: true,
      });
    }
    throw e;
  }
}
