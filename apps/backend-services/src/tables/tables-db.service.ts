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
    return this.mutateJsonArray<ColumnDef>(
      group_id,
      table_id,
      "columns",
      (cols) => cols.filter((c) => c.key !== key),
    );
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
}
