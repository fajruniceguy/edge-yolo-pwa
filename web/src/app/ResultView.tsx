import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { Detection } from '../core/types';
import { boxesToPath } from './overlay';
import { t } from './strings';

/** The photo with detection boxes (boxes only, no labels) drawn in original-image coordinates. */
export function ResultView({ url, width, height, dets }: { url: string; width: number; height: number; dets: Detection[] }) {
  const path = useMemo(() => boxesToPath(dets), [dets]);
  // --ar lets CSS size the box to the photo's aspect before the image decodes, so the overlay always lines up.
  const style = { '--ar': width / height } as CSSProperties;
  return (
    <div className="stage" style={style} data-testid="stage">
      <img src={url} alt={t.photoAlt} draggable={false} />
      <svg className="overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" data-testid="overlay">
        <path className="box-halo" d={path} />
        <path className="box" d={path} />
      </svg>
    </div>
  );
}
