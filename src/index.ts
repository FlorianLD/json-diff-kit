import Differ from './differ';
import Viewer from './viewer';
import alternateDiffBlocks from './utils/alternate-diff-blocks';
import markMovedBlocks from './utils/mark-moved-blocks';

export type {
  InlineDiffOptions,
  InlineDiffResult,
} from './utils/get-inline-diff';

export type {
  ArrayDiffFunc,
  DifferOptions,
  DiffResult,
} from './differ';

export type {
  ViewerProps,
} from './viewer';

export type {
  AlternateDiffBlocksOptions,
} from './utils/alternate-diff-blocks';

export { Differ, Viewer, alternateDiffBlocks, markMovedBlocks };
