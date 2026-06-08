# Backing up the production database to a Windows network share

This page describes `scripts/oc-backup-db-to-unc.sh`, a variant of the standard
backup script that streams a `pg_dump` of an instance's PostgreSQL database
straight to a Windows UNC share — without ever creating a file on the WSL host.

Use it when the backup must not be persisted on the local machine (for example,
when capturing production into a managed file-share location such as
`\\widget\SDPRDocuments`).

## When to use this vs. `oc-backup-db.sh`

| Question | Use `oc-backup-db.sh` | Use `oc-backup-db-to-unc.sh` |
|----------|-----------------------|-------------------------------|
| Output destination | `./backups/<file>.pgc` on the WSL host | `\\server\share\<file>.pgc` on Windows |
| Local file allowed? | Yes | No — nothing is written locally |
| Platform | Any host with `oc` | WSL only (uses `powershell.exe`) |
| Restore workflow | Pass local file to `oc-restore-db.sh --from` | File must first be copied somewhere local before restore |

## Prerequisites

- WSL with Windows interop enabled (`powershell.exe` reachable at
  `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`).
- The UNC share is reachable from the Windows side and the current Windows
  user has write access to it.
- `.oc-deploy/token` exists — created by `scripts/oc-setup-sa.sh` against the
  target namespace (e.g. `fd34fb-prod`).
- The service account has `pods/exec` permission (granted during setup).

## Usage

```bash
# Production (instance bcgov-di in namespace fd34fb-prod)
./scripts/oc-backup-db-to-unc.sh --instance bcgov-di --dest '\\widget\SDPRDocuments'

# Defaulting the instance to the current git branch
./scripts/oc-backup-db-to-unc.sh --dest '\\widget\SDPRDocuments'
```

Output file: `<dest>\<instance>-<YYYYMMDD-HHMMSS>.pgc`, e.g.
`\\widget\SDPRDocuments\bcgov-di-20260515-082000.pgc`.

The dump uses `pg_dump -Fc --clean --if-exists` (custom format with drop/recreate
statements). Restore with `pg_restore` or the project's `oc-restore-db.sh`.

## How "no local file" is achieved

The standard `oc-backup-db.sh` writes the dump to `/tmp/...` inside the pod,
then `oc cp`s it to the local filesystem. This script replaces the second
step with a direct stream:

1. `oc exec <pod> -c database -- pg_dump -Fc ...` writes the dump to stdout
   (no TTY, so the binary custom-format stream is preserved end-to-end).
2. Bash pipes that stdout into `powershell.exe -NoProfile -Command '...'`.
3. The PowerShell side reads raw bytes via `[Console]::OpenStandardInput()`
   and writes them to `[System.IO.File]::Create('<UNC path>')`. Using the
   stream APIs (not `Set-Content`) keeps the byte sequence intact — no
   CRLF translation, no implicit decoding.
4. PowerShell then queries `Get-Item <dest>` for `.Length` and reports the
   byte count back. The dump itself is never opened for reading.

No file is created on the WSL filesystem or on a local Windows drive — the
bytes traverse the pipe and land on the network share.

## Before-stream safety check

Before invoking `pg_dump`, the script writes a 2-byte probe file to the
destination via PowerShell and deletes it again. If the probe fails (share
unreachable, no write permission, path doesn't exist), the script aborts
before any database work begins. This avoids running a multi-minute dump only
to discover the destination is unwritable.

## Restoring a dump that lives on a network share

`scripts/oc-restore-db.sh` expects a local file path, so to restore you must
first copy the `.pgc` file to a location the restore script can read.

```bash
# From WSL, copy back via powershell.exe (or any Windows file-copy tool)
powershell.exe -NoProfile -Command "Copy-Item '\\widget\SDPRDocuments\bcgov-di-20260515-082000.pgc' 'C:\temp\restore.pgc'"
./scripts/oc-restore-db.sh --instance bcgov-di-test --from /mnt/c/temp/restore.pgc
```

The restore script uses `pg_restore` and respects the `--clean --if-exists`
flags baked into the dump, so existing data in the target instance is
dropped and replaced.

## What is *not* backed up

The script captures only the PostgreSQL database. Azure Blob Storage content
(uploaded documents, attachments, etc.) is **not** included; it must be
backed up separately. This matches the behavior of `oc-backup-db.sh`.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| `powershell.exe not found at /mnt/c/Windows/...` | Not running under WSL, or Windows interop is disabled. |
| `Destination not writable` | UNC share is unreachable, or the Windows user lacks write permission. Try `powershell.exe -Command "Test-Path '<dest>'"` to verify. |
| `Backup stream failed` | Either `oc exec` lost its connection, or the PowerShell side errored. A partial file may exist at the destination — delete it before retrying. |
| `Token may have expired` | Re-run `./scripts/oc-setup-sa.sh --namespace <namespace>` to issue a fresh token. |
| Backup file is much smaller than expected | The database may genuinely be small, but also check stderr from `pg_dump` (printed inline) for table-level errors. |
