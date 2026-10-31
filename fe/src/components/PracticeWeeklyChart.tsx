import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PracticeWeek } from '../lib/practiceAchievements'
import { formatCentiseconds } from '../lib/cube/practice'

export default function PracticeWeeklyChart({ weeks }: { weeks: PracticeWeek[] }) {
  const points = weeks.map((week) => ({ ...week, seconds: week.averageCs === null ? null : week.averageCs / 100 }))
  return (
    <div className="h-64 w-full" role="img" aria-label="Biểu đồ thời gian giải trung bình theo tuần">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 8, left: 0 }} accessibilityLayer>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} interval="preserveStartEnd" />
          <YAxis width={52} unit="s" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} domain={[0, 'auto']} />
          <Tooltip
            formatter={(value) => [formatCentiseconds(Math.round(Number(value) * 100)), 'Trung bình']}
            labelFormatter={(label) => `Tuần từ ${label}`}
            contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--text)' }}
          />
          <Line type="monotone" dataKey="seconds" name="Trung bình" stroke="var(--link)" strokeWidth={2} dot={{ r: 3, fill: 'var(--link)', stroke: 'var(--link)' }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
