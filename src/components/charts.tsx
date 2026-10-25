/**
 * 图表原语与格式化工具。
 *
 * 不引图表库：数据量小、形状固定，手写 SVG 更可控，也不给客户端加体积。
 * 所有颜色走 CSS 变量，图表里的 `currentColor` 会自动跟随主题。
 */

import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* 格式化                                                              */
/* ------------------------------------------------------------------ */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const int = new Intl.NumberFormat('en-US')

/** $72,012 */
export const fmtMoney = (value: number): string => usd.format(Math.round(value))

/** $72K / $1.2M */
export const fmtMoneyShort = (value: number): string => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return usd.format(value)
}

/** 300,024 */
export const fmtInt = (value: number): string => int.format(Math.round(value))

/** 300K / 2.8M */
export const fmtCompact = (value: number): string => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${Math.round(value / 1_000)}K`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return fmtInt(value)
}

/** 0.4 → 40.0% */
export const fmtPercent = (value: number, digits = 1): string =>
  `${(value * 100).toFixed(digits)}%`

/** 带符号的百分比：+3.2% / −1.8% */
export const fmtDelta = (value: number, digits = 1): string => {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value * 100).toFixed(digits)}%`
}

/** '2002-08-02' → '2002.08' */
export const fmtYearMonth = (value: string): string => {
  const match = /^(\d{4})-(\d{2})/.exec(value)
  return match ? `${match[1]}.${match[2]}` : value
}

/** '2002-08-02' → '2002/08/02'，不依赖 locale，SSR 与浏览器一致。 */
export const fmtDate = (value: string): string => {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return `${match[1]}/${match[2]}/${match[3]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}`
}

/* ------------------------------------------------------------------ */
/* 版式原语                                                            */
/* ------------------------------------------------------------------ */

