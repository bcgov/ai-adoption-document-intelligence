/**
 * Returns the error message as a string.
 * Safely handles non-Error thrown values by falling back to String().
 *
 * @param error - The caught error value.
 * @returns The error message string.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns the error stack trace, or undefined for non-Error values.
 *
 * @param error - The caught error value.
 * @returns The stack trace string, or undefined.
 */
export function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
