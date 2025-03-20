import {getShiftIntervals} from './utils';

export const INITIAL_INDEX = 0;
export const ITEM_WIDTH = 17;
export const VISIBLE_ITEMS = 29;
export const DRAW_ITEMS = Math.floor(VISIBLE_ITEMS / 2);
export const SHIFT_INTERVALS = getShiftIntervals(DRAW_ITEMS - 1);
export const WHEEL_WIDTH = 350;
export const WHEEL_PADDING = WHEEL_WIDTH / 2 - ITEM_WIDTH / 2;
export const IDXS = [...Array(VISIBLE_ITEMS).keys()].map(
  index => index - DRAW_ITEMS,
);
