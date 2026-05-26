import { Prisma, PrismaClient } from "@generated/client";
import { ConflictException, Injectable } from "@nestjs/common";
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

  async getRowCountsForGroup(
    group_id: string,
  ): Promise<Record<string, number>> {
    const counts = await this.prisma.$queryRaw<
      Array<{ table_id: string; count: bigint }>
    >`
      SELECT table_id, COUNT(*) as count
      FROM reference_table_rows
      WHERE group_id = ${group_id}
      GROUP BY table_id
    `;
    return Object.fromEntries(
      counts.map((row) => [row.table_id, Number(row.count)]),
    );
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

  /**
   * Atomically backfills `seed_value` into rows that are missing a value for
   * `key`, optionally checks that no duplicates exist (when `unique` is being
   * enabled), and updates the column definition — all within a single Prisma
   * interactive transaction.
   *
   * If the duplicate check fails the entire transaction is rolled back, so the
   * backfill is never persisted and the column schema is unchanged.
   *
   * @param group_id - The group that owns the table.
   * @param table_id - The stable table identifier.
   * @param key - Column key being updated.
   * @param next - New column definition to persist.
   * @param seed_value - Value to write into rows missing this column.
   * @param checkDuplicates - Whether to check for duplicate values after backfill.
   * @param duplicateLabel - Human-readable column label used in the conflict message.
   */
  async backfillAndUpdateColumn(
    group_id: string,
    table_id: string,
    key: string,
    next: ColumnDef,
    seed_value: unknown,
    checkDuplicates: boolean,
    duplicateLabel: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Backfill rows missing a value — rolled back if anything below throws.
      const valueJson = JSON.stringify(seed_value);
      await tx.$executeRaw`
        UPDATE reference_table_rows
        SET data       = data || jsonb_build_object(${key}::text, ${valueJson}::jsonb),
            updated_at = NOW()
        WHERE group_id  = ${group_id}
          AND table_id  = ${table_id}
          AND data->>${key}::text IS NULL
      `;

      // 2. Duplicate check sees the freshly backfilled data.
      if (checkDuplicates) {
        const rows = await tx.$queryRaw<Array<{ found: bigint }>>`
          SELECT 1 AS found
          FROM reference_table_rows
          WHERE group_id  = ${group_id}
            AND table_id  = ${table_id}
            AND data->>${key}::text IS NOT NULL
          GROUP BY data->>${key}::text
          HAVING COUNT(*) > 1
          LIMIT 1
        `;
        if (rows.length > 0) {
          throw new ConflictException(
            `Column "${duplicateLabel}" cannot be saved — rows contain duplicate values. Fill in distinct values for all rows before saving.`,
          );
        }
      }

      // 3. Update the column schema.
      const existing = await tx.referenceTable.findUniqueOrThrow({
        where: { group_id_table_id: { group_id, table_id } },
      });
      const cols = (existing.columns as unknown as ColumnDef[]) ?? [];
      const updated = cols.map((c) => (c.key === key ? next : c));
      return tx.referenceTable.update({
        where: { group_id_table_id: { group_id, table_id } },
        data: { columns: updated as unknown as Prisma.InputJsonValue },
      });
    });
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
      SET data = data - ${key}::text, updated_at = NOW()
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
   * Writes `value` into the `key` field of every row that is currently
   * missing a value for that column (i.e. the key is absent or JSON null).
   * Rows that already have a non-null value are left unchanged.
   *
   * Uses a single `UPDATE … WHERE data->>'key' IS NULL` statement so no rows
   * are loaded into application memory.
   *
   * `key` is validated by `KEY_PATTERN` at the API boundary; each `${…}`
   * placeholder is a parameterised binding, so this query is not vulnerable
   * to SQL injection.
   *
   * @param group_id - The group that owns the table.
   * @param table_id - The stable table identifier.
   * @param key - Column key to backfill.
   * @param value - Value to write into rows that are missing this column.
   */
  async backfillColumn(
    group_id: string,
    table_id: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const valueJson = JSON.stringify(value);
    await this.prisma.$executeRaw`
      UPDATE reference_table_rows
      SET data       = data || jsonb_build_object(${key}::text, ${valueJson}::jsonb),
          updated_at = NOW()
      WHERE group_id  = ${group_id}
        AND table_id  = ${table_id}
        AND data->>${key}::text IS NULL
    `;
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
        AND data->>${key}::text IS NOT NULL
      GROUP BY data->>${key}::text
      HAVING COUNT(*) > 1
      LIMIT 1
    `;
    return rows.length > 0;
  }
}
