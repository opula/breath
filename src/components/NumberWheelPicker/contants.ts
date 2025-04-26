// Pre-calculate all constants to avoid recalculation during runtime

// Basic configuration values
export const INITIAL_INDEX = 0;
export const ITEM_WIDTH = 17;
export const VISIBLE_ITEMS = 29;
export const DRAW_ITEMS = 14; // Pre-calculated from Math.floor(VISIBLE_ITEMS / 2)
export const WHEEL_WIDTH = 350;
export const WHEEL_PADDING = 166.5; // Pre-calculated from WHEEL_WIDTH / 2 - ITEM_WIDTH / 2

// Pre-calculated shift intervals for performance optimization
export const SHIFT_INTERVALS = [
  -27, -25, -23, -21, -19, -17, -15, -13, -11, -9, -7, -5, -3, -1, 0,
  1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27
];

// Pre-calculated indices array for interpolation
export const IDXS = [
  -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
];
