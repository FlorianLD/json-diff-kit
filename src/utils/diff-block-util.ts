import type { DiffResult } from '../differ';

/** Container keys whose remove/add blocks are processed by default. */
export const DEFAULT_ALTERNATE_KEYS = ['actions_after', 'actions_after_creation'];

export interface AlternateDiffBlocksOptions {
  /**
   * Only process remove/add blocks that are direct elements of a container
   * (array or object) whose key is in this list. Defaults to
   * `['actions_after', 'actions_after_creation']`.
   */
  keys?: string[];
}

/**
 * The net change of the bracket depth of a single line, ignoring any brackets
 * that appear inside string literals (so `"a{b"` does not count).
 */
export const netBracketDepth = (text: string): number => {
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
export const splitIntoGroups = (
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

export const isRemoveRow = (left: DiffResult, right: DiffResult): boolean =>
  left.type === 'remove' && right.type === 'equal' && !right.text;

export const isAddRow = (left: DiffResult, right: DiffResult): boolean =>
  right.type === 'add' && left.type === 'equal' && !left.text;

/**
 * Matches a container-opening line such as `"actions_after": [` or
 * `"actions_after": {` and captures the (unescaped) key name. Both array and
 * object containers are supported, since `actions_after` may be a list of
 * actions or an object keyed by action name.
 */
const CONTAINER_OPEN_RE = /^"((?:[^"\\]|\\.)*)"\s*:\s*[[{]$/;

/**
 * Returns the container that directly holds the element block starting at
 * `blockStart`, identified by the opening line's `index` (a stable id for the
 * specific container instance) and its `key`. The container is opened by the
 * nearest preceding line one level shallower than the block. Returns `null` if
 * that line is not a container opener.
 */
export const enclosingContainer = (
  lines: DiffResult[],
  blockStart: number,
  elementLevel: number,
): { index: number; key: string } | null => {
  for (let j = blockStart - 1; j >= 0; j--) {
    if (lines[j].level === elementLevel - 1) {
      const match = CONTAINER_OPEN_RE.exec(lines[j].text);
      return match ? { index: j, key: match[1] } : null;
    }
  }
  return null;
};

/**
 * Returns the key of the array/object that directly contains the element block
 * starting at `blockStart`, or `null` if it cannot be determined.
 */
export const enclosingContainerKey = (
  lines: DiffResult[],
  blockStart: number,
  elementLevel: number,
): string | null => enclosingContainer(lines, blockStart, elementLevel)?.key ?? null;

/**
 * A stable signature of an element group, used to tell whether two groups hold
 * the same value. Level + text captures both structure and content; the differ
 * stores the trailing comma separately, so position never affects the key.
 */
export const groupContentKey = (
  lines: DiffResult[],
  start: number,
  end: number,
): string => {
  let key = '';
  for (let i = start; i < end; i++) {
    key += `${lines[i].level}:${lines[i].text}\n`;
  }
  return key;
};
