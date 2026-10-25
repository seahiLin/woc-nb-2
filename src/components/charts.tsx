/**
 * 图表与格式化。
 *
 * 不引图表库：数据量小、形状固定，手写 SVG 更可控，也不给客户端加体积。
 *
 * 用色规则只有一条：红（`--color-ledger`）是「基准线」——直方图里的中位数、
 * 部门图里的全员平均。它不出现在别的地方，所以看到红就知道在跟什么比。
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

/** 0.4 → 40% */
export const fmtPercent = (value: number, digits = 0): string =>
  `${(value * 100).toFixed(digits)}%`

/** '2002-08-02' → '2002 年 8 月' */
export const fmtYearMonth = (value: string): string => {
  const match = /^(\d{4})-(\d{2})/.exec(value)
  return match ? `${match[1]} 年 ${Number(match[2])} 月` : value
}

/** '2002-08-02' → '2002.08.02'，不依赖 locale，SSR 与浏览器一致。 */
export const fmtDate = (value: string): string => {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return `${match[1]}.${match[2]}.${match[3]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`
}

/* ------------------------------------------------------------------ */
/* 版式原语                                                            */
/* ------------------------------------------------------------------ */

/**
 * 一节 = 左边栏标出这是什么 + 右边一条结论。左栏是登记册的栏目，
 * 不是装饰：它让整页有了固定的阅读轴，扫视时先看左栏定位。
 */
export function Section({
  label,
  title,
  lede,
  children,
}: {
  label: string
  title: ReactNode
  lede?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid grid-cols-1 gap-y-6 border-t border-rule pt-10 sm:grid-cols-[8.5rem_1fr] sm:gap-x-10 sm:pt-12">
      <p className="font-sans text-[11px] leading-[2.4] tracking-[0.06em] text-ink-faint sm:sticky sm:top-10 sm:self-start">
        {label}
      </p>
      <div className="min-w-0">
        <h2 className="max-w-[24ch] text-[25px] leading-[1.32] font-medium tracking-[-0.01em] text-balance sm:text-[29px]">
          {title}
        </h2>
        {lede ? (
          <p className="mt-4 max-w-[58ch] text-[15.5px] leading-[1.85] text-ink-soft">{lede}</p>
        ) : null}
        <div className="mt-9">{children}</div>
      </div>
    </section>
  )
}

/** 图注：说明怎么读，不解释为什么这么画。 */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="mt-3.5 font-sans text-[11.5px] leading-relaxed text-ink-faint">{children}</p>
}

/* ------------------------------------------------------------------ */
/* 薪酬分布：全幅直方图，中间半数加深，中位数是红色基准线                 */
/* ------------------------------------------------------------------ */

