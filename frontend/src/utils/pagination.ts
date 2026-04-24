/** 默认与后端单页条数习惯一致 */
export const DEFAULT_PAGE_SIZE = 20;

export function skipForPage(page: number, pageSize: number): number {
  const p = Math.max(1, Math.floor(page) || 1);
  const ps = Math.max(1, pageSize);
  return (p - 1) * ps;
}

/**
 * 数据按 _id 倒序分页时，全表第 1 条在全局编号为 total。
 * 当前页 skip 起、行下标 rowIndex（0-based）的倒序序号为：total - skip - rowIndex。
 */
export function reverseSerialIndex(total: number, skip: number, rowIndex: number): number {
  if (total < 1) return 0;
  return Math.max(0, total - skip - rowIndex);
}
