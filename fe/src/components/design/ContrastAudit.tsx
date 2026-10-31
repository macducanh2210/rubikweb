import { useEffect, useRef, useState } from 'react'
import { contrastPairs, contrastRatio } from '../../lib/contrast'
import type { Theme } from '../../types'

interface MeasuredPair {
  label: string
  foreground: string
  background: string
  ratio: number
  minimum: 3 | 4.5
}

export function ContrastAudit({ theme }: { theme: Theme }) {
  const ref = useRef<HTMLDivElement>(null)
  const [measured, setMeasured] = useState<MeasuredPair[]>([])

  useEffect(() => {
    if (!ref.current) return
    const styles = getComputedStyle(ref.current)
    setMeasured(contrastPairs.map((pair) => {
      const foreground = styles.getPropertyValue(pair.foreground).trim()
      const background = styles.getPropertyValue(pair.background).trim()
      return {
        label: pair.label,
        foreground,
        background,
        minimum: pair.minimum,
        ratio: contrastRatio(foreground, background),
      }
    }))
  }, [theme])

  return (
    <div ref={ref} className="overflow-x-auto">
      <table className="w-full min-w-128 border-collapse text-left text-small">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2 font-semibold">Cặp màu</th>
            <th className="py-2 font-semibold">Chữ / viền</th>
            <th className="py-2 font-semibold">Nền</th>
            <th className="py-2 font-semibold">Tỷ lệ</th>
            <th className="py-2 font-semibold">Ngưỡng</th>
          </tr>
        </thead>
        <tbody>
          {measured.map((pair) => (
            <tr key={pair.label} className="border-b border-line">
              <td className="py-2 pr-3">{pair.label}</td>
              <td className="py-2 font-mono text-caption">{pair.foreground}</td>
              <td className="py-2 font-mono text-caption">{pair.background}</td>
              <td className="py-2 font-mono">{pair.ratio.toFixed(2)}:1</td>
              <td className="py-2">{pair.ratio >= pair.minimum ? 'Đạt' : 'Chưa đạt'} ({pair.minimum}:1)</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
