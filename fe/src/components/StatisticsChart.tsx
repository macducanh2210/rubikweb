import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDuration } from '../lib/formatDate'
import type { StatisticsProgressItem } from '../types'

export default function StatisticsChart({ progress }: { progress: StatisticsProgressItem[] }) {
  const points = progress.map((item, index) => ({ ...item, solve: index + 1 }))
  return (
    <div className="h-60 w-full" role="img" aria-label={`Biểu đồ thời gian của ${points.length} lượt giải, theo thứ tự thời gian`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: 0 }} accessibilityLayer>
          <XAxis dataKey="solve" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis width={48} unit="s" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} domain={[0, 'auto']} />
          <Tooltip formatter={(value) => [formatDuration(Number(value)), 'Thời gian']} labelFormatter={(label) => `Lần giải ${label}`} contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }} />
          <Line type="linear" dataKey="duration" name="Thời gian" stroke="var(--link)" strokeWidth={2} dot={{ r: 3, fill: 'var(--link)', stroke: 'var(--link)' }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
