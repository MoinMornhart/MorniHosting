import { useId, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

const WIDTH = 120;
const HEIGHT = 30;
const PADDING = 2;
const INNER_HEIGHT = HEIGHT - PADDING - PADDING;

/** A tiny line chart of the last minutes; the area tint helps read it at a glance. */
export function Sparkline({
  values,
  max,
  className,
}: {
  values: readonly number[];
  max: number;
  className?: string;
}): ReactElement {
  const id = useId();
  const points = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const scaleMax = Math.max(max, ...points, 1);
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * WIDTH;
      const y = HEIGHT - PADDING - (v / scaleMax) * INNER_HEIGHT;
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('');
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn('block h-7 w-full', className)}
    >
      <defs>
        <clipPath id={id}>
          <rect width={WIDTH} height={HEIGHT} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <path d={`${path}L${WIDTH} ${HEIGHT}L0 ${HEIGHT}Z`} className="fill-primary/15" />
        <path
          d={path}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
