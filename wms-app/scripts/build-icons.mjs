import sharp from 'sharp'
import { fileURLToPath } from 'url'
import path from 'path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const src = path.join(dir, 'icon-source.svg')
const outDir = path.join(dir, '..', 'public')

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32.png', size: 32 },
]

for (const t of targets) {
  await sharp(src).resize(t.size, t.size).png().toFile(path.join(outDir, t.file))
  console.log('wrote', t.file)
}
