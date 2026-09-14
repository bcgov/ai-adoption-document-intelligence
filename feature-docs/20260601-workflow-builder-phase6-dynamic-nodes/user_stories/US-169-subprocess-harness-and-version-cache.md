# US-169: Subprocess harness + version-cache LRU

**As a** worker engineer wiring the `dyn.run` activity,
**I want** a small auto-appended harness template + an in-process LRU cache keyed by `versionId`,
**So that** the activity body (US-170) is short + the user/agent never writes boilerplate I/O wiring + worker memory stays bounded.

## Acceptance Criteria

- [x] **Scenario 1**: `subprocess-harness.ts` exports the harness template + assembly helper
    - **Given** `apps/temporal/src/dynamic-nodes/subprocess-harness.ts`
    - **When** the file is read
    - **Then** it exports `buildSubprocessScript(userScript: string): string` that returns the user's script concatenated with a fixed harness suffix
    - **And** the suffix imports the default export, reads ONE JSON line from stdin, calls the function with `(inputCtx, parameters)`, and writes the result as JSON to stdout — no other I/O

- [x] **Scenario 2**: `version-cache.ts` exports a 256-entry LRU map
    - **Given** `apps/temporal/src/dynamic-nodes/version-cache.ts`
    - **When** the file is read
    - **Then** it exports `versionCache` (a module-level singleton) with the API `get(versionId): ScriptCacheEntry | undefined`, `set(versionId, entry)`, `delete(versionId)`, `size(): number`
    - **And** the cache has a hard cap of 256 entries (LRU-evicting on `set` when full)
    - **And** `ScriptCacheEntry` is `{ tempPath: string; signature: DynamicNodeSignature; allowNet: string[]; deterministic: boolean }`

- [x] **Scenario 3**: Cache miss writes a temp file + populates the entry
    - **Given** the cache miss helper `loadVersion(versionId, prisma)`
    - **When** called for a versionId not in cache
    - **Then** it `SELECT`s the row from `dynamic_node_version`, calls `buildSubprocessScript(row.script)`, writes to `os.tmpdir()/ai-di-dyn/${versionId}.ts`, and populates the cache
    - **And** subsequent calls for the same `versionId` reuse the temp file (no re-write)

- [x] **Scenario 4**: Cache eviction deletes the orphan temp file
    - **Given** the cache is at 256 entries and a 257th `set` happens
    - **When** the LRU evicts the least-recently-used entry
    - **Then** the evicted entry's `tempPath` is deleted from disk
    - **And** the cache size returns to 256

- [x] **Scenario 5**: Unit tests cover harness assembly + cache lifecycle
    - **Given** `subprocess-harness.spec.ts` + `version-cache.spec.ts`
    - **When** the suites run
    - **Then** tests pass for: harness assembly produces a syntactically valid Deno script that round-trips a stdin/stdout JSON message via a synthetic user script; cache `get` after `set` returns the entry; cache eviction at 257 removes the LRU entry + its temp file; `delete(versionId)` removes both entry and file

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/temporal/src/dynamic-nodes/subprocess-harness.ts` — new file
- `apps/temporal/src/dynamic-nodes/subprocess-harness.spec.ts` — new file
- `apps/temporal/src/dynamic-nodes/version-cache.ts` — new file
- `apps/temporal/src/dynamic-nodes/version-cache.spec.ts` — new file

## Technical notes

- The harness suffix is a small fixed template — keep it in source as a string constant. Example:
  ```
  ;import script from "./<thisFile>.ts";
  const inputJson = await new Response(Deno.stdin.readable).text();
  const { inputCtx, parameters } = JSON.parse(inputJson);
  const out = await script(inputCtx, parameters);
  Deno.stdout.write(new TextEncoder().encode(JSON.stringify(out)));
  ```
  Adjust for the precise self-import semantics that work in Deno.
- The cache is in-process — no cross-process state. The cache is naturally per-worker; multiple workers each maintain their own.
- The cache survives worker process lifetime, NOT host restart. Temp files orphaned by a worker crash are cleaned up on next worker startup (sweep `os.tmpdir()/ai-di-dyn/`).
- Use a simple LRU implementation (small wrapped `Map`) or pull in `lru-cache` from node_modules if already a dep — check `apps/temporal/package.json`.
- After landing: no Vite restart (Temporal-only).
