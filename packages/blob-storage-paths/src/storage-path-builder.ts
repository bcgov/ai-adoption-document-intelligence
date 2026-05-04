import * as path from "node:path";

export enum OperationCategory {
  OCR = "ocr",
  TRAINING = "training",
  CLASSIFICATION = "classification",
  BENCHMARK = "benchmark"
}

export type BlobFilePath = string & { readonly brand: 'BlobFilePath' };
export type BlobPrefixPath = string & { readonly brand: 'BlobPrefixPath' };

const buildPrefix = (prefixComponents: string[]): string => {
  // Combine prefix components if they exist
  let prefix = path.posix.join(...prefixComponents);
  // Ensure there are no illegal characters (\ or :)
  if (prefix.includes("\\") || prefix.includes(":")){
    throw new Error("Blob storage path includes illegal characters. No : or \\ permitted.")
  }
  // Remove any double //. Callers may have included the / in the prefix components mistakenly.
  prefix = prefix.replace(new RegExp("//"), "/");
  return prefix;
}

/**
 * Builds a fully-qualified blob file path in the form:
 * `{groupId}/{category}/{...prefixComponents}/{fileName}`
 *
 * @param groupId - The group identifier (must be a valid CUID).
 * @param category - The operation category (e.g. ocr, training).
 * @param prefixComponents - Additional path segments between the category and the file name.
 * @param fileName - The file name. Include the extension here if relevant.
 * @returns A branded `BlobFilePath` string.
 */
export const buildBlobFilePath = (groupId: string, category: OperationCategory, prefixComponents: string[], fileName: string): BlobFilePath => {
  // Combine elements for final storage path
  return path.posix.join(...[buildBlobPrefixPath(groupId, category, prefixComponents), fileName]) as BlobFilePath;
}

/**
 * Builds a shared blob prefix path in the form:
 * `_shared/{category}/{...prefixComponents}`
 *
 * Use this for resources that are not scoped to a specific group,
 * such as shared training data used across all classifiers.
 *
 * @param category - The operation category (e.g. classification).
 * @param prefixComponents - Additional path segments appended after the category.
 * @returns A branded `BlobPrefixPath` string.
 */
export const buildSharedBlobPrefixPath = (category: OperationCategory, prefixComponents: string[]): BlobPrefixPath => {
  const prefix = buildPrefix(prefixComponents);
  return path.posix.join("_shared", category, prefix) as BlobPrefixPath;
}

/**
 * Builds a blob prefix path in the form:
 * `{groupId}/{category}/{...prefixComponents}`
 *
 * @param groupId - The group identifier (must be a valid CUID).
 * @param category - The operation category (e.g. ocr, training).
 * @param prefixComponents - Additional path segments appended after the category.
 * @returns A branded `BlobPrefixPath` string.
 */
export const buildBlobPrefixPath = (groupId: string, category: OperationCategory, prefixComponents: string[]): BlobPrefixPath => {
  const prefix = buildPrefix(prefixComponents);
  return path.posix.join(groupId, category, prefix) as BlobPrefixPath;
}

/**
 * Casts an arbitrary string to a `BlobFilePath` after validating its structure.
 * Throws if the path does not start with a valid CUID group ID and a known category.
 *
 * @param blobPath - The raw path string to validate.
 * @returns A branded `BlobFilePath`.
 */
export const validateBlobFilePath = (blobPath: string): BlobFilePath => {
  // NOTE: There's no way to validate that this is actually a file path. This function is purely for typing purposes.
  return validateBlobPrefixPath(blobPath) as string as BlobFilePath;
}

/**
 * Casts an arbitrary string to a `BlobPrefixPath` after validating its structure.
 * Throws if the path does not start with a valid CUID group ID and a known category.
 *
 * @param blobPath - The raw path string to validate.
 * @returns A branded `BlobPrefixPath`.
 */
export const validateBlobPrefixPath = (blobPath: string): BlobPrefixPath => {
  // Break into values: groupId/category/prefix/.../fileName
  const [groupId, category, ..._remainder] = blobPath.split("/");
  // Check that groupId is a valid cuid
  if (!isCuid(groupId)){
    throw new Error(`Group ID ${groupId} in blob file path not a valid cuid`);
  }
  // Category must be from existing enum
  if (!(Object.values(OperationCategory).includes(category as OperationCategory))){
    throw new Error(`Category ${category} in blob file path not a valid category`)
  }
  // No method to validate remainder of prefix
  return blobPath as BlobPrefixPath;
}

/**
 * Type guard that checks whether a value is a valid CUID.
 *
 * A valid CUID starts with a lowercase letter and contains only
 * lowercase alphanumeric characters.
 *
 * @param value - The value to check.
 * @returns `true` if the value matches CUID format.
 */
const isCuid = (value: string): boolean => {
  if (value.length < 2) return false;
  return /^[a-z][0-9a-z]+$/.test(value);
}
