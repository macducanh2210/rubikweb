import { useState } from 'react'
import { Button, MoveChip, StatusBadge } from '../ui'
import { CubeModel } from '../CubeModel'
import { demoCube, demoMoves } from './demoData'

type PracticeStatus = 'in_progress' | 'completed' | 'abandoned'

export function SolutionPreview() {
  const [currentStep, setCurrentStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState('normal')
  const [status, setStatus] = useState<PracticeStatus>('in_progress')

  return (
    <section className="grid gap-5" aria-label="Mẫu màn lời giải">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-section font-semibold">Lời giải</h3>
        <span className="font-mono text-small text-ink">Bước {currentStep + 1} / {demoMoves.length}</span>
      </div>

      <div className="grid min-h-64 place-items-center rounded-panel border border-line bg-page">
        <CubeModel cubeState={demoCube} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-2">
        {demoMoves.map((move, index) => (
          <MoveChip
            key={index}
            move={move}
            step={index + 1}
            active={index === currentStep}
            completed={index < currentStep}
            onClick={() => setCurrentStep(index)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={currentStep === 0} onClick={() => setCurrentStep((step) => step - 1)}>
          Bước trước
        </Button>
        <Button variant="secondary" onClick={() => setPlaying((value) => !value)}>
          {playing ? 'Tạm dừng' : 'Phát'}
        </Button>
        <Button variant="secondary" disabled={currentStep === demoMoves.length - 1} onClick={() => setCurrentStep((step) => step + 1)}>
          Bước sau
        </Button>
      </div>

      <label className="grid gap-2 text-small text-ink">
        Tốc độ
        <select
          value={speed}
          onChange={(event) => setSpeed(event.target.value)}
          className="min-h-11 max-w-56 rounded-control border border-control-border bg-surface px-3 text-body text-ink"
        >
          <option value="slow">Chậm</option>
          <option value="normal">Bình thường</option>
          <option value="fast">Nhanh</option>
        </select>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div>
          <p className="text-small text-muted">Đồng hồ luyện tập</p>
          <p className="font-mono text-title font-semibold text-ink">01:35</p>
        </div>
        {status === 'completed' && <StatusBadge tone="success" label="Đã hoàn thành" />}
        {status === 'abandoned' && <StatusBadge tone="warning" label="Đã bỏ dở" />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={status !== 'in_progress'} onClick={() => setStatus('completed')}>Hoàn thành</Button>
        <Button disabled={status !== 'in_progress'} variant="secondary" onClick={() => setStatus('abandoned')}>Bỏ dở</Button>
      </div>
    </section>
  )
}
