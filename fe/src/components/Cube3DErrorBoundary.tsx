import { Component, type ReactNode } from 'react'

interface BoundaryProps { children: ReactNode; fallback: ReactNode; onError: () => void }
interface BoundaryState { failed: boolean }

export class Cube3DErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false }
  static getDerivedStateFromError(): BoundaryState { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
