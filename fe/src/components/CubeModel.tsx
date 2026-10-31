import { Sticker } from './ui'
import type { CubeState, FaceColors } from '../types'

function ModelFace({ colors, position }: { colors: FaceColors; position: 'front' | 'top' | 'right' }) {
  return (
    <div className={`cube-model-face cube-model-face-${position}`}>
      {colors.map((color, index) => <Sticker key={index} color={color} />)}
    </div>
  )
}

export function CubeModel({ cubeState }: { cubeState: CubeState }) {
  return (
    <div role="img" aria-label="Mô hình khối Rubik ba chiều" className="cube-model-scene">
      <div className="cube-model">
        <ModelFace colors={cubeState.F} position="front" />
        <ModelFace colors={cubeState.U} position="top" />
        <ModelFace colors={cubeState.R} position="right" />
      </div>
    </div>
  )
}
