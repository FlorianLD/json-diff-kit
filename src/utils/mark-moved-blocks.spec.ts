import Differ from '../differ';
import alternateDiffBlocks from './alternate-diff-blocks';
import markMovedBlocks from './mark-moved-blocks';

const differ = new Differ({ arrayDiffMethod: 'lcs', recursiveEqual: true });

// Collect the `type` value of every line flagged as moved, tagged with its side.
const movedTypes = (diff: readonly [any[], any[]]) => {
  const [left, right] = diff;
  const out: string[] = [];
  left.forEach((l, i) => {
    const r = right[i];
    if (l.moved && l.text.startsWith('"type"')) out.push(`-${l.text}`);
    if (r.moved && r.text.startsWith('"type"')) out.push(`+${r.text}`);
  });
  return out;
};

describe('markMovedBlocks', () => {
  it('flags an element that moved position (identical content, both copies)', () => {
    // Swapping [a, b] -> [b, a] keeps `a` in the LCS, so `b` shows up as both an
    // add (top) and a remove (bottom) — that is the moved element.
    const before = { actions_after: [{ type: 'a' }, { type: 'b' }] };
    const after = { actions_after: [{ type: 'b' }, { type: 'a' }] };
    expect(movedTypes(markMovedBlocks(differ.diff(before, after)))).toEqual([
      '+"type": "b"',
      '-"type": "b"',
    ]);
  });

  it('does not flag an element whose content changed', () => {
    // `a` appears as remove + add but its content differs (n: 1 -> 2), so it is a
    // modification, not a move.
    const before = { actions_after: [{ type: 'a', n: 1 }] };
    const after = { actions_after: [{ type: 'a', n: 2 }] };
    expect(movedTypes(markMovedBlocks(differ.diff(before, after)))).toEqual([]);
  });

  it('does not cross-match identical elements between different containers', () => {
    const before = {
      t1: { actions_after: [{ type: 'x' }, { type: 'a' }] },
      t2: { actions_after: [{ type: 'y' }] },
    };
    const after = {
      t1: { actions_after: [{ type: 'a' }] },
      t2: { actions_after: [{ type: 'x' }, { type: 'y' }] },
    };
    // `x` is removed from t1 and added to t2 — different containers, not a move.
    expect(movedTypes(markMovedBlocks(differ.diff(before, after)))).toEqual([]);
  });

  it('does not flag moves inside non-allowed containers', () => {
    const before = { other: [{ type: 'a' }, { type: 'b' }] };
    const after = { other: [{ type: 'b' }, { type: 'a' }] };
    expect(movedTypes(markMovedBlocks(differ.diff(before, after)))).toEqual([]);
  });

  it('flags moves inside actions_after_creation too', () => {
    const before = { actions_after_creation: [{ type: 'a' }, { type: 'b' }] };
    const after = { actions_after_creation: [{ type: 'b' }, { type: 'a' }] };
    expect(movedTypes(markMovedBlocks(differ.diff(before, after)))).toEqual([
      '+"type": "b"',
      '-"type": "b"',
    ]);
  });

  it('does not mutate the input diff', () => {
    const before = { actions_after: [{ type: 'a' }, { type: 'b' }] };
    const after = { actions_after: [{ type: 'b' }, { type: 'a' }] };
    const original = differ.diff(before, after);
    markMovedBlocks(original);
    const anyMoved = [...original[0], ...original[1]].some(l => l.moved);
    expect(anyMoved).toBe(false);
  });

  it('keeps the moved flag after alternateDiffBlocks runs', () => {
    const before = { actions_after: [{ type: 'a' }, { type: 'b' }] };
    const after = { actions_after: [{ type: 'b' }, { type: 'a' }] };
    const final = alternateDiffBlocks(markMovedBlocks(differ.diff(before, after)));
    expect(movedTypes(final)).toEqual(['+"type": "b"', '-"type": "b"']);
  });
});
