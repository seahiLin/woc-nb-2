/**
 * 图表原语与格式化工具。
 *
 * 设计取向：浅色纸面 + 细线 + 大字号数字，像一份印出来的分析报告，
 * 而不是常见的深色“监控大屏”。不引图表库，全部手写 SVG —— 数据量小、
 * 形状固定，手写反而更可控，也不给客户端加体积。
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

/** $72.0K / $1.2M */
export const fmtMoneyShort = (value: number): string => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${Math.round(value / 1_000)}K`
  return usd.format(value)
}

/** 300,024 */
export const fmtInt = (value: number): string => int.format(Math.round(value))

/** 300.0K / 2.8M */
export const fmtCompact = (value: number): string => {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${Math.round(value / 1_000)}K`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return fmtInt(value)
}

/** 0.4 → 40.0% */
export const fmtPercent = (value: number, digits = 1): string => `${(value * 100).toFixed(digits)}%`

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

/** 一节：编号 + 标题 + 可选的导语与右侧注释。 */
export function Section({
  index,
  title,
  lede,
  aside,
  children,
}: {
  index: string
  title: string
  lede?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-t border-rule pt-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[11px] tracking-[0.2em] text-ink-faint">{index}</span>
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
          </div>
          {lede ? (
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft sm:pl-[calc(11px+0.75rem)]">
              {lede}
            </p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0 text-[11px] text-ink-faint">{aside}</div> : null}
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

  const W = 720
  const H = 220
  const padTop = 26
  const padBottom = 34
  const innerH = H - padTop - padBottom
  const max = Math.max(...buckets.map((b) => b.count), 1)
  const slot = W / buckets.length
  const barW = Math.max(slot - 3, 2)

  // 中位数/均值落在哪一档，就在那一档上画一条竖线。
  const markerX = (value: number) => {
    const index = buckets.findIndex((b) => value >= b.from && value < b.to)
    const slotIndex = index === -1 ? buckets.length - 1 : index
    const bucket = buckets[slotIndex]
    const within = bucket.to === bucket.from ? 0.5 : (value - bucket.from) / (bucket.to - bucket.from)
    return slotIndex * slot + Math.min(Math.max(within, 0), 1) * slot
  }

  const peak = buckets.reduce((best, b) => (b.count > best.count ? b : best), buckets[0])

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="当前薪资分布直方图">
        {/* 基线 */}
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
                rx={1.5}
                className={isPeak ? 'text-ink' : 'text-ink/25'}
                fill="currentColor"
              />
              {isPeak ? (
                <text
                  x={x + barW / 2}
                  y={y - 7}
                  textAnchor="middle"
                  className="fill-ink font-mono"
                  fontSize={10}
                >
                  {fmtCompact(bucket.count)}
                </text>
              ) : null}
            </g>
          )
        })}

        {/* 中位数 / 均值参考线 */}
        {[
          { value: median, label: '中位数', color: '#c2410c' },
          { value: mean, label: '均值', color: '#1d4ed8' },
        ].map((marker) => {
          const x = markerX(marker.value)
          return (
            <g key={marker.label}>
              <line
                x1={x}
                x2={x}
                y1={padTop - 6}
                y2={padTop + innerH}
                stroke={marker.color}
                strokeWidth={1.25}
                strokeDasharray="3 3"
              />
              <circle cx={x} cy={padTop - 6} r={2.5} fill={marker.color} />
            </g>
          )
        })}

        {/* 横轴刻度：每两档标一次，避免拥挤 */}
        {buckets.map((bucket, index) =>
          index % 2 === 0 ? (
            <text
              key={`x-${bucket.from}`}
              x={index * slot + slot / 2}
              y={H - 12}
              textAnchor="middle"
              className="fill-ink-faint font-mono"
              fontSize={9.5}
            >
              {bucket.from >= 120_000 ? '120K+' : `${bucket.from / 1000}K`}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 留存：堆叠条 —— 每年招的人里，多少人还在                              */
/* ------------------------------------------------------------------ */

export function RetentionChart({
  data,
}: {
  data: Array<{ year: number; hired: number; active: number }>
}) {
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.hired), 1)
  const totalHired = data.reduce((sum, d) => sum + d.hired, 0)

  return (
    <div className="space-y-[3px]">
      {data.map((row) => {
        const hiredW = (row.hired / max) * 100
        const activeW = row.hired > 0 ? (row.active / row.hired) * 100 : 0
        const retention = row.hired > 0 ? row.active / row.hired : 0
        return (
          <div key={row.year} className="group flex items-center gap-3">
            <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
              {row.year}
            </span>
            <div className="relative h-[18px] flex-1">
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] bg-ink/10 transition-colors group-hover:bg-ink/15"
                style={{ width: `${hiredW}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] bg-ink/70 transition-colors group-hover:bg-ink"
                style={{ width: `${(hiredW * activeW) / 100}%` }}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-soft">
              {fmtCompact(row.hired)}
            </span>
            <span
              className={`w-11 shrink-0 text-right font-mono text-[11px] tabular-nums ${
                retention >= 0.8 ? 'text-ink-soft' : 'text-ink-faint'
              }`}
            >
              {fmtPercent(retention, 0)}
            </span>
          </div>
        )
      })}
      <div className="flex items-center gap-3 pt-2">
        <span className="w-10 shrink-0" />
        <span className="flex-1 text-[10px] tracking-wide text-ink-faint uppercase">
          合计 {fmtInt(totalHired)} 人入职
        </span>
        <span className="w-12 shrink-0 text-right text-[10px] text-ink-faint">招聘</span>
        <span className="w-11 shrink-0 text-right text-[10px] text-ink-faint">留存</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 折线：薪酬水平随年份                                                 */
/* ------------------------------------------------------------------ */

export function TrendChart({
  points,
  height = 180,
}: {
  points: Array<{ year: number; avgSalary: number }>
  height?: number
}) {
  if (points.length < 2) return null
  const W = 720
  const padTop = 18
  const padBottom = 28
  const innerH = height - padTop - padBottom
  const min = Math.min(...points.map((p) => p.avgSalary))
  const max = Math.max(...points.map((p) => p.avgSalary))
  const span = max - min || 1

  const coords = points.map((point, index) => ({
    x: (index / (points.length - 1)) * W,
    y: padTop + innerH - ((point.avgSalary - min) / span) * innerH,
    ...point,
  }))

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${line} L ${W},${padTop + innerH} L 0,${padTop + innerH} Z`

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="历年平均薪资">
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f766e" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#0f766e" stopOpacity="0" />
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
          strokeDasharray="2 4"
        />
      ))}

      <path d={area} fill="url(#trend-fill)" />
      <path d={line} fill="none" stroke="#0f766e" strokeWidth={1.6} strokeLinejoin="round" />

      {coords.map((c, index) =>
        index % Math.ceil(coords.length / 8) === 0 || index === coords.length - 1 ? (
          <g key={c.year}>
            <circle cx={c.x} cy={c.y} r={2.4} fill="#faf9f7" stroke="#0f766e" strokeWidth={1.4} />
            <text
              x={c.x}
              y={height - 8}
              textAnchor={index === coords.length - 1 ? 'end' : index === 0 ? 'start' : 'middle'}
              className="fill-ink-faint font-mono"
              fontSize={9.5}
            >
              {c.year}
            </text>
          </g>
        ) : null,
      )}

      <text x={0} y={padTop - 5} className="fill-ink-faint font-mono" fontSize={9.5}>
        {fmtMoneyShort(max)}
      </text>
      <text x={0} y={padTop + innerH - 3} className="fill-ink-faint font-mono" fontSize={9.5}>
        {fmtMoneyShort(min)}
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* 区间条：部门/职衔的薪酬跨度（P25–P75 感）                             */
/* ------------------------------------------------------------------ */

export function RangeBar({
  min,
  max,
  median,
  domainMin,
  domainMax,
}: {
  min: number
  max: number
  median: number
  domainMin: number
  domainMax: number
}) {
  const span = domainMax - domainMin || 1
  const pos = (value: number) => ((value - domainMin) / span) * 100
  const left = Math.min(Math.max(pos(min), 0), 100)
  const right = Math.min(Math.max(pos(max), 0), 100)
  const mid = Math.min(Math.max(pos(median), 0), 100)

  return (
    <div className="relative h-[6px] w-full rounded-full bg-ink/[0.07]">
      <div
        className="absolute inset-y-0 rounded-full bg-ink/20"
        style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
      />
      <div
        className="absolute top-1/2 h-[10px] w-[2px] -translate-y-1/2 rounded-full bg-accent"
        style={{ left: `${mid}%` }}
      />
    </div>
  )
}
