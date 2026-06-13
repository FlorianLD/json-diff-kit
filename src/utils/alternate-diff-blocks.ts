import type { DiffResult } from '../differ';

/**
 * The net change of the bracket depth of a single line, ignoring any brackets
 * that appear inside string literals (so `"a{b"` does not count).
 */
const netBracketDepth = (text: string): number => {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
    }
  }
  return depth;
};

/**
 * Split a `[start, end)` range of `lines` into element groups. Each group is a
 * single value of the surrounding array/object: a primitive is one line, while
 * an object/array spans from its opening bracket to the matching closing one.
 */
const splitIntoGroups = (
  lines: DiffResult[],
  start: number,
  end: number,
): Array<[number, number]> => {
  const groups: Array<[number, number]> = [];
  let depth = 0;
  let groupStart = start;
  for (let i = start; i < end; i++) {
    depth += netBracketDepth(lines[i].text);
    if (depth <= 0) {
      groups.push([groupStart, i + 1]);
      groupStart = i + 1;
      depth = 0;
    }
  }
  if (groupStart < end) {
    groups.push([groupStart, end]);
  }
  return groups;
};

const isRemoveRow = (left: DiffResult, right: DiffResult): boolean =>
  left.type === 'remove' && right.type === 'equal' && !right.text;

const isAddRow = (left: DiffResult, right: DiffResult): boolean =>
  right.type === 'add' && left.type === 'equal' && !left.text;

/**
 * Matches a container-opening line such as `"actions_after": [` or
 * `"actions_after": {` and captures the (unescaped) key name. Both array and
 * object containers are supported, since `actions_after` may be a list of
 * actions or an object keyed by action name.
 */
const CONTAINER_OPEN_RE = /^"((?:[^"\\]|\\.)*)"\s*:\s*[[{]$/;

/**
 * Returns the key of the array/object that directly contains the element block
 * starting at `blockStart`, or `null` if it cannot be determined. The container
 * is opened by the nearest preceding line one level shallower than the block.
 */
const enclosingContainerKey = (
  lines: DiffResult[],
  blockStart: number,
  elementLevel: number,
): string | null => {
  for (let j = blockStart - 1; j >= 0; j--) {
    if (lines[j].level === elementLevel - 1) {
      const match = CONTAINER_OPEN_RE.exec(lines[j].text);
      return match ? match[1] : null;
    }
  }
  return null;
};

/** Container keys whose remove/add blocks are interleaved by default. */
export const DEFAULT_ALTERNATE_KEYS = ['actions_after', 'actions_after_creation'];

export interface AlternateDiffBlocksOptions {
  /**
   * Only interleave remove/add blocks that are direct elements of a container
   * (array or object) whose key is in this list. Defaults to
   * `['actions_after', 'actions_after_creation']`.
   */
  keys?: string[];
}

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
