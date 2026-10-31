import { Sticker } from './ui'
import type { StickerColor } from '../types'

const colors: StickerColor[] = [
  'blue', 'yellow', 'red',
  'white', 'green', 'orange',
  'red', 'blue', 'yellow',
]

export function LogoMark({ large = false }: { large?: boolean }) {
  return (
    <div
      role="img"
      aria-label="Biểu tượng khối Rubik"
      className={`grid grid-cols-3 gap-1 ${large ? 'size-52' : 'size-9'}`}
    >
      {colors.map((color, index) => <Sticker key={index} color={color} />)}
    </div>
  )
}
