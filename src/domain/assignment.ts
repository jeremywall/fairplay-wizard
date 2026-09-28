/**
 * Minimum-cost assignment for a square cost matrix (Hungarian algorithm,
 * O(n³)). Returns `result[row] = column`.
 */
export function minCostAssignment(cost: number[][]): number[] {
  const n = cost.length;
  // 1-based potentials and matching, as in the classic formulation.
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const matchedRow = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);

  for (let row = 1; row <= n; row++) {
    matchedRow[0] = row;
    let col0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = matchedRow[col0];
      let delta = Infinity;
      let col1 = 0;
      for (let col = 1; col <= n; col++) {
        if (used[col]) continue;
        const reduced = cost[row0 - 1][col - 1] - u[row0] - v[col];
        if (reduced < minv[col]) {
          minv[col] = reduced;
          way[col] = col0;
        }
        if (minv[col] < delta) {
          delta = minv[col];
          col1 = col;
        }
      }
      for (let col = 0; col <= n; col++) {
        if (used[col]) {
          u[matchedRow[col]] += delta;
          v[col] -= delta;
        } else {
          minv[col] -= delta;
        }
      }
      col0 = col1;
    } while (matchedRow[col0] !== 0);
    do {
      const col1 = way[col0];
      matchedRow[col0] = matchedRow[col1];
      col0 = col1;
    } while (col0 !== 0);
  }

  const result = new Array<number>(n);
  for (let col = 1; col <= n; col++) result[matchedRow[col] - 1] = col - 1;
  return result;
}
