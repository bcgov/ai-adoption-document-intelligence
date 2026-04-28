import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";

export interface CreateTableInput {
  group_id: string;
  table_id: string;
  label: string;
  description: string | null;
}

@Injectable()
export class TablesDbService {
  constructor(private readonly prisma: PrismaService) {}

  async createTable(input: CreateTableInput) {
    return this.prisma.prisma.table.create({
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
    return this.prisma.prisma.table.findUnique({
      where: { group_id_table_id: { group_id, table_id } },
    });
  }

  async listTables(group_id: string) {
    return this.prisma.prisma.table.findMany({
      where: { group_id },
      orderBy: { label: "asc" },
    });
  }

  async updateTableMetadata(
    group_id: string,
    table_id: string,
    patch: { label?: string; description?: string | null },
  ) {
    return this.prisma.prisma.table.update({
      where: { group_id_table_id: { group_id, table_id } },
      data: patch,
    });
  }

  async deleteTable(group_id: string, table_id: string) {
    await this.prisma.prisma.table.delete({
      where: { group_id_table_id: { group_id, table_id } },
    });
  }
}
