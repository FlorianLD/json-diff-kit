import type { DiffResult } from '../differ';
import {
  DEFAULT_ALTERNATE_KEYS,
  enclosingContainerKey,
  isAddRow,
  isRemoveRow,
  splitIntoGroups,
  type AlternateDiffBlocksOptions,
} from './diff-block-util';

export { DEFAULT_ALTERNATE_KEYS };
export type { AlternateDiffBlocksOptions };

/**
 * Reorders an aligned diff result (the tuple returned by `Differ.diff`) so that
 * a block of consecutive removed values immediately followed by a block of
 * consecutive added values is interleaved into alternating remove/add pairs:
 *
 * ```diff
 * - a        - a
 * - b   ->   + c
 * + c        - b
 * + d        + d
 * ```
 *
 * This makes positional before/after comparison easier (1st removed value next
 * to the 1st added value, and so on). When the two blocks have a different
 * number of values, the surplus values are appended after the interleaved pairs
 * in their original order.
 *
 * Only blocks that are direct elements of a container whose key is listed in
 * `options.keys` (default `['actions_after', 'actions_after_creation']`) are
 * reordered; everything else is left untouched.
 *
 * The reordering only swaps whole row pairs, never splitting the left/right
 * alignment, so the `lineNumber` and `comma` fields computed by the differ stay
 * correct without recomputation (the relative order of non-empty lines on each
 * side is preserved).
 */
const alternateDiffBlocks = (
  diff: readonly [DiffResult[], DiffResult[]],
  options: AlternateDiffBlocksOptions = {},
): [DiffResult[], DiffResult[]] => {
  const keys = new Set(options.keys ?? DEFAULT_ALTERNATE_KEYS);
  const [left, right] = diff;
  const newLeft: DiffResult[] = [];
  const newRight: DiffResult[] = [];
  const n = left.length;
  let i = 0;

  const pushRange = (start: number, end: number) => {
    for (let p = start; p < end; p++) {
      newLeft.push(left[p]);
      newRight.push(right[p]);
    }
  };

  while (i < n) {
    if (isRemoveRow(left[i], right[i])) {
      // Collect the consecutive block of removed rows.
      let removeEnd = i;
      while (removeEnd < n && isRemoveRow(left[removeEnd], right[removeEnd])) {
        removeEnd++;
      }
      // Collect the add block that immediately follows it, if any.
      let addEnd = removeEnd;
      while (addEnd < n && isAddRow(left[addEnd], right[addEnd])) {
        addEnd++;
      }
      const hasAddBlock = addEnd > removeEnd;
      // Only interleave parallel array/object elements, i.e. blocks that start
      // at the same indentation level.
      const sameLevel = hasAddBlock && left[i].level === right[removeEnd].level;
      // ...and only inside an allowed container (e.g. `actions_after`).
      const inAllowedContainer =
        sameLevel && keys.has(enclosingContainerKey(left, i, left[i].level) as string);
      if (hasAddBlock && sameLevel && inAllowedContainer) {
        const removeGroups = splitIntoGroups(left, i, removeEnd);
        const addGroups = splitIntoGroups(right, removeEnd, addEnd);
        const groupCount = Math.max(removeGroups.length, addGroups.length);
        for (let g = 0; g < groupCount; g++) {
          if (g < removeGroups.length) {
            pushRange(removeGroups[g][0], removeGroups[g][1]);
          }
          if (g < addGroups.length) {
            pushRange(addGroups[g][0], addGroups[g][1]);
          }
        }
        i = addEnd;
        continue;
      }
    }
    newLeft.push(left[i]);
    newRight.push(right[i]);
    i++;
  }

  return [newLeft, newRight];
};

export default alternateDiffBlocks;
