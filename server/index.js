import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = express()
const dist = path.join(root, 'dist')

if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*splat', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const port = Number(process.env.PORT) || 3001
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`마음 한 칸이 http://localhost:${port} 에서 실행 중입니다.`)
})

function shutdown() {
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
