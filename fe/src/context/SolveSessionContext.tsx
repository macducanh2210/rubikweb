import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { historyService } from '../services/historyService'
import type { CubeState, HistoryDetail, SolveData } from '../types'

interface SessionBase {
  rubikStateId: number
  cubeState: CubeState
  result: SolveData
}

export type SolveSession =
  | (SessionBase & { mode: 'live'; confidenceScore: number; source?: 'manual' })
  | (SessionBase & { mode: 'replay'; historyId: number })

interface SolveSessionValue {
  session: SolveSession | null
  setSession: (session: SolveSession | null) => void
  openReplay: (id: number) => Promise<void>
  openReplayFromDetail: (detail: HistoryDetail) => void
}

const SolveSessionContext = createContext<SolveSessionValue | null>(null)

export function SolveSessionProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const [session, setSession] = useState<SolveSession | null>(null)
  const [ownerId, setOwnerId] = useState<number | null>(null)
  useEffect(() => {
    if (!isLoading && ownerId !== null && ownerId !== user?.id) {
      setSession(null)
      setOwnerId(null)
    }
  }, [isLoading, ownerId, user?.id])
  function updateSession(next: SolveSession | null) {
    setSession(next)
    setOwnerId(next ? user?.id ?? null : null)
  }
  function openReplayFromDetail(detail: HistoryDetail) {
    updateSession({
      mode: 'replay', historyId: detail.id,
      rubikStateId: detail.rubik_state.id,
      cubeState: detail.rubik_state.cube_state,
      result: {
        solution_id: detail.solution.id,
        moves: detail.solution.moves,
        total_steps: detail.solution.total_steps,
        algorithm: detail.solution.algorithm,
      },
    })
  }
  async function openReplay(id: number) {
    openReplayFromDetail(await historyService.getDetail(id))
  }
  return <SolveSessionContext.Provider value={{ session, setSession: updateSession, openReplay, openReplayFromDetail }}>{children}</SolveSessionContext.Provider>
}

export function useSolveSession(): SolveSessionValue {
  const context = useContext(SolveSessionContext)
  if (!context) throw new Error('SolveSessionProvider chưa được khởi tạo')
  return context
}
