import { Prisma, PrismaClient } from "@generated/client";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import type { ColumnDef } from "./types";

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
    return this.prisma.table.create({
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
    return this.prisma.table.findUnique({
      where: { group_id_table_id: { group_id, table_id } },
    });
  }

  async listTables(group_id: string) {
    return this.prisma.table.findMany({
      where: { group_id },
      orderBy: { label: "asc" },
    });
  }

  async updateTableMetadata(
    group_id: string,
    table_id: string,
    patch: { label?: string; description?: string | null },
  ) {
    return this.prisma.table.update({
      where: { group_id_table_id: { group_id, table_id } },
      data: patch,
    });
  }

  async deleteTable(group_id: string, table_id: string) {
    await this.prisma.table.delete({
      where: { group_id_table_id: { group_id, table_id } },
    });
  }

  // Column ops are read-modify-write on a JSONB field; concurrent edits to
  // the same table can lose writes. Schema editing is assumed single-user.
  // Row-level concurrency is handled separately via optimistic locking.
  async addColumn(group_id: string, table_id: string, col: ColumnDef) {
    const existing = await this.prisma.table.findUniqueOrThrow({
      where: { group_id_table_id: { group_id, table_id } },
    });
    const cols = (existing.columns as unknown as ColumnDef[]) ?? [];
    return this.prisma.table.update({
      where: { group_id_table_id: { group_id, table_id } },
      data: { columns: [...cols, col] as unknown as Prisma.InputJsonValue },
    });
  }

  async updateColumn(
    group_id: string,
    table_id: string,
    key: string,
    next: ColumnDef,
  ) {
    const existing = await this.prisma.table.findUniqueOrThrow({
      where: { group_id_table_id: { group_id, table_id } },
    });
    const cols = (existing.columns as unknown as ColumnDef[]) ?? [];
    const updated = cols.map((c) => (c.key === key ? next : c));
    return this.prisma.table.update({
      where: { group_id_table_id: { group_id, table_id } },
      data: { columns: updated as unknown as Prisma.InputJsonValue },
    });
  }

  async removeColumn(group_id: string, table_id: string, key: string) {
    const existing = await this.prisma.table.findUniqueOrThrow({
      where: { group_id_table_id: { group_id, table_id } },
    });
    const cols = (existing.columns as unknown as ColumnDef[]) ?? [];
    return this.prisma.table.update({
      where: { group_id_table_id: { group_id, table_id } },
      data: {
        columns: cols.filter(
          (c) => c.key !== key,
        ) as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
