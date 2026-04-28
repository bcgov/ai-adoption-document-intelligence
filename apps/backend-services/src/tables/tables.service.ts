import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { AuditService } from "@/audit/audit.service";
import { buildRowZodSchema, validateColumnDefs } from "./column-validation";
import { findLookupsReferencingColumn } from "./dependency-check";
import { validateLookupDefs } from "./lookup-validation";
import { type CreateTableInput, TablesDbService } from "./tables-db.service";
import type { ColumnDef, LookupDef } from "./types";

export interface CreateTableArgs extends CreateTableInput {
  actor_id: string;
}

@Injectable()
export class TablesService {
  constructor(
    private readonly db: TablesDbService,
    private readonly audit: AuditService,
  ) {}

  async createTable(args: CreateTableArgs) {
    const { actor_id, group_id, table_id, label, description } = args;
    const result = await this.db.createTable({
      group_id,
      table_id,
      label,
      description,
    });
    await this.audit.recordEvent({
      event_type: "tables.created",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { label, description },
    });
    return result;
  }

  async listTables(group_id: string) {
    return this.db.listTables(group_id);
  }

  async getTable(group_id: string, table_id: string) {
    return this.db.findTable(group_id, table_id);
  }

  async updateTableMetadata(
    actor_id: string,
    group_id: string,
    table_id: string,
    patch: { label?: string; description?: string | null },
  ) {
    const result = await this.db.updateTableMetadata(group_id, table_id, patch);
    await this.audit.recordEvent({
      event_type: "tables.updated",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { patch },
    });
    return result;
  }

  async deleteTable(actor_id: string, group_id: string, table_id: string) {
    const existing = await this.db.findTable(group_id, table_id);
    if (!existing) return;
    await this.db.deleteTable(group_id, table_id);
    await this.audit.recordEvent({
      event_type: "tables.deleted",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { label: existing.label },
    });
  }

  async addColumn(
    actor_id: string,
    group_id: string,
    table_id: string,
    col: ColumnDef,
  ) {
    const t = await this.db.findTable(group_id, table_id);
    if (!t) throw new BadRequestException("table not found");

    const existingCols = t.columns as unknown as ColumnDef[];
    const existingLookups = t.lookups as unknown as LookupDef[];
    const next = [...existingCols, col];

    try {
      validateColumnDefs(next);
      validateLookupDefs(existingLookups, next);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }

    const result = await this.db.addColumn(group_id, table_id, col);
    await this.audit.recordEvent({
      event_type: "tables.column.added",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { column: col },
    });
    return result;
  }

  async updateColumn(
    actor_id: string,
    group_id: string,
    table_id: string,
    key: string,
    next: ColumnDef,
  ) {
    const t = await this.db.findTable(group_id, table_id);
    if (!t) throw new BadRequestException("table not found");

    const existingCols = t.columns as unknown as ColumnDef[];
    const existingLookups = t.lookups as unknown as LookupDef[];
    const before = existingCols.find((c) => c.key === key);
    const proposed = existingCols.map((c) => (c.key === key ? next : c));

    try {
      validateColumnDefs(proposed);
      validateLookupDefs(existingLookups, proposed);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }

    const result = await this.db.updateColumn(group_id, table_id, key, next);
    await this.audit.recordEvent({
      event_type: "tables.column.updated",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { key, before, after: next },
    });
    return result;
  }

  async removeColumn(
    actor_id: string,
    group_id: string,
    table_id: string,
    key: string,
  ) {
    const t = await this.db.findTable(group_id, table_id);
    if (!t) throw new BadRequestException("table not found");

    const existingLookups = t.lookups as unknown as LookupDef[];
    const dependents = findLookupsReferencingColumn(existingLookups, key);
    if (dependents.length > 0) {
      throw new ConflictException(
        `column "${key}" is referenced by lookups: ${dependents.join(", ")}`,
      );
    }

    const result = await this.db.removeColumn(group_id, table_id, key);
    await this.audit.recordEvent({
      event_type: "tables.column.removed",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { key },
    });
    return result;
  }

