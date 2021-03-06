/**
 * Returns whether a given object is a function
 * @param obj
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function isFunctionType(obj: unknown): obj is Function {
  return typeof obj === 'function'
}
