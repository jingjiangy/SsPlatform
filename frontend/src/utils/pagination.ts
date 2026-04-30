export const DEFAULT_PAGE_SIZE = 20;

export function skipForPage(page: number, pageSize: number): number {
  const p = Math.max(1, Math.floor(page) || 1);
  const ps = Math.max(1, pageSize);
  return (p - 1) * ps;
}

export function reverseSerialIndex(total: number, skip: number, rowIndex: number): number {
  if (total < 1) return 0;
  return Math.max(0, total - skip - rowIndex);
}
