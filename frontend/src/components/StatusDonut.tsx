interface Props {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

/**
 * Inline SVG donut chart — no chart library, no extra dep.
 * Each slice is a stroke-dasharray segment on the same circle.
 */
export function StatusDonut({ data, size = 180 }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--panel-2-solid)"
          strokeWidth={14}
        />
        {total > 0 &&
          data.map((d, i) => {
            const length = (d.value / total) * circumference;
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={14}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{
                  transition: "stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease",
                }}
              />
            );
            offset += length;
            return seg;
          })}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="donut-total"
        >
          <tspan x="50%" dy="-6" fontSize={26} fontWeight={700}>{total}</tspan>
          <tspan x="50%" dy="20" fontSize={11} fill="var(--muted)" letterSpacing="0.08em">
            INVOICES
          </tspan>
        </text>
      </svg>
    </div>
  );
}
