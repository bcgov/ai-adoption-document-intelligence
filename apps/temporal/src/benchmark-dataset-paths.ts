/**
 * Path helpers for materialised benchmark datasets. Pure string operations,
 * so they are safe to call from workflow code.
 */

/**
 * Joins a manifest-relative path onto a materialised dataset directory.
 * Throws when the relative path is absolute or has a `..` segment, so the
 * result always stays inside the dataset directory.
 */
export function joinDatasetPath(baseDir: string, relativePath: string): string {
  if (
    relativePath.startsWith("/") ||
    relativePath.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(
      `Dataset file path must stay inside the dataset: "${relativePath}"`,
    );
  }
  return `${baseDir}/${relativePath}`.replace(/\/+/g, "/");
}
