/**
 * 图表原语与格式化工具。
 *
 * 不引图表库：数据量小、形状固定，手写 SVG 更可控，也不给客户端加体积。
 * 只用两种墨色：主色画主体，朱红只标记一个「关键值」。图表不画边框、
 * 不画底色，靠留白和疏密区分，不靠配色。
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

/** 0.4 → 40.0% */
export const fmtPercent = (value: number, digits = 1): string =>
  `${(value * 100).toFixed(digits)}%`

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

/**
 * 一节 = 一句结论 + 一段话 + 一块图。
 * 标题本身就是结论，所以不再另加小标签或编号。
 */
export function Section({
  title,
  lede,
  children,
}: {
  title: string
  lede?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-14 border-t border-rule pt-12">
      <h2 className="max-w-[26ch] text-[21px] leading-[1.3] font-semibold tracking-[-0.01em] text-ink sm:text-[24px]">
        {title}
      </h2>
      {lede ? (
        <p className="mt-3.5 max-w-[62ch] text-[14.5px] leading-[1.75] text-ink-soft">{lede}</p>
      ) : null}
      <div className="mt-9">{children}</div>
    </section>
  )
}

/** 图注：一行小字，说明怎么读这张图。 */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[11.5px] leading-relaxed text-ink-faint">{children}</p>
}

/* ------------------------------------------------------------------ */
/* 薪酬分布：直方图 + 中位数/均值两条标记                                 */
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
  const H = 232
  const padTop = 26
  const padBottom = 34
  const innerH = H - padTop - padBottom
  const max = Math.max(...buckets.map((b) => b.count), 1)
  const slot = W / buckets.length
  const barW = Math.max(slot - 3, 2)

  // 把金额映射到横向像素：先找落在哪一档，再在档内插值。
  const markerX = (value: number) => {
    const index = buckets.findIndex((b) => value >= b.from && value < b.to)
    const slotIndex = index === -1 ? buckets.length - 1 : index
    const bucket = buckets[slotIndex]
    const within =
      bucket.to === bucket.from ? 0.5 : (value - bucket.from) / (bucket.to - bucket.from)
    return slotIndex * slot + Math.min(Math.max(within, 0), 1) * slot
  }

  const peak = buckets.reduce((best, b) => (b.count > best.count ? b : best), buckets[0])
  const baseline = padTop + innerH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="当前年薪分布">
      <line
        x1={0}
        x2={W}
        y1={baseline}
        y2={baseline}
        stroke="currentColor"
        className="text-rule-strong"
        strokeWidth={1}
      />

      {buckets.map((bucket, index) => {
        const h = (bucket.count / max) * innerH
        const x = index * slot + (slot - barW) / 2
        const y = baseline - h
        const isPeak = bucket === peak
        return (
          <rect
            key={bucket.from}
            x={x}
            y={y}
            width={barW}
            height={Math.max(h, 1)}
            className={isPeak ? 'text-accent' : 'text-ink/22'}
            fill="currentColor"
          />
        )
      })}

      {/* 均值用虚线、中位数用实线；两者接近时也不互相压住。 */}
      <line
        x1={markerX(mean)}
        x2={markerX(mean)}
        y1={padTop - 8}
        y2={baseline}
        stroke="currentColor"
        className="text-ink-faint"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <line
        x1={markerX(median)}
        x2={markerX(median)}
        y1={padTop - 8}
        y2={baseline}
        stroke="currentColor"
        className="text-accent"
        strokeWidth={1.5}
      />

      {buckets.map((bucket, index) =>
        index % 2 === 0 ? (
          <text
            key={`x-${bucket.from}`}
            x={index * slot + slot / 2}
            y={H - 12}
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
    <div className="space-y-1.5">
      {data.map((row) => {
        const hiredW = (row.hired / max) * 100
        const keptW = (row.active / max) * 100
        const retained = row.hired > 0 ? row.active / row.hired : 0
        return (
          <div key={row.year} className="group flex items-center gap-4">
            <span className="w-9 shrink-0 font-mono text-[11px] tabular text-ink-faint">
              {row.year}
            </span>
            <div className="relative h-[17px] flex-1">
              <div
                className="absolute inset-y-0 left-0 rounded-[1px] bg-ink/12"
                style={{ width: `${hiredW}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-[1px] bg-ink/70 transition-colors group-hover:bg-ink"
                style={{ width: `${keptW}%` }}
              />
            </div>
            <span className="w-9 shrink-0 text-right font-mono text-[11px] tabular text-ink-faint">
              {fmtPercent(retained, 0)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 区间条：最低–最高，竖线为中位数                                       */
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
    <div className="relative h-[6px] w-full rounded-full bg-ink/[0.05]">
      <div
        className="absolute inset-y-0 rounded-full bg-ink/22"
        style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
      />
      <div
        className="absolute top-1/2 h-[10px] w-[1.5px] -translate-y-1/2 rounded-full bg-ink"
        style={{ left: `${mid}%` }}
      />
    </div>
  )
}
