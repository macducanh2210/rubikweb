import { useState } from 'react'
import { Button, ConfirmDialog, CubeNet, EmptyState, Field, FileField, FormNotice, MoveChip, SelectField, Spinner, StatRow, StatusBadge, Sticker, ToggleField } from '../components/ui'
import { ContrastAudit } from '../components/design/ContrastAudit'
import { ResultEditorPreview } from '../components/design/ResultEditorPreview'
import { ScanPreview } from '../components/design/ScanPreview'
import { SolutionPreview } from '../components/design/SolutionPreview'
import { demoCube } from '../components/design/demoData'
import { setTheme } from '../lib/theme'
import type { Theme, StickerColor } from '../types'

const colors: StickerColor[] = ['white', 'yellow', 'red', 'orange', 'blue', 'green']

function ThemeExamples({ theme }: { theme: Theme }) {
  const [notice, setNotice] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [toggleOn, setToggleOn] = useState(true)
  const label = theme === 'light' ? 'Sáng' : 'Tối'

  return (
    <section data-theme={theme} className="min-w-0 rounded-panel border border-line bg-surface p-4 text-ink sm:p-6">
      <h2 className="text-title font-semibold">Chế độ {label.toLowerCase()}</h2>
      <p className="mt-2 text-small text-muted">Mọi màu bên dưới lấy từ token của chế độ {label.toLowerCase()}.</p>

      <div className="mt-8 grid gap-8">
        <section className="grid gap-4 border-t border-line pt-6">
          <h3 className="text-section font-semibold">Chữ và nút</h3>
          <p className="text-body">ă â ê ô ơ ư đ · Á À Ả Ã Ạ · ấ ề ộ ở ữ</p>
          <p className="text-small text-muted">Quét sáu mặt khối Rubik rồi xem từng bước giải.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setNotice('Đã chọn nút chính')}>Bắt đầu giải</Button>
            <Button variant="secondary" onClick={() => setNotice('Đã chọn nút phụ')}>Chụp lại mặt F</Button>
            <Button variant="danger" onClick={() => setNotice('Đã chọn nút nguy hiểm')}>Xóa tài khoản</Button>
          </div>
          {notice && <p role="status" className="text-small text-muted">{notice}</p>}
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <h3 className="text-section font-semibold">Trường nhập và trạng thái</h3>
          <Field id={`email-${theme}`} label="Email" type="email" defaultValue="nguoidung@example.com" />
          <Field id={`password-${theme}`} label="Mật khẩu" type="password" error="Mật khẩu cần ít nhất 8 ký tự." />
          <FileField id={`avatar-${theme}`} label="Ảnh đại diện" accept="image/jpeg,image/png" file={null} onChange={() => setNotice('Đã chọn ảnh')} hint="JPG hoặc PNG, tối đa 2 MB." />
          <SelectField id={`theme-choice-${theme}`} label="Giao diện" defaultValue={theme} options={[{ value: 'light', label: 'Sáng' }, { value: 'dark', label: 'Tối' }]} />
          <ToggleField id={`focus-${theme}`} label="Tự lấy nét" checked={toggleOn} onChange={(event) => setToggleOn(event.target.checked)} />
          <FormNotice tone="success" message="Đã lưu thay đổi" />
          <Button variant="secondary" className="justify-self-start" onClick={() => setDialogOpen(true)}>Xem hộp thoại</Button>
          {dialogOpen && <ConfirmDialog title="Khôi phục mặc định" description="Mọi cài đặt sẽ trở về giá trị ban đầu." confirmLabel="Khôi phục mặc định" onClose={() => setDialogOpen(false)} onConfirm={() => setDialogOpen(false)} />}
          <div className="flex flex-wrap items-center gap-4">
            <StatusBadge tone="success" label="Đã hoàn thành" />
            <StatusBadge tone="warning" label="Độ tin cậy thấp" />
            <StatusBadge tone="danger" label="Có lỗi" />
            <Spinner />
          </div>
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <h3 className="text-section font-semibold">Nhãn dán và net</h3>
          <div className="flex flex-wrap gap-3">
            {colors.map((color) => <Sticker key={color} color={color} size="swatch" />)}
          </div>
          <CubeNet faces={demoCube} size="overview" activeFace="F" />
          <CubeNet faces={demoCube} size="editor" activeFace="F" />
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <h3 className="text-section font-semibold">Bước giải, thống kê, trạng thái rỗng</h3>
          <div className="flex flex-wrap gap-2">
            <MoveChip move="R" step={1} completed />
            <MoveChip move="U" step={2} active />
            <MoveChip move="R'" step={3} />
          </div>
          <StatRow label="Thời gian tốt nhất" value="01:35" />
          <StatRow label="Số bước trung bình" value="18.5" unit="bước" />
          <EmptyState
            title="Chưa có lượt giải nào"
            description="Quét một khối Rubik để bắt đầu."
            action={<Button variant="secondary" onClick={() => setNotice('Đã chọn quét khối Rubik')}>Quét khối Rubik</Button>}
          />
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <h3 className="text-section font-semibold">Mẫu màn Quét</h3>
          <ScanPreview />
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <h3 className="text-section font-semibold">Mẫu màn Kết quả nhận diện</h3>
          <ResultEditorPreview onStartSolve={() => document.getElementById(`solution-demo-${theme}`)?.scrollIntoView()} />
        </section>

        <section id={`solution-demo-${theme}`} className="grid gap-4 border-t border-line pt-6">
          <h3 className="text-section font-semibold">Mẫu màn Lời giải</h3>
          <SolutionPreview />
        </section>

        <section className="grid gap-4 border-t border-line pt-6">
          <h3 className="text-section font-semibold">Tỷ lệ tương phản đã đo</h3>
          <p className="text-small text-muted">Chữ thường cần ít nhất 4.5:1; viền và vòng focus cần ít nhất 3:1.</p>
          <ContrastAudit theme={theme} />
        </section>
      </div>
    </section>
  )
}

export function DesignPage() {
  return (
    <main className="min-h-screen bg-page px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 grid gap-4 pb-6">
          <div>
            <h1 className="text-title font-semibold">Hệ thống thiết kế</h1>
            <p className="mt-2 text-small text-muted">Trang mẫu dành cho môi trường phát triển.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setTheme('light')}>Áp dụng chế độ sáng</Button>
            <Button variant="secondary" onClick={() => setTheme('dark')}>Áp dụng chế độ tối</Button>
          </div>
        </header>
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <ThemeExamples theme="light" />
          <ThemeExamples theme="dark" />
        </div>
      </div>
    </main>
  )
}
