import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

/* 抽象画 · 靛与锈
   冷白纸面上的一幅几何抽象：靛蓝硬边色块占据重心，锈红与铬黄在其间穿插，
   手绘毛边笔触与精准几何相互拉扯。纯 SVG 静态渲染，无文字。 */

function Home() {
  return (
    <main className="grid min-h-screen w-full place-items-center bg-[#0e0e0c] p-4 sm:p-8">
      <div className="paint-frame w-full max-w-[1100px]">
        <svg viewBox="0 0 1000 700" className="block h-auto w-full" role="img" aria-label="抽象几何绘画">
          <defs>
            {/* 冷白纸面 */}
            <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#f6f5f1" />
              <stop offset="60%" stopColor="#eeede7" />
              <stop offset="100%" stopColor="#e2e1d9" />
            </linearGradient>

            {/* 靛蓝色块：微妙的内部明暗，避免平板 */}
            <linearGradient id="indigo" x1="0" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="#27467e" />
              <stop offset="100%" stopColor="#16294d" />
            </linearGradient>

            {/* 锈红的晕染 */}
            <radialGradient id="rustWash">
              <stop offset="0%" stopColor="#a8442a" stopOpacity="0.85" />
              <stop offset="65%" stopColor="#a8442a" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#a8442a" stopOpacity="0" />
            </radialGradient>

            {/* 颜料的不均匀感：沿边缘轻微置换 */}
            <filter id="dry" x="-8%" y="-8%" width="116%" height="116%">
              <feTurbulence type="fractalNoise" baseFrequency="0.028 0.04" numOctaves="2" seed="5" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" />
            </filter>

            <filter id="bleed" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="26" />
            </filter>
            <filter id="grit" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" />
            </filter>

            {/* 布纹 */}
            <filter id="weave">
              <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" stitchTiles="stitch" result="t" />
              <feColorMatrix in="t" type="saturate" values="0" />
            </filter>

            <clipPath id="frame">
              <rect x="0" y="0" width="1000" height="700" />
            </clipPath>
          </defs>

          <g clipPath="url(#frame)">
            <rect width="1000" height="700" fill="url(#paper)" />

            {/* 锈红的底晕，只作为气氛，不抢重心 */}
            <ellipse cx="255" cy="205" rx="210" ry="150" fill="url(#rustWash)" filter="url(#bleed)" />
            <ellipse cx="760" cy="545" rx="180" ry="120" fill="url(#rustWash)" filter="url(#bleed)" opacity="0.55" />

            {/* 记忆点：一块大靛蓝色块，硬边，略微歪斜 */}
            <path d="M140 118 L604 96 L560 512 L112 470 Z" fill="url(#indigo)" />

            {/* 铬黄窄条切过靛蓝，形成冲突 */}
            <path d="M604 96 L640 100 L598 516 L560 512 Z" fill="#e3b23c" />

            {/* 炭黑细线与几何体 */}
            <g fill="none" stroke="#14140f" strokeLinecap="round">
              <circle cx="700" cy="238" r="86" strokeWidth="3" opacity="0.85" />
              <path d="M690 560 L820 498 L780 638 Z" strokeWidth="3" opacity="0.8" />
              <line x1="78" y1="640" x2="930" y2="62" strokeWidth="1.2" opacity="0.35" />
            </g>
            <circle cx="700" cy="238" r="26" fill="#a8442a" opacity="0.9" />
            <rect x="862" y="88" width="72" height="72" fill="#14140f" opacity="0.82" transform="rotate(-9 898 124)" />

            {/* 手绘毛边笔触，与硬边几何对抗 */}
            <g fill="none" strokeLinecap="round" filter="url(#dry)">
              <path d="M96 588 C 250 552, 380 612, 540 566" stroke="#a8442a" strokeWidth="20" opacity="0.8" />
              <path d="M300 60 C 420 34, 500 92, 640 58" stroke="#14140f" strokeWidth="11" opacity="0.72" />
              <path d="M660 424 C 740 400, 800 440, 892 404" stroke="#e3b23c" strokeWidth="13" opacity="0.68" />
            </g>

            {/* 颜料的碎屑与滴点 */}
            <g fill="#a8442a" opacity="0.9">
              <circle cx="470" cy="300" r="9" filter="url(#grit)" />
              <circle cx="492" cy="286" r="3.4" />
              <circle cx="452" cy="322" r="2.8" />
              <circle cx="836" cy="330" r="6" filter="url(#grit)" />
              <circle cx="820" cy="348" r="2.4" />
            </g>
            <g fill="#e3b23c">
              <circle cx="212" cy="170" r="5" />
              <circle cx="726" cy="392" r="4" />
              <circle cx="548" cy="606" r="4.6" />
            </g>

            {/* 布纹最上层 */}
            <rect width="1000" height="700" filter="url(#weave)" opacity="0.06" style={{ mixBlendMode: 'multiply' }} />
          </g>
        </svg>
      </div>
    </main>
  )
}
