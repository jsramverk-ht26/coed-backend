/**
 * coed — collaborative code editor
 * Main server entry point.
 *
 * Stack:
 *   - Node.js 22 (ES modules)
 *   - Express  — HTTP API
 *   - Socket.io — real-time collaboration
 *   - MongoDB  — persistence (native driver)
 */

import { createServer } from 'node:http'
import express from 'express'
import { Server as SocketServer } from 'socket.io'

import { connectDB } from './config/db.js'
import { PORT, CORS_ORIGIN } from './config/env.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import fileRoutes from './routes/files.js'
import commentRoutes from './routes/comments.js'
import { registerCollaboration } from './socket/collaboration.js'

// ── Express app ───────────────────────────────────────────────────────────────

const app = express()

// CORS — allow the Vite dev server (and configurable origins)
app.use((req, res, next) => {
  const allowed = CORS_ORIGIN.split(',').map(o => o.trim())
  const origin = req.headers.origin

  if (!origin || allowed.includes(origin) || allowed.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*')
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  res.setHeader('Access-Control-Allow-Credentials', 'true')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  next()
})

app.use(express.json())

// ── HTTP + Socket.io server (created before routes so io is available) ────────

const httpServer = createServer(app)

const io = new SocketServer(httpServer, {
  cors: {
    origin: CORS_ORIGIN.split(',').map(o => o.trim()),
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

registerCollaboration(io)

// ── Attach io to every request ────────────────────────────────────────────────

app.use((req, _res, next) => {
  req.io = io
  next()
})

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/files', fileRoutes)
app.use('/api/comments', commentRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Error]', err)
  res.status(500).json({ error: 'Internal server error' })
})

// ── Start ─────────────────────────────────────────────────────────────────────

await connectDB()

httpServer.listen(PORT, () => {
  console.log(`coed server running on http://localhost:${PORT}`)
  console.log(`  API: http://localhost:${PORT}/api`)
  console.log(`  WS:  ws://localhost:${PORT}`)
})
