/**
 * 新規グループ/タブを置くウィンドウを決定的に選ぶ純関数。
 *
 * `candidateWindowIds` は「他の管理グループが載っているウィンドウID」を
 * グループごとに1要素、`groups` の挿入順で並べたもの。同一ウィンドウIDが
 * 複数回現れる = そのウィンドウに管理グループが複数ある、を意味する。
 *
 * 優先規則（決定的）:
 *  1. 直近フォーカスした通常ウィンドウに管理グループがあれば、それを優先
 *  2. 無ければ管理グループ数が最も多いウィンドウ（タブ数ではなくグループ数）
 *  3. それも同数なら候補の挿入順で最初のウィンドウ（従来動作）
 *
 * 候補が空（他に管理グループが無い）なら直近フォーカスウィンドウ
 * （`undefined` 可）へフォールバックする。
 */
export function pickWindowId(
  candidateWindowIds: number[],
  lastFocusedWindowId: number | undefined,
): number | undefined {
  if (candidateWindowIds.length === 0) return lastFocusedWindowId;

  const groupCount = new Map<number, number>();
  for (const id of candidateWindowIds) {
    groupCount.set(id, (groupCount.get(id) ?? 0) + 1);
  }

  // 1. 直近フォーカスウィンドウに管理グループがあれば最優先
  if (lastFocusedWindowId !== undefined && groupCount.has(lastFocusedWindowId)) {
    return lastFocusedWindowId;
  }

  // 2. 管理グループ数が最多のウィンドウ。3. 同数なら挿入順で最初
  //    （strict > 比較なので、最多カウントを最初に満たしたウィンドウが勝つ）
  let best = candidateWindowIds[0]!;
  let bestCount = groupCount.get(best)!;
  for (const id of candidateWindowIds) {
    const count = groupCount.get(id)!;
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}
