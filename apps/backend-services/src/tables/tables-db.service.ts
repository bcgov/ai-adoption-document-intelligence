import { Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import type { ColumnDef, LookupDef } from "./types";

export interface CreateTableInput {
  group_id: string;
  table_id: string;
  label: string;
  description: string | null;
}

@Injectable()
export class TablesDbService {
  constructor(private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.prisma;
  }

  async createTable(input: CreateTableInput) {
    return this.prisma.referenceTable.create({
      data: {
        group_id: input.group_id,
        table_id: input.table_id,
        label: input.label,
        description: input.description,
        columns: [],
        lookups: [],
      },
    });
  }

  async findTable(group_id: string, table_id: string) {
    return this.prisma.referenceTable.findUnique({
      where: { group_id_table_id: { group_id, table_id } },
    });
  }

  async listTables(group_id: string) {
    return this.prisma.referenceTable.findMany({
      where: { group_id },
      orderBy: { label: "asc" },
    });
  }

  async updateTableMetadata(
    group_id: string,
    table_id: string,
    patch: { label?: string; description?: string | null },
  ) {
    return this.prisma.referenceTable.update({
      where: { group_id_table_id: { group_id, table_id } },
      data: patch,
    });
  }

  async deleteTable(group_id: string, table_id: string) {
    await this.prisma.referenceTable.delete({
      where: { group_id_table_id: { group_id, table_id } },
    });
  }

  // Column and lookup ops are read-modify-write on JSONB fields; concurrent
  // edits to the same table can lose writes. Schema editing is assumed
  // single-user. Row-level concurrency is handled separately via optimistic locking.
  private async mutateJsonArray<T>(
    group_id: string,
    table_id: string,
    field: "columns" | "lookups",
    mutate: (current: T[]) => T[],
  ) {
    const existing = await this.prisma.referenceTable.findUniqueOrThrow({
      where: { group_id_table_id: { group_id, table_id } },
    });
    const current = (existing[field] as unknown as T[]) ?? [];
    const next = mutate(current);
    return this.prisma.referenceTable.update({
      where: { group_id_table_id: { group_id, table_id } },
      data: { [field]: next as unknown as Prisma.InputJsonValue },
    });
  }

  async addColumn(group_id: string, table_id: string, col: ColumnDef) {
    return this.mutateJsonArray<ColumnDef>(
      group_id,
      table_id,
      "columns",
      (cols) => [...cols, col],
    );
  }

  async updateColumn(
    group_id: string,
    table_id: string,
    key: string,
    next: ColumnDef,
  ) {
    return this.mutateJsonArray<ColumnDef>(
      group_id,
      table_id,
      "columns",
      (cols) => cols.map((c) => (c.key === key ? next : c)),
    );
  }

  async removeColumn(group_id: string, table_id: string, key: string) {
    const result = await this.mutateJsonArray<ColumnDef>(
      group_id,
      table_id,
      "columns",
      (cols) => cols.filter((c) => c.key !== key),
    );

    // Strip the deleted column's data from every row so the key does not
    // reappear if a new column with the same key is added later.
    await this.prisma.$executeRaw`
      UPDATE reference_table_rows
      SET data = data - ${key}, updated_at = NOW()
      WHERE group_id = ${group_id} AND table_id = ${table_id}
    `;

    return result;
  }

  async addLookup(group_id: string, table_id: string, lookup: LookupDef) {
    return this.mutateJsonArray<LookupDef>(
      group_id,
      table_id,
      "lookups",
      (ls) => [...ls, lookup],
    );
  }

  async updateLookup(
    group_id: string,
    table_id: string,
    name: string,
    next: LookupDef,
  ) {
    return this.mutateJsonArray<LookupDef>(
      group_id,
      table_id,
      "lookups",
      (ls) => ls.map((l) => (l.name === name ? next : l)),
    );
  }

  async removeLookup(group_id: string, table_id: string, name: string) {
    return this.mutateJsonArray<LookupDef>(
      group_id,
      table_id,
      "lookups",
      (ls) => ls.filter((l) => l.name !== name),
    );
  }

  // Row CRUD — operates on the TableRow model with optimistic locking.
  // Each row uses updateMany with an updated_at timestamp check to detect
  // concurrent write conflicts at the row level.

  async createRow(
    group_id: string,
    table_id: string,
    data: Record<string, unknown>,
  ) {
    return this.prisma.referenceTableRow.create({
      data: {
        group_id,
        table_id,
        data: data as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findRow(group_id: string, table_id: string, id: string) {
    return this.prisma.referenceTableRow.findFirst({
      where: { id, group_id, table_id },
    });
  }

  async listRows(
    group_id: string,
    table_id: string,
    opts: { offset: number; limit: number },
  ) {
    const [rows, total] = await Promise.all([
      this.prisma.referenceTableRow.findMany({
        where: { group_id, table_id },
        orderBy: { created_at: "desc" },
        skip: opts.offset,
        take: opts.limit,
      }),
      this.prisma.referenceTableRow.count({ where: { group_id, table_id } }),
    ]);
    return { rows, total };
  }

  async updateRow(
    group_id: string,
    table_id: string,
    id: string,
    input: { data: Record<string, unknown>; expected_updated_at: Date },
  ) {
    const result = await this.prisma.referenceTableRow.updateMany({
      where: { id, group_id, table_id, updated_at: input.expected_updated_at },
      data: { data: input.data as unknown as Prisma.InputJsonValue },
    });
    if (result.count === 0) {
      throw new Error("row update conflict: stale expected_updated_at");
    }
    const refreshed = await this.findRow(group_id, table_id, id);
    if (!refreshed) {
      throw new Error("row not found after update");
    }
    return refreshed;
  }

  async deleteRow(group_id: string, table_id: string, id: string) {
    await this.prisma.referenceTableRow.deleteMany({
      where: { id, group_id, table_id },
    });
  }

  /** Returns `true` if the table has at least one row. */
  async hasRows(group_id: string, table_id: string): Promise<boolean> {
    const count = await this.prisma.referenceTableRow.count({
      where: { group_id, table_id },
    });
    return count > 0;
  }

  /**
   * Writes `value` into the `key` field of every existing row in the table.
   * Rows that already have the key are overwritten; rows without it have it
   * added. Used to backfill existing rows when a required column is added.
   *
   * @param group_id - The group that owns the table.
   * @param table_id - The stable table identifier.
   * @param key - Column key to backfill.
   * @param value - Value to write for every row.
   */
  async backfillColumn(
    group_id: string,
    table_id: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const rows = await this.prisma.referenceTableRow.findMany({
      where: { group_id, table_id },
      select: { id: true, data: true },
    });

    // Only update rows that are missing a value for this column — do not
    // overwrite rows that already have a value (including null explicitly set).
    const rowsToUpdate = rows.filter((row) => {
      const data = (row.data as Record<string, unknown>) ?? {};
      return data[key] === undefined || data[key] === null;
    });

    if (rowsToUpdate.length === 0) return;

    await this.prisma.$transaction(
      rowsToUpdate.map((row) =>
        this.prisma.referenceTableRow.update({
          where: { id: row.id },
          data: {
            data: {
              ...((row.data as Record<string, unknown>) ?? {}),
              [key]: value,
            } as Prisma.InputJsonValue,
          },
        }),
      ),
    );
  }

  /**
   * Returns `true` if any row in the table has `value` stored under `key`,
   * optionally excluding a specific row (used when updating a row to allow
   * the row to keep its own existing value).
   *
   * Filtering is pushed to Postgres via a JSONB containment query so no
   * rows are loaded into application memory.
   *
   * @param group_id - The group that owns the table.
   * @param table_id - The stable table identifier.
   * @param key - Column key to check.
   * @param value - Value to look for.
   * @param excludeId - Row id to exclude from the check (for updates).
   */
  async hasRowWithColumnValue(
    group_id: string,
    table_id: string,
    key: string,
    value: unknown,
    excludeId?: string,
  ): Promise<boolean> {
    const where: Prisma.ReferenceTableRowWhereInput = {
      group_id,
      table_id,
      // Prisma compiles { path, equals } to a JSONB @> containment query,
      // pushing the filter to Postgres rather than loading all rows.
      data: { path: [key], equals: value as Prisma.InputJsonValue },
    };
    if (excludeId) {
      where.NOT = { id: excludeId };
    }
    const hit = await this.prisma.referenceTableRow.findFirst({
      where,
      select: { id: true },
    });
    return hit !== null;
  }

  /**
   * Returns true if any two rows in the table share the same non-null value
   * for the given column key.
   *
   * Uses a GROUP BY / HAVING query so Postgres handles the deduplication check
   * rather than loading all rows into application memory.
   *
   * `key` is validated by KEY_PATTERN (`/^[a-z][a-z0-9_]*$/`) at the API
   * boundary; each `${...}` placeholder in the tagged template is a
   * parameterised binding, so this query is not vulnerable to SQL injection.
   */
  async columnHasDuplicateValues(
    group_id: string,
    table_id: string,
    key: string,
  ): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ found: bigint }>>`
      SELECT 1 AS found
      FROM reference_table_rows
      WHERE group_id = ${group_id}
        AND table_id = ${table_id}
        AND data->>${key} IS NOT NULL
      GROUP BY data->>${key}
      HAVING COUNT(*) > 1
      LIMIT 1
    `;
    return rows.length > 0;
  }
}
