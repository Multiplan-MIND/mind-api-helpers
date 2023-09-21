export function isNullOrUndefined<T>(obj: T | null | undefined): boolean {
  return typeof obj === 'undefined' || obj === null;
}
