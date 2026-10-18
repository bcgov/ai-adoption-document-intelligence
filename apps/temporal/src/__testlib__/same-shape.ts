/**
 * `true` only when A and B are the same type, optional properties included,
 * at every depth. Used as a compile-time check that an activity's parameters
 * and the parameter schema of its catalog entry agree: a parameter on one
 * side only fails the type-check of the test that compares them.
 *
 * Assignability both ways is not enough, because an optional property present
 * on one side only is assignable in both directions.
 */
export type SameShape<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
