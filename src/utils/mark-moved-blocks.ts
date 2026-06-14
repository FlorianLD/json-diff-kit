import type { DiffResult } from '../differ';
import {
  DEFAULT_ALTERNATE_KEYS,
  enclosingContainer,
  groupContentKey,
  isAddRow,
  isRemoveRow,
  splitIntoGroups,
  type AlternateDiffBlocksOptions,
} from './diff-block-util';

interface ElementGroup {
  /** Id of the container instance this element belongs to (opener line index). */
  container: number;
  /** Content signature, used to tell whether two elements are identical. */
  key: string;
  /** Row range `[start, end)` of the element. */
  start: number;
  end: number;
}

/**
 * Collect every removed (or added) element group that sits directly inside an
 * allowed container, tagged with its container instance and content signature.
 *
 * The container/opener lines always live on the left array (unchanged lines have
 * text on both sides), so the enclosing container is resolved against `left`.
 * `content` is the side carrying this group's text — `left` for removes, `right`
 * for adds.
 */
const collectGroups = (
  left: DiffResult[],
  right: DiffResult[],
  content: DiffResult[],
  isRow: (l: DiffResult, r: DiffResult) => boolean,
  keys: Set<string>,
  normalizeText?: (text: string) => string,
): ElementGroup[] => {
  const groups: ElementGroup[] = [];
  const n = left.length;
  let i = 0;
  while (i < n) {
    if (!isRow(left[i], right[i])) {
      i++;
      continue;
    }
    let end = i;
    while (end < n && isRow(left[end], right[end])) {
      end++;
    }
    for (const [s, e] of splitIntoGroups(content, i, end)) {
      const container = enclosingContainer(left, s, content[s].level);
      if (container && keys.has(container.key)) {
        groups.push({ container: container.index, key: groupContentKey(content, s, e, normalizeText), start: s, end: e });
      }
    }
    i = end;
  }
  return groups;
};

/**
 * Marks "moved" elements inside the allowed containers (default `actions_after`
 * and `actions_after_creation`). An element counts as moved when an identical
 * value appears both as a removed element and an added element of the *same*
 * container instance — i.e. it was relocated, not changed (which the differ
 * otherwise reports as a separate remove and add, possibly far apart and in
 * either order).
 *
 * Every line of both the removed copy and the added copy gets `moved: true` set,
 * so the viewer can highlight them differently (e.g. purple) instead of the
 * usual remove/add colours. Both copies are kept in place; nothing is collapsed.
 *
 * The diff is not reordered, so this composes with `alternateDiffBlocks`: mark
 * first, then alternate — the `moved` flag rides along on the row objects.
 *
 * The input is not mutated; only the lines that become `moved` are shallow
 * cloned, so it is safe to call repeatedly (e.g. inside a React `useMemo`).
 */
const markMovedBlocks = (
  diff: readonly [DiffResult[], DiffResult[]],
  options: AlternateDiffBlocksOptions = {},
): [DiffResult[], DiffResult[]] => {
  const keys = new Set(options.keys ?? DEFAULT_ALTERNATE_KEYS);
  const { normalizeText } = options;
  const [left, right] = diff;

  // The container/opener structure lives on the left array (unchanged lines have
  // text on both sides). Removes carry their text on the left, adds on the right.
  const removes = collectGroups(left, right, left, isRemoveRow, keys, normalizeText);
  const adds = collectGroups(left, right, right, isAddRow, keys, normalizeText);

  // Index added groups by `container + content`. Duplicate identical elements
  // share a bucket and are picked off by positional proximity below.
  const addsByKey = new Map<string, ElementGroup[]>();
  for (const group of adds) {
    const k = `${group.container}\0${group.key}`;
    const bucket = addsByKey.get(k);
    if (bucket) {
      bucket.push(group);
    } else {
      addsByKey.set(k, [group]);
    }
  }

  const newLeft = left.slice();
  const newRight = right.slice();
  let changed = false;

  for (const rem of removes) {
    const bucket = addsByKey.get(`${rem.container}\0${rem.key}`);
    if (!bucket || !bucket.length) {
      continue;
    }
    // Content-hash tiebreaker: of all candidate adds with the same content key,
    // pick the one whose start line is closest to this remove's start line.
    // This produces stable, intuitive pairings when multiple identical blocks
    // are present (FIFO would arbitrarily pair the first-seen pair regardless
    // of distance).
    let bestIdx = 0;
    let bestDistance = Math.abs(bucket[0].start - rem.start);
    for (let i = 1; i < bucket.length; i++) {
      const d = Math.abs(bucket[i].start - rem.start);
      if (d < bestDistance) {
        bestDistance = d;
        bestIdx = i;
      }
    }
    const [add] = bucket.splice(bestIdx, 1);
    for (let p = rem.start; p < rem.end; p++) {
      newLeft[p] = { ...newLeft[p], moved: true };
    }
    for (let p = add.start; p < add.end; p++) {
      newRight[p] = { ...newRight[p], moved: true };
    }
    changed = true;
  }

  return changed ? [newLeft, newRight] : [left, right];
};

export default markMovedBlocks;