export function DistributionChart({
  buckets,
  median,
  p25,
  p75,
}: {
  buckets: Array<{ from: number; to: number; count: number }>
  median: number
  p25: number
  p75: number
}) {
  if (buckets.length === 0) return null

  const W = 760
  const H = 244
  const padTop = 30
  const padBottom = 30
  const innerH = H - padTop - padBottom
  const max = Math.max(...buckets.map((b) => b.count), 1)
  const slot = W / buckets.length
  const barW = Math.max(slot - 3.5, 2)
  const baseline = padTop + innerH

  // 金额 → 横向像素：先定位档位，再在档内插值。
  const markerX = (value: number) => {
    const index = buckets.findIndex((b) => value >= b.from && value < b.to)
    const slotIndex = index === -1 ? buckets.length - 1 : index
    const bucket = buckets[slotIndex]
    const within =
      bucket.to === bucket.from ? 0.5 : (value - bucket.from) / (bucket.to - bucket.from)
    return slotIndex * slot + Math.min(Math.max(within, 0), 1) * slot
  }

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
        const inMiddle = bucket.from >= p25 && bucket.from < p75
        return (
          <rect
            key={bucket.from}
            x={index * slot + (slot - barW) / 2}
            y={baseline - h}
            width={barW}
            height={Math.max(h, 1)}
            className={`plot ${inMiddle ? 'text-ink/85' : 'text-ink/22'}`}
            fill="currentColor"
            style={{ animationDelay: `${index * 18}ms` }}
          />
        )
      })}

      {/* 中位数：唯一的红。 */}
      <line
        x1={markerX(median)}
        x2={markerX(median)}
        y1={padTop - 16}
        y2={baseline}
        stroke="currentColor"
        className="text-ledger"
        strokeWidth={1.5}
      />
      <text
        x={markerX(median)}
        y={padTop - 22}
        textAnchor="middle"
        className="fill-ledger font-sans"
        fontSize={11}
      >
        中位 {fmtMoney(median)}
      </text>

      {buckets.map((bucket, index) =>
        index % 2 === 0 ? (
          <text
            key={`x-${bucket.from}`}
            x={index * slot + slot / 2}
            y={H - 10}
            textAnchor="middle"
            className="fill-ink-faint font-sans"
            fontSize={10.5}
          >
            {bucket.from >= 120_000 ? '120K+' : `${bucket.from / 1000}K`}
          </text>
        ) : null,
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* 部门：以全员平均为中轴的偏离条                                        */
/* ------------------------------------------------------------------ */

export function DepartmentBars({
  rows,
  average,
}: {
  rows: Array<{ id: string; name: string; avgSalary: number; headcount: number }>
  average: number
}) {
  const widest = Math.max(...rows.map((r) => Math.abs(r.avgSalary - average)), 1)

  return (
    <div>
      {rows.map((row) => {
        const delta = row.avgSalary - average
        const above = delta >= 0
        const width = (Math.abs(delta) / widest) * 50
        return (
          <div
            key={row.id}
            className="grid grid-cols-[1fr_5.5rem] items-center gap-x-4 border-b border-rule/70 py-2.5 last:border-0 sm:grid-cols-[7.5rem_1fr_5.5rem]"
          >
            <span className="truncate text-[15px]">{row.name}</span>

            <div className="relative order-last col-span-2 h-[14px] sm:order-none sm:col-span-1">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ledger" />
              <span
                className={`absolute top-1/2 h-[14px] -translate-y-1/2 ${
                  above ? 'bg-ink/80' : 'bg-ink/25'
                }`}
                style={{
                  left: above ? '50%' : `${50 - width}%`,
                  width: `${Math.max(width, 0.7)}%`,
                }}
              />
            </div>

            <span className="text-right text-[15px] tabular">{fmtMoney(row.avgSalary)}</span>
          </div>
        )
      })}
    </div>
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
    <div className="space-y-1">
      {data.map((row) => {
        const hiredW = (row.hired / max) * 100
        const keptW = (row.active / max) * 100
        const retained = row.hired > 0 ? row.active / row.hired : 0
        return (
          <div key={row.year} className="grid grid-cols-[2.6rem_1fr_3rem] items-center gap-x-3">
            <span className="font-sans text-[11.5px] tabular text-ink-faint">{row.year}</span>
            <div className="relative h-[15px]">
              <div
                className="absolute inset-y-0 left-0 bg-ink/15"
                style={{ width: `${hiredW}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-ink/75"
                style={{ width: `${keptW}%` }}
              />
            </div>
            <span className="text-right text-[13px] tabular text-ink-soft">
              {fmtPercent(retained)}
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
    <div className="relative h-[5px] w-full bg-ink/[0.07]">
      <div
        className="absolute inset-y-0 bg-ink/25"
        style={{ left: `${left}%`, width: `${Math.max(right - left, 1)}%` }}
      />
      <div
        className="absolute top-1/2 h-[9px] w-[1.5px] -translate-y-1/2 bg-ink"
        style={{ left: `${mid}%` }}
      />
    </div>
  )
}
