/** Run from fe/: node scripts/kociemba-compat.mjs */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { transformWithOxc } from 'vite'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const cubeSource = readFileSync(resolve(scriptDir, '../src/lib/cube/index.ts'), 'utf8')
const compiled = (await transformWithOxc(cubeSource, 'cube.ts')).code
const { applyMoves, isSolved } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const faceOrder = ['U', 'R', 'F', 'D', 'L', 'B']
const colorToFace = { white: 'U', red: 'R', green: 'F', yellow: 'D', orange: 'L', blue: 'B' }
const solved = {
  U: Array(9).fill('white'), R: Array(9).fill('red'), F: Array(9).fill('green'),
  D: Array(9).fill('yellow'), L: Array(9).fill('orange'), B: Array(9).fill('blue'),
}
const moves = faceOrder.flatMap((face) => [face, `${face}'`, `${face}2`])

// Fixed seed gives reproducible cases without depending on a random package.
let seed = 0x7a4b1c0d
function randomIndex(max) {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return (seed >>> 0) % max
}
const scrambles = Array.from({ length: 50 }, () => Array.from({ length: 20 }, () => moves[randomIndex(moves.length)]))
const scrambledStates = scrambles.map((scramble) => applyMoves(solved, scramble))
const facelets = scrambledStates.map((state) => faceOrder.flatMap((face) => state[face].map((color) => colorToFace[color])).join(''))

const python = process.env.RUBIK_BE_PYTHON ?? resolve(scriptDir, '../../be/.venv-clean/Scripts/python.exe')
const result = spawnSync(python, [resolve(scriptDir, 'kociemba_solve.py')], {
  input: JSON.stringify(facelets.map((value, index) => ({ facelets: value, state: scrambledStates[index] }))),
  encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 120_000,
})
if (result.error || result.status !== 0) {
  console.error(`Kociemba failed: ${result.error?.message ?? result.stderr}`)
  process.exit(1)
}

const solutions = JSON.parse(result.stdout)
let failures = 0
for (let index = 0; index < scrambles.length; index += 1) {
  const solution = solutions[index].trim().split(/\s+/)
  try {
    const finalState = applyMoves(scrambledStates[index], solution)
    if (isSolved(finalState)) continue
  } catch (error) {
    console.error(`Case ${index + 1}: ${error}`)
  }
  failures += 1
  console.error(JSON.stringify({ case: index + 1, scramble: scrambles[index], facelets: facelets[index], solution }))
}
console.log(`Kociemba compatibility: ${scrambles.length - failures}/${scrambles.length} solved (20 moves each)`)
if (failures) process.exitCode = 1
