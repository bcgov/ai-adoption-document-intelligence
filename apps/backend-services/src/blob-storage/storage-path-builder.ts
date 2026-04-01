import * as path from "path";

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

export const buildBlobFilePath = (groupId: string, category: OperationCategory, prefixComponents: string[], fileName: string): BlobFilePath => {
  // Combine elements for final storage path
  return path.posix.join(...[buildBlobPrefixPath(groupId, category, prefixComponents), fileName]) as BlobFilePath;
}

export const buildBlobPrefixPath = (groupId: string, category: OperationCategory, prefixComponents: string[]): BlobPrefixPath => {
  const prefix = buildPrefix(prefixComponents);
  return path.posix.join(groupId, category, prefix) as BlobPrefixPath;
}

export const validateBlobFilePath = (path: string): BlobFilePath => {
  // NOTE: There's no way to validate that this is actually a file path. This function is purely for typing purposes.
  return validateBlobPrefixPath(path) as string as BlobFilePath;
}

export const validateBlobPrefixPath = (path: string): BlobPrefixPath => {
  // Break into values: groupId/category/prefix/.../fileName
  const [groupId, category, ..._remainder] = path.split("/");
  // Check that groupId is a valid cuid
  if (!isCuid(groupId)){
    throw new Error(`Group ID ${groupId} in blob file path not a valid cuid`);
  }
  // Category must be from existing enum
  if (!(Object.values(OperationCategory).includes(category as OperationCategory))){
    throw new Error(`Category ${category} in blob file path not a valid category`)
  }
  // No method to validate remainder of prefix
  return path as BlobPrefixPath;
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