  async addLookup(
    actor_id: string,
    group_id: string,
    table_id: string,
    lookup: LookupDef,
  ) {
    const t = await this.db.findTable(group_id, table_id);
    if (!t) throw new BadRequestException("table not found");

    const existingCols = t.columns as unknown as ColumnDef[];
    const existingLookups = t.lookups as unknown as LookupDef[];
    const proposed = [...existingLookups, lookup];

    try {
      validateLookupDefs(proposed, existingCols);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }

    const result = await this.db.addLookup(group_id, table_id, lookup);
    await this.audit.recordEvent({
      event_type: "tables.lookup.added",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { lookup },
    });
    return result;
  }

  async updateLookup(
    actor_id: string,
    group_id: string,
    table_id: string,
    name: string,
    next: LookupDef,
  ) {
    const t = await this.db.findTable(group_id, table_id);
    if (!t) throw new BadRequestException("table not found");

    const existingCols = t.columns as unknown as ColumnDef[];
    const existingLookups = t.lookups as unknown as LookupDef[];
    const before = existingLookups.find((l) => l.name === name);
    const proposed = existingLookups.map((l) => (l.name === name ? next : l));

    try {
      validateLookupDefs(proposed, existingCols);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }

    const result = await this.db.updateLookup(group_id, table_id, name, next);
    await this.audit.recordEvent({
      event_type: "tables.lookup.updated",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { name, before, after: next },
    });
    return result;
  }

  async removeLookup(
    actor_id: string,
    group_id: string,
    table_id: string,
    name: string,
  ) {
    const result = await this.db.removeLookup(group_id, table_id, name);
    await this.audit.recordEvent({
      event_type: "tables.lookup.removed",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { name },
    });
    return result;
  }

  async createRow(
    actor_id: string,
    group_id: string,
    table_id: string,
    data: Record<string, unknown>,
  ) {
    const t = await this.db.findTable(group_id, table_id);
    if (!t) throw new BadRequestException("table not found");

    const cols = t.columns as unknown as ColumnDef[];
    const schema = buildRowZodSchema(cols);
    // Let ZodError propagate — Nest's global filter handles it, or caller wraps it
    const parsed = schema.parse(data) as Record<string, unknown>;

    const result = await this.db.createRow(group_id, table_id, parsed);
    await this.audit.recordEvent({
      event_type: "tables.row.created",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { after: parsed },
    });
    return result;
  }

  async listRows(
    group_id: string,
    table_id: string,
    opts: { offset: number; limit: number },
  ) {
    return this.db.listRows(group_id, table_id, opts);
  }

  async getRow(group_id: string, table_id: string, id: string) {
    return this.db.findRow(group_id, table_id, id);
  }

  async updateRow(
    actor_id: string,
    group_id: string,
    table_id: string,
    id: string,
    input: { data: Record<string, unknown>; expected_updated_at: Date },
  ) {
    const t = await this.db.findTable(group_id, table_id);
    if (!t) throw new BadRequestException("table not found");

    const cols = t.columns as unknown as ColumnDef[];
    const schema = buildRowZodSchema(cols);
    const parsed = schema.parse(input.data) as Record<string, unknown>;

    const before = await this.db.findRow(group_id, table_id, id);

    const result = await this.db
      .updateRow(group_id, table_id, id, {
        data: parsed,
        expected_updated_at: input.expected_updated_at,
      })
      .catch((err: unknown) => {
        throw new ConflictException(
          err instanceof Error ? err.message : "row update conflict",
        );
      });

    await this.audit.recordEvent({
      event_type: "tables.row.updated",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: {
        row_id: id,
        before: before?.data,
        after: parsed,
      },
    });
    return result;
  }

  async deleteRow(
    actor_id: string,
    group_id: string,
    table_id: string,
    id: string,
  ) {
    const existing = await this.db.findRow(group_id, table_id, id);
    if (!existing) return;

    await this.db.deleteRow(group_id, table_id, id);
    await this.audit.recordEvent({
      event_type: "tables.row.deleted",
      resource_type: "table",
      resource_id: table_id,
      actor_id,
      group_id,
      payload: { row_id: id, before: existing.data },
    });
  }
}
