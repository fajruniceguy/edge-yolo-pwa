import { describe, expect, it } from 'vitest';
import { boxesToPath } from '../src/app/overlay';

describe('boxesToPath', () => {
  it('draws one closed rectangle per detection, rounded to 0.1 px', () => {
    const d = boxesToPath([
      { x1: 10.04, y1: 20.06, x2: 30.5, y2: 40.25, score: 0.9 },
      { x1: 0, y1: 0, x2: 5, y2: 5, score: 0.5 },
    ]);
    expect(d).toBe('M10 20.1H30.5V40.3H10Z' + 'M0 0H5V5H0Z');
  });

  it('is empty for no detections', () => {
    expect(boxesToPath([])).toBe('');
  });
});
