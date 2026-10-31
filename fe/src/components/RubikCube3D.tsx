import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Text } from '@react-three/drei'
import type { Group } from 'three'
import faceLabelFont from '@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-700-normal.woff?url'
import { applyMove, type CubeMove } from '../lib/cube'
import { splitHalfTurnDuration } from '../lib/cube/animationConfig'
import { animationTurn, faceletPose, turnMarkerDirection } from '../lib/cube/animationGeometry'
import type { CubePreviewFaces, CubeState, Face, StickerColor } from '../types'
import { TurnArrow3D, TurnMarker3D } from './TurnIndicators3D'

export interface MoveCommand { id: number; move: CubeMove; durationMs: number }

interface Cubelet {
  key: string
  position: [number, number, number]
  stickers: { face: Face; color: StickerColor | null | undefined; index: number }[]
}

const faces: Face[] = ['U', 'D', 'F', 'B', 'L', 'R']
const coordinates = [-1, 0, 1]
const stickerPlacement: Record<Face, { position: [number, number, number]; rotation: [number, number, number] }> = {
  F: { position: [0, 0, 0.499], rotation: [0, 0, 0] },
  B: { position: [0, 0, -0.499], rotation: [0, Math.PI, 0] },
  R: { position: [0.499, 0, 0], rotation: [0, Math.PI / 2, 0] },
  L: { position: [-0.499, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  U: { position: [0, 0.499, 0], rotation: [-Math.PI / 2, 0, 0] },
  D: { position: [0, -0.499, 0], rotation: [Math.PI / 2, 0, 0] },
}
const axisIndex = { x: 0, y: 1, z: 2 } as const

function makeCubelets(state: CubePreviewFaces): Cubelet[] {
  const byPosition = new Map<string, Cubelet>()
  for (const x of coordinates) for (const y of coordinates) for (const z of coordinates) {
    const key = `${x},${y},${z}`
    byPosition.set(key, { key, position: [x, y, z], stickers: [] })
  }
  for (const face of faces) for (let index = 0; index < 9; index += 1) {
    const { position } = faceletPose(face, index)
    byPosition.get(position.join(','))!.stickers.push({ face, color: state[face]?.[index], index })
  }
  return [...byPosition.values()]
}

function readCubeColors() {
  const css = getComputedStyle(document.documentElement)
  const read = (name: string) => css.getPropertyValue(name).trim()
  return {
    white: read('--sticker-white'), red: read('--sticker-red'), green: read('--sticker-green'),
    blue: read('--sticker-blue'), yellow: read('--sticker-yellow'), orange: read('--sticker-orange'),
    empty: read('--quiet'), body: read('--on-bright'),
    labelLight: read('--on-action'), labelEmpty: read('--ink'),
  }
}

function CubeletMesh({ cubelet, colors, showFaceNames, markerMove, markerPulse }: {
  cubelet: Cubelet
  colors: ReturnType<typeof readCubeColors>
  showFaceNames: boolean
  markerMove: CubeMove | null
  markerPulse: boolean
}) {
  const [x, y, z] = cubelet.position
  return (
    <group position={[x * 1.02, y * 1.02, z * 1.02]}>
      <mesh>
        <boxGeometry args={[0.98, 0.98, 0.98]} />
        <meshStandardMaterial color={colors.body} roughness={0.72} />
      </mesh>
      {cubelet.stickers.map(({ face, color, index }) => {
        const markerDirection = markerMove ? turnMarkerDirection(face, markerMove) : null
        return <group key={face} position={stickerPlacement[face].position} rotation={stickerPlacement[face].rotation}>
          <mesh>
            <planeGeometry args={[0.82, 0.82]} />
            <meshBasicMaterial color={color ? colors[color] : colors.empty} side={2} />
          </mesh>
          {showFaceNames && index === 4 && (
            <Text position={[0, 0, 0.006]} font={faceLabelFont} fontSize={0.46} color={!color ? colors.labelEmpty : color === 'blue' || color === 'red' ? colors.labelLight : colors.body} anchorX="center" anchorY="middle">
              {face}
            </Text>
          )}
          {markerDirection && <TurnMarker3D direction={markerDirection} pulse={markerPulse} dark={colors.body} light={colors.labelLight} />}
        </group>
      })}
    </group>
  )
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
}

function CubeScene({ state, command, hintMove, showFaceNames, onMoveComplete }: {
  state: CubeState
  command: MoveCommand | null
  hintMove: CubeMove | null
  showFaceNames: boolean
  onMoveComplete: (command: MoveCommand) => void
}) {
  type HalfTurnPhase = 'first' | 'pause' | 'second'
  const [halfTurnState, setHalfTurnState] = useState<{ commandId: number | null; phase: HalfTurnPhase }>({ commandId: null, phase: 'first' })
  const halfTurnPhase = halfTurnState.commandId === command?.id ? halfTurnState.phase : 'first'
  const visibleState = useMemo(() =>
    command?.move.endsWith('2') && command.durationMs > 0 && halfTurnPhase !== 'first'
      ? applyMove(state, command.move[0])
      : state,
  [state, command?.move, command?.durationMs, halfTurnPhase])
  const cubelets = useMemo(() => makeCubelets(visibleState), [visibleState])
  const colors = useMemo(readCubeColors, [])
  const rotatingRef = useRef<Group>(null)
  const startedAtRef = useRef(0)
  const halfTurnPhaseRef = useRef<HalfTurnPhase>('first')
  const finishedRef = useRef<number | null>(null)
  const { invalidate } = useThree()

  useLayoutEffect(() => {
    startedAtRef.current = performance.now()
    halfTurnPhaseRef.current = 'first'
    setHalfTurnState({ commandId: command?.id ?? null, phase: 'first' })
    finishedRef.current = null
    if (rotatingRef.current) rotatingRef.current.rotation.set(0, 0, 0)
    if (command) invalidate()
  }, [command, invalidate])

  useLayoutEffect(() => {
    if (halfTurnPhase === 'first') return
    if (rotatingRef.current) rotatingRef.current.rotation.set(0, 0, 0)
    invalidate()
  }, [halfTurnPhase, invalidate])

  useFrame(() => {
    if (!command || !rotatingRef.current || finishedRef.current === command.id) return
    const elapsedMs = performance.now() - startedAtRef.current
    if (command.move.endsWith('2') && command.durationMs > 0) {
      const { quarterDurationMs, pauseMs } = splitHalfTurnDuration(command.durationMs)
      const phase = halfTurnPhaseRef.current
      if (phase === 'pause') {
        if (elapsedMs >= pauseMs) {
          halfTurnPhaseRef.current = 'second'
          startedAtRef.current = performance.now()
          setHalfTurnState({ commandId: command.id, phase: 'second' })
        }
        invalidate()
        return
      }
      const { axis, angle: quarterAngle } = animationTurn(command.move[0] as CubeMove)
      const quarterProgress = Math.min(1, elapsedMs / quarterDurationMs)
      rotatingRef.current.rotation[axis] = quarterAngle * easeInOutCubic(quarterProgress)
      if (quarterProgress < 1) {
        invalidate()
        return
      }
      if (phase === 'first') {
        halfTurnPhaseRef.current = 'pause'
        startedAtRef.current = performance.now()
        setHalfTurnState({ commandId: command.id, phase: 'pause' })
        invalidate()
        return
      }
      finishedRef.current = command.id
      onMoveComplete(command)
      return
    }
    const { axis, angle: target } = animationTurn(command.move)
    const progress = command.durationMs <= 0 ? 1 : Math.min(1, elapsedMs / command.durationMs)
    rotatingRef.current.rotation[axis] = target * easeInOutCubic(progress)
    if (progress < 1) {
      invalidate()
    } else {
      finishedRef.current = command.id
      onMoveComplete(command)
    }
  })

  const pulsingHalfTurn = Boolean(command?.move.endsWith('2') && command.durationMs > 0)
  const activeMove = pulsingHalfTurn
    ? halfTurnPhase === 'pause' ? null : command!.move[0] as CubeMove
    : command?.move ?? hintMove
  const layer = activeMove ? animationTurn(activeMove) : null
  const inLayer = (cubelet: Cubelet) => Boolean(command && layer && cubelet.position[axisIndex[layer.axis]] === layer.layer)
  const markedMove = (cubelet: Cubelet): CubeMove | null =>
    layer && activeMove && cubelet.position[axisIndex[layer.axis]] === layer.layer ? activeMove : null
  const arrowFace = activeMove?.[0] as Face | undefined
  const arrowNormal = arrowFace ? faceletPose(arrowFace, 4).normal : null

  return (
    <>
      <ambientLight intensity={1.25} />
      <directionalLight position={[5, 8, 6]} intensity={2.2} />
      <group ref={rotatingRef}>
        {cubelets.filter(inLayer).map((cubelet) => <CubeletMesh key={cubelet.key} cubelet={cubelet} colors={colors} showFaceNames={showFaceNames} markerMove={markedMove(cubelet)} markerPulse={pulsingHalfTurn} />)}
        {activeMove && arrowFace && arrowNormal && (
          <group position={arrowNormal.map((value) => value * 1.56) as [number, number, number]} rotation={stickerPlacement[arrowFace].rotation}>
            <TurnArrow3D key={command ? `${command.id}-${halfTurnPhase}` : 'hint'} move={activeMove} pulse={pulsingHalfTurn} dark={colors.body} light={colors.labelLight} />
          </group>
        )}
      </group>
      {cubelets.filter((cubelet) => !inLayer(cubelet)).map((cubelet) => <CubeletMesh key={cubelet.key} cubelet={cubelet} colors={colors} showFaceNames={showFaceNames} markerMove={markedMove(cubelet)} markerPulse={pulsingHalfTurn} />)}
      <OrbitControls enablePan={false} minDistance={5} maxDistance={10} enableDamping dampingFactor={0.12} />
    </>
  )
}

function ScanCubeScene({ faces: scannedFaces }: { faces: CubePreviewFaces }) {
  const cubelets = useMemo(() => makeCubelets(scannedFaces), [scannedFaces])
  const colors = useMemo(readCubeColors, [])
  return (
    <>
      <ambientLight intensity={1.25} />
      <directionalLight position={[5, 8, 6]} intensity={2.2} />
      {cubelets.map((cubelet) => <CubeletMesh key={cubelet.key} cubelet={cubelet} colors={colors} showFaceNames markerMove={null} markerPulse={false} />)}
      <OrbitControls enablePan={false} minDistance={5} maxDistance={10} enableDamping dampingFactor={0.12} />
    </>
  )
}

export function ScanRubikCube3D({ faces: scannedFaces, onWebGLError, ariaLabel = 'Mô hình khối Rubik ba chiều; mặt chưa quét có màu xám, kéo để xoay góc nhìn' }: {
  faces: CubePreviewFaces
  onWebGLError: () => void
  ariaLabel?: string
}) {
  return (
    <Canvas
      camera={{ position: [5.2, 4.2, 5.2], fov: 42 }}
      dpr={window.innerWidth < 640 ? 1 : [1, 1.5]}
      frameloop="demand"
      onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', onWebGLError, { once: true }) }}
      aria-label={ariaLabel}
    >
      <ScanCubeScene faces={scannedFaces} />
    </Canvas>
  )
}

export function RubikCube3D({ state, command, hintMove, showFaceNames, onMoveComplete, onWebGLError }: {
  state: CubeState
  command: MoveCommand | null
  hintMove: CubeMove | null
  showFaceNames: boolean
  onMoveComplete: (command: MoveCommand) => void
  onWebGLError: () => void
}) {
  return (
    <Canvas
      camera={{ position: [5.2, 4.2, 5.2], fov: 42 }}
      dpr={window.innerWidth < 640 ? 1 : [1, 1.5]}
      frameloop="demand"
      onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', onWebGLError, { once: true }) }}
      aria-label={`Mô hình khối Rubik ba chiều${command?.move ?? hintMove ? `, hướng xoay ${command?.move ?? hintMove}` : ''}; kéo để xoay góc nhìn`}
    >
      <CubeScene state={state} command={command} hintMove={hintMove} showFaceNames={showFaceNames} onMoveComplete={onMoveComplete} />
    </Canvas>
  )
}
