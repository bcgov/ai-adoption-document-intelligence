import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { AuditService } from "@/audit/audit.service";
import {
  buildRowZodSchema,
  validateColumnDefs,
  zodForColumn,
} from "./column-validation";
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

  /**
   * Per-table async mutex — serialises the uniqueness-check + insert/update
   * sequence for a given table so that concurrent requests cannot both pass
   * the check before either commits the write (TOCTOU prevention).
   *
   * NOTE: This lock is in-memory and per-process. It has no effect across
   * multiple service instances. A database-level unique constraint would be
   * required for cross-instance enforcement.
   */
  private readonly tableLocks = new Map<string, Promise<void>>();

  private async withTableLock<T>(
    group_id: string,
    table_id: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const key = `${group_id}:${table_id}`;
    const prev = this.tableLocks.get(key) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((res) => {
      resolve = res;
    });
    this.tableLocks.set(key, next);
    try {
      await prev;
      return await fn();
    } finally {
      resolve();
      if (this.tableLocks.get(key) === next) {
        this.tableLocks.delete(key);
      }
    }
  }

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
      resource_id: result.id,
      actor_id,
      group_id,
      payload: { label, description },
    });
    return result;
  }

  async listTables(group_id: string) {
    return this.db.listTables(group_id);
  }

  async getRowCountsForGroup(group_id: string) {
    return this.db.getRowCountsForGroup(group_id);
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
      resource_id: result.id,
      actor_id,
      group_id,
      payload: patch,
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
      resource_id: existing.id,
      actor_id,
      group_id,
      payload: { label: existing.label },
    });
  }

  /**
   * Adds a new column to an existing table.
   *
   * If `seed_value` is provided, every existing row in the table is updated so
   * that the new column key is set to that value. The seed value is validated
   * against the column schema before the backfill is performed.
   *
   * **The seed value only affects rows that existed at the time of this call.**
   * Rows inserted after the column is added must supply their own value.
   *
   * @param actor_id - The user performing the operation.
   * @param group_id - The group that owns the table.
   * @param table_id - The stable table identifier.
   * @param col - The column definition to add.
   * @param seed_value - Optional value to write into all existing rows for the new column.
   */
  async addColumn(
    actor_id: string,
    group_id: string,
    table_id: string,
    col: ColumnDef,
    seed_value?: unknown,
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

    if (seed_value !== undefined) {
      if (col.unique) {
        throw new BadRequestException(
          "Cannot provide a seed value for a unique column — each row must have a distinct value",
        );
      }

      const parsed = zodForColumn({ ...col, required: true }).safeParse(
        seed_value,
      );
      if (!parsed.success) {
        throw new BadRequestException(
          `seed_value is invalid for column type "${col.type}": ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        );
      }
    }

    // A required column without a seed_value cannot be added to a table that
    // already has rows — every existing row would be missing a value, violating
    // the required constraint.  (Nullable columns are fine: NULL is a valid
    // absent value for optional fields.)  For required+unique we also cannot
    // offer a seed value (unique columns reject seeds above), so we block
    // entirely with a more specific hint.
    if (col.required && seed_value === undefined) {
      const occupied = await this.db.hasRows(group_id, table_id);
      if (occupied) {
        if (col.unique) {
          throw new BadRequestException(
            "Cannot add a required + unique column to a table that already has rows — " +
              "existing rows would all get null, violating the required constraint. " +
              "Add the column without these flags first, fill in distinct values for all rows, then enable required and unique.",
          );
        }
        throw new BadRequestException(
          "Cannot add a required column without a seed_value to a table that already has rows — " +
            "existing rows would be missing a value, violating the required constraint. " +
            "Provide a seed_value to backfill existing rows, or add the column as optional first.",
        );
      }
    }

    const result =
      seed_value !== undefined
        ? await this.db.addColumnAndBackfill(
            group_id,
            table_id,
            col,
            seed_value,
          )
        : await this.db.addColumn(group_id, table_id, col);

    await this.audit.recordEvent({
      event_type: "tables.column.added",
      resource_type: "table",
      resource_id: result.id,
      actor_id,
      group_id,
      // seed_value is reference-table data (not sensitive PII). It is
      // included so the audit trail captures the initial backfill value.
      payload: { column: col, seed_value },
    });
    return result;
  }

  /**
   * Updates an existing column definition.
   *
   * If `seed_value` is provided, every existing row that has no value for this
   * column key will be updated so that it is set to the seed value. Useful
   * when enabling `required` on a column that already has rows.
   *
   * `required` and `unique` cannot both be true in the same save — achieve both
   * by first saving as required, filling in distinct values, then enabling unique.
   *
   * @param actor_id - The user performing the operation.
   * @param group_id - The group that owns the table.
   * @param table_id - The stable table identifier.
   * @param key - Column key to update.
   * @param next - New column definition.
   * @param seed_value - Optional value to write into rows that have no value for this column.
   */
  async updateColumn(
    actor_id: string,
    group_id: string,
    table_id: string,
    key: string,
    next: ColumnDef,
    seed_value?: unknown,
  ) {
    const t = await this.db.findTable(group_id, table_id);
    if (!t) throw new BadRequestException("table not found");

    const existingCols = t.columns as unknown as ColumnDef[];
    const existingLookups = t.lookups as unknown as LookupDef[];
    const before = existingCols.find((c) => c.key === key);
    const proposed = existingCols.map((c) => (c.key === key ? next : c));

    // Run all pure validation before touching any data.
    if (seed_value !== undefined) {
      const parsed = zodForColumn({ ...next, required: true }).safeParse(
        seed_value,
      );
      if (!parsed.success) {
        throw new BadRequestException(
          `seed_value is invalid for column type "${next.type}": ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        );
      }
    }

    try {
      validateColumnDefs(proposed);
      validateLookupDefs(existingLookups, proposed);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : String(err),
      );
    }

    // Apply seed before the uniqueness check so the check sees the final
    // data state (null rows filled in by the seed may introduce duplicates).
    // When seed_value is present, all three steps run inside a single DB
    // transaction so the backfill is rolled back if the duplicate check fails.
    const checkDuplicates =
      !!next.unique && (!before?.unique || seed_value !== undefined);

    // Guard: enabling required without a seed_value would leave rows that have
    // no value for this column in an invalid state.
    if (next.required && !before?.required && seed_value === undefined) {
      const hasMissing = await this.db.hasRowsMissingColumn(
        group_id,
        table_id,
        key,
      );
      if (hasMissing) {
        throw new BadRequestException(
          `Cannot mark column "${next.label}" as required — existing rows are missing a value for it. ` +
            "Provide a seed_value to backfill those rows, or fill in all values manually first.",
        );
      }
    }

    let result: Awaited<ReturnType<typeof this.db.updateColumn>>;
    if (seed_value !== undefined) {
      result = await this.db.backfillAndUpdateColumn(
        group_id,
        table_id,
        key,
        next,
        seed_value,
        checkDuplicates,
        next.label,
      );
    } else {
      if (checkDuplicates) {
        const hasDuplicates = await this.db.columnHasDuplicateValues(
          group_id,
          table_id,
          key,
        );
        if (hasDuplicates) {
          throw new ConflictException(
            `Column "${next.label}" cannot be saved — rows contain duplicate values. Fill in distinct values for all rows before saving.`,
          );
        }
      }
      result = await this.db.updateColumn(group_id, table_id, key, next);
    }

    await this.audit.recordEvent({
      event_type: "tables.column.updated",
      resource_type: "table",
      resource_id: result.id,
      actor_id,
      group_id,
      // seed_value is reference-table data (not sensitive PII).
      payload: { column_key: key, before, after: next, seed_value },
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
      resource_id: result.id,
      actor_id,
      group_id,
      payload: { column_key: key },
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
      resource_id: result.id,
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
      resource_id: result.id,
      actor_id,
      group_id,
      payload: { lookup_name: name, after: next },
    });
    return result;
  }

  // removeLookup is unconditionally safe: filtering an absent name is a no-op,
  // so no findTable read or validation is required.
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
      resource_id: result.id,
      actor_id,
      group_id,
      payload: { lookup_name: name },
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

    // Serialise the check-then-insert within a per-table lock to prevent
    // concurrent requests from both passing the uniqueness check before
    // either write is committed.
    const row = await this.withTableLock(group_id, table_id, async () => {
      const uniqueCols = cols.filter((c) => c.unique);
      for (const col of uniqueCols) {
        const val = parsed[col.key];
        if (val !== undefined && val !== null) {
          const clash = await this.db.hasRowWithColumnValue(
            group_id,
            table_id,
            col.key,
            val,
          );
          if (clash) {
            throw new ConflictException(
              `Column "${col.label}" requires unique values — "${val}" is already in use`,
            );
          }
        }
      }
      return this.db.createRow(group_id, table_id, parsed);
    });

    await this.audit.recordEvent({
      event_type: "tables.row.created",
      resource_type: "table_row",
      resource_id: row.id,
      actor_id,
      group_id,
      payload: { table_id, after: parsed },
    });
    return row;
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

    // Fetch the current row state for audit purposes before the lock is acquired.
    const before = await this.db.findRow(group_id, table_id, id);

    // Serialise the check-then-update within a per-table lock to prevent
    // concurrent requests from both passing the uniqueness check before
    // either write is committed.
    const row = await this.withTableLock(group_id, table_id, async () => {
      const uniqueCols = cols.filter((c) => c.unique);
      for (const col of uniqueCols) {
        const val = parsed[col.key];
        if (val !== undefined && val !== null) {
          const clash = await this.db.hasRowWithColumnValue(
            group_id,
            table_id,
            col.key,
            val,
            id,
          );
          if (clash) {
            throw new ConflictException(
              `Column "${col.label}" requires unique values — "${val}" is already in use`,
            );
          }
        }
      }

      try {
        return await this.db.updateRow(group_id, table_id, id, {
          data: parsed,
          expected_updated_at: input.expected_updated_at,
        });
      } catch (e) {
        throw new ConflictException((e as Error).message);
      }
    });

    await this.audit.recordEvent({
      event_type: "tables.row.updated",
      resource_type: "table_row",
      resource_id: row.id,
      actor_id,
      group_id,
      payload: { table_id, before: before?.data, after: parsed },
    });
    return row;
  }

  async deleteRow(
    actor_id: string,
    group_id: string,
    table_id: string,
    id: string,
  ) {
    const before = await this.db.findRow(group_id, table_id, id);
    if (!before) return;

    await this.db.deleteRow(group_id, table_id, id);
    await this.audit.recordEvent({
      event_type: "tables.row.deleted",
      resource_type: "table_row",
      resource_id: before.id,
      actor_id,
      group_id,
      payload: { table_id, before: before.data },
    });
  }
}
