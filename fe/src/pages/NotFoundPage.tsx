import { useNavigate } from 'react-router-dom'
import { Button, EmptyState } from '../components/ui'

export function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <main className="grid min-h-screen place-items-center bg-page px-4 text-ink">
      <EmptyState
        title="Không tìm thấy trang"
        description="Địa chỉ này không tồn tại."
        action={<Button onClick={() => navigate('/')}>Về trang chủ</Button>}
      />
    </main>
  )
}