/** 一节：标题 + 可选的导语与右侧注释。 */
export function Section({
  eyebrow,
  title,
  lede,
  aside,
  children,
  className = '',
}: {
  eyebrow?: string
  title: string
  lede?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`border-t border-rule pt-10 ${className}`}>
      <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[62ch]">
          {eyebrow ? (
            <p className="font-mono text-[10.5px] tracking-[0.22em] text-accent uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-2 text-[26px] leading-tight font-semibold tracking-[-0.02em] text-ink sm:text-[30px]">
            {title}
          </h2>
          {lede ? (
            <p className="mt-3 text-[14px] leading-[1.7] text-ink-soft">{lede}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0 text-[11.5px] text-ink-faint">{aside}</div> : null}
      </header>
      {children}
    </section>
  )
}

/** 图例：一行小色块 + 文字。 */
export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* 薪酬分布：直方图 + 中位数/均值标记                                    */
/* ------------------------------------------------------------------ */

export function DistributionChart({
  buckets,
  median,
  mean,
}: {
  buckets: Array<{ from: number; to: number; count: number }>
  median: number
  mean: number
}) {
  if (buckets.length === 0) return null

  const W = 760
  const H = 250
  const padTop = 34
  const padBottom = 38
  const innerH = H - padTop - padBottom
  const max = Math.max(...buckets.map((b) => b.count), 1)
  const slot = W / buckets.length
  const barW = Math.max(slot - 4, 2)

  const markerX = (value: number) => {
    const index = buckets.findIndex((b) => value >= b.from && value < b.to)
    const slotIndex = index === -1 ? buckets.length - 1 : index
    const bucket = buckets[slotIndex]
    const within =
      bucket.to === bucket.from ? 0.5 : (value - bucket.from) / (bucket.to - bucket.from)
    return slotIndex * slot + Math.min(Math.max(within, 0), 1) * slot
  }

  const peak = buckets.reduce((best, b) => (b.count > best.count ? b : best), buckets[0])

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="当前薪资分布直方图"
    >
      <line
        x1={0}
        x2={W}
        y1={padTop + innerH}
        y2={padTop + innerH}
        stroke="currentColor"
        className="text-rule-strong"
        strokeWidth={1}
      />

      {buckets.map((bucket, index) => {
        const h = (bucket.count / max) * innerH
        const x = index * slot + (slot - barW) / 2
        const y = padTop + innerH - h
        const isPeak = bucket === peak
        return (
          <g key={bucket.from}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 1)}
              rx={2}
              className={isPeak ? 'text-accent' : 'text-ink/30'}
              fill="currentColor"
            />
            {isPeak ? (
              <text
                x={x + barW / 2}
                y={y - 9}
                textAnchor="middle"
                className="fill-ink font-mono"
                fontSize={10.5}
              >
                {fmtCompact(bucket.count)}
              </text>
            ) : null}
          </g>
        )
      })}

      {[
        { value: median, label: '中位数', color: 'var(--color-accent)' },
        { value: mean, label: '均值', color: 'var(--color-teal)' },
      ].map((marker) => {
        const x = markerX(marker.value)
        return (
          <g key={marker.label}>
            <line
              x1={x}
              x2={x}
              y1={padTop - 12}
              y2={padTop + innerH}
              stroke={marker.color}
              strokeWidth={1.4}
              strokeDasharray="4 3"
            />
            <text
              x={x}
              y={padTop - 18}
              textAnchor="middle"
              fill={marker.color}
              className="font-mono"
              fontSize={10}
            >
              {marker.label} {fmtMoneyShort(marker.value)}
            </text>
          </g>
        )
      })}

      {buckets.map((bucket, index) =>
        index % 2 === 0 ? (
          <text
            key={`x-${bucket.from}`}
            x={index * slot + slot / 2}
            y={H - 14}
            textAnchor="middle"
            className="fill-ink-faint font-mono"
            fontSize={10}
          >
            {bucket.from >= 120_000 ? '120K+' : `${bucket.from / 1000}K`}
          </text>
        ) : null,
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* 留存：每年招的人里，多少人还在                                        */
/* ------------------------------------------------------------------ */

export function RetentionChart({
  data,
}: {
  data: Array<{ year: number; hired: number; active: number }>
}) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.hired), 1)

  return (
    <div className="space-y-[5px]">
      {data.map((row) => {
        const hiredW = (row.hired / max) * 100
        const retention = row.hired > 0 ? row.active / row.hired : 0
        return (
          <div key={row.year} className="group flex items-center gap-3">
            <span className="w-11 shrink-0 font-mono text-[11.5px] tabular text-ink-faint">
              {row.year}
            </span>
            <div className="relative h-[20px] flex-1">
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] bg-ink/12"
                style={{ width: `${hiredW}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] bg-ink/75 transition-colors group-hover:bg-ink"
                style={{ width: `${(hiredW * row.active) / max}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[11.5px] tabular text-ink-soft">
              {fmtCompact(row.hired)}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-[11.5px] tabular text-ink-faint">
              {fmtPercent(retention, 0)}
            </span>
          </div>
        )
      })}
      <div className="flex items-center gap-3 pt-2">
        <span className="w-11 shrink-0" />
        <span className="flex-1 text-[10px] tracking-[0.14em] text-ink-faint uppercase">
          深色 = 至今在职
        </span>
        <span className="w-14 shrink-0 text-right text-[10px] text-ink-faint">招聘</span>
        <span className="w-10 shrink-0 text-right text-[10px] text-ink-faint">留存</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 折线：薪酬水平随年份                                                 */
/* ------------------------------------------------------------------ */

export function TrendChart({
  points,
  height = 200,
}: {
  points: Array<{ year: number; avgSalary: number }>
  height?: number
}) {
  if (points.length < 2) return null
  const W = 760
  const padTop = 22
  const padBottom = 30
  const innerH = height - padTop - padBottom
  const min = Math.min(...points.map((p) => p.avgSalary))
  const max = Math.max(...points.map((p) => p.avgSalary))
  const span = max - min || 1

  const coords = points.map((point, index) => ({
    x: (index / (points.length - 1)) * W,
    y: padTop + innerH - ((point.avgSalary - min) / span) * innerH,
    ...point,
  }))

  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L ${W},${padTop + innerH} L 0,${padTop + innerH} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="w-full"
      role="img"
      aria-label="历年平均薪资"
    >
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-teal)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-teal)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((tick) => (
        <line
          key={tick}
          x1={0}
          x2={W}
          y1={padTop + innerH * tick}
          y2={padTop + innerH * tick}
          stroke="currentColor"
          className="text-rule"
          strokeDasharray="2 5"
        />
      ))}

      <path d={area} fill="url(#trend-fill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-teal)"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />

      {coords.map((c, index) => {
        const step = Math.ceil(coords.length / 8)
        if (index % step !== 0 && index !== coords.length - 1) return null
        return (
          <g key={c.year}>
            <circle
              cx={c.x}
              cy={c.y}
              r={2.6}
              fill="var(--color-paper-raised)"
              stroke="var(--color-teal)"
              strokeWidth={1.5}
            />
            <text
              x={c.x}
              y={height - 9}
              textAnchor={index === coords.length - 1 ? 'end' : index === 0 ? 'start' : 'middle'}
              className="fill-ink-faint font-mono"
              fontSize={10}
            >
              {c.year}
            </text>
          </g>
        )
      })}

      <text x={0} y={padTop - 7} className="fill-ink-faint font-mono" fontSize={10}>
        {fmtMoneyShort(max)}
      </text>
      <text x={0} y={padTop + innerH - 4} className="fill-ink-faint font-mono" fontSize={10}>
        {fmtMoneyShort(min)}
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* 区间条：薪酬跨度（最低–最高，竖线为中位数）                            */
/* ------------------------------------------------------------------ */

export function RangeBar({
  min,
  max,
  median,
  domainMin,
  domainMax,
  tone = 'ink',
}: {
  min: number
  max: number
  median: number
  domainMin: number
  domainMax: number
  tone?: 'ink' | 'accent'
}) {
  const span = domainMax - domainMin || 1
  const pos = (value: number) => ((value - domainMin) / span) * 100
  const left = Math.min(Math.max(pos(min), 0), 100)
  const right = Math.min(Math.max(pos(max), 0), 100)
  const mid = Math.min(Math.max(pos(median), 0), 100)

  return (
    <div className="relative h-[7px] w-full rounded-full bg-ink/[0.06]">
      <div
        className={`absolute inset-y-0 rounded-full ${tone === 'accent' ? 'bg-accent/30' : 'bg-ink/22'}`}
        style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
      />
      <div
        className={`absolute top-1/2 h-[11px] w-[2px] -translate-y-1/2 rounded-full ${
          tone === 'accent' ? 'bg-accent' : 'bg-ink'
        }`}
        style={{ left: `${mid}%` }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 占比条：用于人数占比 / 性别构成                                       */
/* ------------------------------------------------------------------ */

export function ShareBar({
  value,
  color = 'var(--color-ink)',
  height = 6,
}: {
  value: number
  color?: string
  height?: number
}) {
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-ink/[0.07]"
      style={{ height }}
      role="presentation"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(Math.max(value, 0), 1) * 100}%`, background: color }}
      />
    </div>
  )
}
