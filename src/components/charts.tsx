/**
 * 极简图表原语：不引第三方图表库，纯 SVG + Tailwind。
 * 组件保持“无状态、只吃 props”，方便服务端渲染。
 */

import type { ReactNode } from 'react'

export const fmtInt = (value: number): string => Math.round(value).toLocaleString('en-US')

export const fmtCompact = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return fmtInt(value)
}

export const fmtMoney = (value: number): string => `$${fmtInt(value)}`

export const fmtMoneyCompact = (value: number): string => `$${fmtCompact(value)}`

export const fmtDate = (value: string): string => {
  if (!value) return '—'
  // 不依赖运行时的 locale，避免 SSR 与浏览器输出不一致。
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return `${match[1]}/${match[2]}/${match[3]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`
}

export const fmtPercent = (value: number, digits = 1): string => `${value.toFixed(digits)}%`

/* ------------------------------------------------------------------ */
/* 卡片                                                                */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`panel group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#11141c]/80 p-5 backdrop-blur-sm transition-colors duration-300 hover:border-white/[0.12] ${className}`}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-medium tracking-[0.14em] text-slate-400 uppercase">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* 直方图（薪资分布）                                                   */
/* ------------------------------------------------------------------ */

export function Histogram({
  data,
  height = 132,
}: {
  data: Array<{ label: string; value: number }>
  height?: number
}) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((item) => {
          const ratio = item.value / max
          return (
            <div key={item.label} className="group/bar relative flex-1">
              <div
                className="w-full rounded-t-[3px] bg-gradient-to-t from-indigo-500/25 to-sky-400/80 transition-all duration-500 group-hover/bar:from-indigo-400/50 group-hover/bar:to-cyan-300"
                style={{ height: `${Math.max(ratio * height, 2)}px` }}
                title={`${item.label} · ${fmtInt(item.value)}`}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-slate-600">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 折线 / 面积图                                                        */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  height = 56,
  stroke = '#38bdf8',
  fill = 'rgba(56,189,248,0.16)',
}: {
  values: number[]
  height?: number
  stroke?: string
  fill?: string
}) {
  if (values.length < 2) return <div style={{ height }} />
  const width = 100
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / span) * (height - 6) - 3
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const line = `M ${points.join(' L ')}`
  const area = `${line} L ${width},${height} L 0,${height} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden>
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function AreaChart({
  points,
  height = 168,
  formatValue = fmtMoneyCompact,
}: {
  points: Array<{ label: string; value: number }>
  height?: number
  formatValue?: (value: number) => string
}) {
  if (points.length < 2) return <div style={{ height }} />
  const width = 640
  const padTop = 12
  const padBottom = 22
  const innerHeight = height - padTop - padBottom
  const min = Math.min(...points.map((p) => p.value))
  const max = Math.max(...points.map((p) => p.value))
  const span = max - min || 1

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width
    const y = padTop + innerHeight - ((point.value - min) / span) * innerHeight
    return { x, y, ...point }
  })

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L ${width},${padTop + innerHeight} L 0,${padTop + innerHeight} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      <defs>
        <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((tick) => (
        <line
          key={tick}
          x1={0}
          x2={width}
          y1={padTop + innerHeight * tick}
          y2={padTop + innerHeight * tick}
          stroke="rgba(148,163,184,0.14)"
          strokeDasharray="3 5"
        />
      ))}
      <path d={area} fill="url(#area-fill)" />
      <path d={line} fill="none" stroke="#7dd3fc" strokeWidth={1.8} strokeLinejoin="round" />
      {coords.map((c) => (
        <circle key={c.label} cx={c.x} cy={c.y} r={2.2} fill="#0b0e14" stroke="#7dd3fc" strokeWidth={1.4} />
      ))}
      {coords.map((c, index) =>
        index % Math.ceil(coords.length / 6) === 0 ? (
          <text key={`t-${c.label}`} x={c.x} y={height - 6} textAnchor="middle" className="fill-slate-600" fontSize={9}>
            {c.label}
          </text>
        ) : null,
      )}
      <text x={4} y={padTop - 1} className="fill-slate-600" fontSize={9}>
        {formatValue(max)}
      </text>
      <text x={4} y={padTop + innerHeight - 2} className="fill-slate-600" fontSize={9}>
        {formatValue(min)}
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* 环形图                                                              */
/* ------------------------------------------------------------------ */

export function Donut({
  slices,
  size = 148,
  centerLabel,
  centerValue,
}: {
  slices: Array<{ label: string; value: number; color: string }>
  size?: number
  centerLabel?: string
  centerValue?: string
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1
  const radius = size / 2 - 12
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={12} />
          {slices.map((slice) => {
            const length = (slice.value / total) * circumference
            const circle = (
              <circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={12}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += length
            return circle
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums text-slate-100">{centerValue}</span>
          <span className="text-[10px] tracking-wide text-slate-500 uppercase">{centerLabel}</span>
        </div>
      </div>
      <ul className="space-y-2 text-xs">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: slice.color }} />
            <span className="text-slate-400">{slice.label}</span>
            <span className="ml-auto tabular-nums text-slate-200">{fmtInt(slice.value)}</span>
            <span className="w-10 text-right tabular-nums text-slate-500">
              {fmtPercent((slice.value / total) * 100, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
