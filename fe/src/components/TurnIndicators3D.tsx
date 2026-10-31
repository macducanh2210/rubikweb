import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, Shape } from 'three'
import type { MeshBasicMaterial } from 'three'
import type { CubeMove } from '../lib/cube'
import { turnGuideFlashMs } from '../lib/cube/animationConfig'

function useFlashOpacity(pulse: boolean) {
  const outlineRef = useRef<MeshBasicMaterial>(null)
  const fillRef = useRef<MeshBasicMaterial>(null)
  const startedAtRef = useRef(performance.now())
  useFrame(() => {
    if (!pulse) return
    const opacity = Math.min(1, (performance.now() - startedAtRef.current) / turnGuideFlashMs)
    if (outlineRef.current) outlineRef.current.opacity = opacity
    if (fillRef.current) fillRef.current.opacity = opacity
  })
  return { outlineRef, fillRef }
}

function arrowShape(move: CubeMove): Shape {
  const clockwise = !move.endsWith("'")
  const start = clockwise ? Math.PI * 0.75 : Math.PI * 0.25
  const sweep = (move.endsWith('2') ? Math.PI : Math.PI / 2) * (clockwise ? -1 : 1)
  const base = start + sweep - Math.sign(sweep) * 0.22
  const radius = 1.16
  const shaftHalfWidth = 0.12
  const headHalfWidth = 0.3
  const segments = 24
  const point = (angle: number, distance: number): [number, number] => [
    Math.cos(angle) * distance, Math.sin(angle) * distance,
  ]
  const shape = new Shape()
  const [startX, startY] = point(start, radius + shaftHalfWidth)
  shape.moveTo(startX, startY)
  for (let index = 1; index <= segments; index += 1) {
    const [x, y] = point(start + (base - start) * index / segments, radius + shaftHalfWidth)
    shape.lineTo(x, y)
  }
  shape.lineTo(...point(base, radius + headHalfWidth))
  shape.lineTo(...point(start + sweep, radius))
  shape.lineTo(...point(base, radius - headHalfWidth))
  for (let index = segments; index >= 0; index -= 1) {
    const [x, y] = point(start + (base - start) * index / segments, radius - shaftHalfWidth)
    shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function triangle(size: number): Shape {
  const shape = new Shape()
  shape.moveTo(0, size)
  shape.lineTo(-size * 0.8, -size * 0.7)
  shape.lineTo(size * 0.8, -size * 0.7)
  shape.closePath()
  return shape
}

const markerOutline = triangle(0.23)
const markerFill = triangle(0.19)

/** Curved face arrow and outlined edge markers sit just above the stickers. */
export function TurnArrow3D({ move, pulse, dark, light }: { move: CubeMove; pulse: boolean; dark: string; light: string }) {
  const shape = useMemo(() => arrowShape(move), [move])
  const { outlineRef, fillRef } = useFlashOpacity(pulse)
  return (
    <group>
      <mesh position={[0, 0, 0.006]} scale={[1.08, 1.08, 1]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial ref={outlineRef} color={light} side={DoubleSide} transparent={pulse} opacity={pulse ? 0 : 1} />
      </mesh>
      <mesh position={[0, 0, 0.012]}>
        <shapeGeometry args={[shape]} />
        <meshBasicMaterial ref={fillRef} color={dark} side={DoubleSide} transparent={pulse} opacity={pulse ? 0 : 1} />
      </mesh>
    </group>
  )
}

export function TurnMarker3D({ direction, pulse, dark, light }: {
  direction: readonly [number, number]
  pulse: boolean
  dark: string
  light: string
}) {
  const rotation = Math.atan2(-direction[0], direction[1])
  const { outlineRef, fillRef } = useFlashOpacity(pulse)
  return (
    <group position={[0, 0, 0.012]} rotation={[0, 0, rotation]}>
      <mesh>
        <shapeGeometry args={[markerOutline]} />
        <meshBasicMaterial ref={outlineRef} color={light} side={DoubleSide} transparent={pulse} opacity={pulse ? 0 : 1} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <shapeGeometry args={[markerFill]} />
        <meshBasicMaterial ref={fillRef} color={dark} side={DoubleSide} transparent={pulse} opacity={pulse ? 0 : 1} />
      </mesh>
    </group>
  )
}
