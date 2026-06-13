import Differ from '../differ';
import alternateDiffBlocks from './alternate-diff-blocks';

const differ = new Differ({ arrayDiffMethod: 'lcs', recursiveEqual: true });

// Render an aligned diff as compact rows, easy to assert against.
const render = (diff: readonly [any[], any[]]) =>
  diff[0].map((l, i) => {
    const r = diff[1][i];
    const cell = (x: any) => `${x.type[0]} ${x.text}`.trim();
    return `${cell(l)} | ${cell(r)}`;
  });

describe('alternateDiffBlocks', () => {
  it('interleaves a remove block followed by an add block (equal counts)', () => {
    const before = { actions_after: [{ type: 'remA' }, { type: 'remB' }] };
    const after = { actions_after: [{ type: 'addC' }, { type: 'addD' }] };
    const result = alternateDiffBlocks(differ.diff(before, after));
    expect(render(result)).toEqual([
      'e { | e {',
      'e "actions_after": [ | e "actions_after": [',
      'r { | e',
      'r "type": "remA" | e',
      'r } | e',
      'e | a {',
      'e | a "type": "addC"',
      'e | a }',
      'r { | e',
      'r "type": "remB" | e',
      'r } | e',
      'e | a {',
      'e | a "type": "addD"',
      'e | a }',
      'e ] | e ]',
      'e } | e }',
    ]);
  });

  it('keeps line numbers and commas valid after reordering', () => {
    const before = { actions_after: [{ type: 'remA' }, { type: 'remB' }] };
    const after = { actions_after: [{ type: 'addC' }, { type: 'addD' }] };
    const [left, right] = alternateDiffBlocks(differ.diff(before, after));

    const leftLineNumbers = left.filter(l => l.text).map(l => l.lineNumber);
    const rightLineNumbers = right.filter(r => r.text).map(r => r.lineNumber);
    // Line numbers must stay strictly increasing on each side.
    expect(leftLineNumbers).toEqual([...leftLineNumbers].sort((a, b) => a! - b!));
    expect(rightLineNumbers).toEqual([...rightLineNumbers].sort((a, b) => a! - b!));

    // The closing brace of the first (non-last) element keeps its comma; the
    // last element's closing brace does not.
    const removedBraces = left.filter(l => l.type === 'remove' && l.text === '}');
    expect(removedBraces.map(l => !!l.comma)).toEqual([true, false]);
    const addedBraces = right.filter(r => r.type === 'add' && r.text === '}');
    expect(addedBraces.map(r => !!r.comma)).toEqual([true, false]);
  });

  it('appends surplus removed values when there are more removes than adds', () => {
    const before = { actions_after: [{ type: 'remA' }, { type: 'remB' }, { type: 'remC' }] };
    const after = { actions_after: [{ type: 'addX' }] };
    const [left, right] = alternateDiffBlocks(differ.diff(before, after));
    // Only look at the "type" rows to get a readable element order.
    const order = left
      .map((l, i) => {
        if (l.type === 'remove' && l.text.startsWith('"type"')) return `-${l.text}`;
        if (right[i].type === 'add' && right[i].text.startsWith('"type"')) return `+${right[i].text}`;
        return null;
      })
      .filter(Boolean);
    // remA pairs with addX, then the surplus remB and remC follow in order.
    expect(order).toEqual([
      '-"type": "remA"',
      '+"type": "addX"',
      '-"type": "remB"',
      '-"type": "remC"',
    ]);
  });

  it('leaves diffs without a remove-then-add block untouched', () => {
    const before = { a: 1, b: 2 };
    const after = { a: 1, b: 3 };
    const original = differ.diff(before, after);
    const result = alternateDiffBlocks(original);
    expect(render(result)).toEqual(render(original));
  });

  it('interleaves an object-keyed actions_after (not just arrays)', () => {
    const before = { actions_after: {
      set_milestone: { type: 'set_milestone' },
      update_order_state: { type: 'update_order_state' },
    } };
    const after = { actions_after: {
      remove_origin: { type: 'remove_origin' },
      send_alert: { type: 'send_alert' },
    } };
    const [left, right] = alternateDiffBlocks(differ.diff(before, after));
    const order = left
      .map((l, i) => {
        if (l.type === 'remove' && l.text.startsWith('"type"')) return `-${l.text}`;
        if (right[i].type === 'add' && right[i].text.startsWith('"type"')) return `+${right[i].text}`;
        return null;
      })
      .filter(Boolean);
    expect(order).toEqual([
      '-"type": "set_milestone"',
      '+"type": "remove_origin"',
      '-"type": "update_order_state"',
      '+"type": "send_alert"',
    ]);
  });

  it('interleaves actions_after_creation by default too', () => {
    const before = { actions_after_creation: [{ type: 'remA' }, { type: 'remB' }] };
    const after = { actions_after_creation: [{ type: 'addC' }, { type: 'addD' }] };
    const [left, right] = alternateDiffBlocks(differ.diff(before, after));
    const order = left
      .map((l, i) => {
        if (l.type === 'remove' && l.text.startsWith('"type"')) return `-${l.text}`;
        if (right[i].type === 'add' && right[i].text.startsWith('"type"')) return `+${right[i].text}`;
        return null;
      })
      .filter(Boolean);
    expect(order).toEqual([
      '-"type": "remA"',
      '+"type": "addC"',
      '-"type": "remB"',
      '+"type": "addD"',
    ]);
  });

  it('does not reorder remove/add blocks inside other arrays', () => {
    const before = { other: [{ type: 'remA' }, { type: 'remB' }] };
    const after = { other: [{ type: 'addC' }, { type: 'addD' }] };
    const original = differ.diff(before, after);
    const result = alternateDiffBlocks(original);
    // `other` is not in the allowed key list, so the result is unchanged.
    expect(render(result)).toEqual(render(original));
  });

  it('reorders other arrays when their key is allowed via options', () => {
    const before = { other: [{ type: 'remA' }, { type: 'remB' }] };
    const after = { other: [{ type: 'addC' }, { type: 'addD' }] };
    const result = alternateDiffBlocks(differ.diff(before, after), { keys: ['other'] });
    const order = result[0]
      .map((l, i) => {
        if (l.type === 'remove' && l.text.startsWith('"type"')) return `-${l.text}`;
        if (result[1][i].type === 'add' && result[1][i].text.startsWith('"type"')) return `+${result[1][i].text}`;
        return null;
      })
      .filter(Boolean);
    expect(order).toEqual([
      '-"type": "remA"',
      '+"type": "addC"',
      '-"type": "remB"',
      '+"type": "addD"',
    ]);
  });
});
