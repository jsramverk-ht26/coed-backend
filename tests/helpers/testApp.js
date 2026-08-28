/**
 * testApp.js — creates a testable Express app connected to a given MongoDB db.
 *
 * The existing controllers (authController, fileController, userController)
 * use better-sqlite3 syntax and cannot be imported directly for MongoDB tests.
 * This helper re-implements all routes using the MongoDB db instance that is
 * passed in, following the same API contract as the production controllers.
 *
 * Routes mounted:
 *   POST   /api/auth/register
 *   POST   /api/auth/login
 *   GET    /api/users/me
 *   GET    /api/files
 *   POST   /api/files
 *   GET    /api/files/:id
 *   PUT    /api/files/:id/content
 *   DELETE /api/files/:id
 *   POST   /api/files/:id/comments
 *   GET    /api/files/:id/comments
 *   DELETE /api/comments/:commentId
 */

import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { ObjectId } from 'mongodb'

const JWT_SECRET = process.env.JWT_SECRET || 'coed-dev-secret-change-in-production'
const JWT_EXPIRES_IN = '7d'

// Lower rounds for speed in tests — DO NOT use in production.
const SALT_ROUNDS = 4

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

function sanitizeUser(user) {
  const { password, _id, ...rest } = user
  return { ...rest, id: _id.toString() }
}

function parseObjectId(str) {
  try {
    return new ObjectId(str)
  } catch {
    return null
  }
}

// ── JWT middleware (mirrors middleware/auth.js) ─────────────────────────────────

function authenticate(req, res, next) {
  const authHeader = req.headers['authorization']

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' })
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' })
    }
    return res.status(401).json({ error: 'Invalid token' })
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates and returns an Express app with all routes mounted.
 * @param {import('mongodb').Db} db  A connected MongoDB Db instance (e.g. from
 *                                    MongoMemoryServer).
 */
export function createTestApp(db) {
  const app = express()
  app.use(express.json())

  // No-op Socket.io mock so controllers that call req.io won't throw.
  app.use((req, _res, next) => {
    req.io = { to: () => ({ emit: () => {} }) }
    next()
  })

  // ── Auth routes ──────────────────────────────────────────────────────────────

  const authRouter = express.Router()

  authRouter.post('/register', async (req, res) => {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' })
    }
    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const existing = await db.collection('users').findOne({
      $or: [{ username: username.trim() }, { email: email.toLowerCase() }],
    })

    if (existing) {
      return res.status(409).json({ error: 'Username or email already in use' })
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS)
    const result = await db.collection('users').insertOne({
      username: username.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      created_at: new Date().toISOString(),
    })

    const user = await db.collection('users').findOne({ _id: result.insertedId })
    const token = generateToken(user)

    return res.status(201).json({ user: sanitizeUser(user), token })
  })

  authRouter.post('/login', async (req, res) => {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    const user = await db.collection('users').findOne({ username: username.trim() })

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    const token = generateToken(user)
    return res.json({ user: sanitizeUser(user), token })
  })

  app.use('/api/auth', authRouter)

  // ── Users routes ─────────────────────────────────────────────────────────────

  const usersRouter = express.Router()
  usersRouter.use(authenticate)

  usersRouter.get('/me', async (req, res) => {
    const oid = parseObjectId(req.user.id)
    if (!oid) return res.status(404).json({ error: 'User not found' })

    const user = await db.collection('users').findOne({ _id: oid })
    if (!user) return res.status(404).json({ error: 'User not found' })

    return res.json(sanitizeUser(user))
  })

  usersRouter.get('/search', async (req, res) => {
    const { username } = req.query
    if (!username) {
      return res.status(400).json({ error: 'Username query parameter required' })
    }

    const user = await db.collection('users').findOne(
      { username: username.trim() },
      { projection: { password: 0 } }
    )

    if (!user) {
      return res.status(404).json({ error: `User "${username}" not found` })
    }

    return res.json(sanitizeUser(user))
  })

  app.use('/api/users', usersRouter)

  // ── Files routes ──────────────────────────────────────────────────────────────

  const filesRouter = express.Router()
  filesRouter.use(authenticate)

  filesRouter.get('/', async (req, res) => {
    const userId = req.user.id
    const files = await db
      .collection('files')
      .find({ $or: [{ owner_id: userId }, { shared_with: userId }] })
      .sort({ updated_at: -1 })
      .toArray()

    return res.json(files.map(f => ({ ...f, id: f._id.toString() })))
  })

  filesRouter.post('/', async (req, res) => {
    const { name } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'File name is required' })
    }

    const now = new Date().toISOString()
    const result = await db.collection('files').insertOne({
      name: name.trim(),
      content: '',
      owner_id: req.user.id,
      owner_username: req.user.username,
      shared_with: [],
      created_at: now,
      updated_at: now,
    })

    const file = await db.collection('files').findOne({ _id: result.insertedId })
    return res.status(201).json({ ...file, id: file._id.toString() })
  })

  filesRouter.get('/:id', async (req, res) => {
    const oid = parseObjectId(req.params.id)
    if (!oid) return res.status(404).json({ error: 'File not found or access denied' })

    const userId = req.user.id
    const file = await db.collection('files').findOne({
      _id: oid,
      $or: [{ owner_id: userId }, { shared_with: userId }],
    })

    if (!file) return res.status(404).json({ error: 'File not found or access denied' })
    return res.json({ ...file, id: file._id.toString() })
  })

  filesRouter.put('/:id/content', async (req, res) => {
    const { content } = req.body
    if (content === undefined) {
      return res.status(400).json({ error: 'content is required' })
    }

    const oid = parseObjectId(req.params.id)
    if (!oid) return res.status(404).json({ error: 'File not found or access denied' })

    const userId = req.user.id
    const file = await db.collection('files').findOne({
      _id: oid,
      $or: [{ owner_id: userId }, { shared_with: userId }],
    })

    if (!file) return res.status(404).json({ error: 'File not found or access denied' })

    await db
      .collection('files')
      .updateOne({ _id: oid }, { $set: { content, updated_at: new Date().toISOString() } })

    return res.json({ message: 'Content updated' })
  })

  filesRouter.delete('/:id', async (req, res) => {
    const oid = parseObjectId(req.params.id)
    if (!oid) return res.status(404).json({ error: 'File not found' })

    const file = await db.collection('files').findOne({ _id: oid })
    if (!file) return res.status(404).json({ error: 'File not found' })

    if (file.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the file owner can delete this file' })
    }

    await db.collection('files').deleteOne({ _id: oid })
    return res.json({ message: 'File deleted' })
  })

  // Comments sub-routes (nested under /api/files/:id/comments)
  filesRouter.post('/:id/comments', async (req, res) => {
    const { line, text } = req.body
    if (!text || line === undefined) {
      return res.status(400).json({ error: 'line and text are required' })
    }

    const oid = parseObjectId(req.params.id)
    if (!oid) return res.status(404).json({ error: 'File not found' })

    const file = await db.collection('files').findOne({ _id: oid })
    if (!file) return res.status(404).json({ error: 'File not found' })

    const now = new Date().toISOString()
    const result = await db.collection('comments').insertOne({
      file_id: req.params.id,
      author_id: req.user.id,
      author_username: req.user.username,
      line: Number(line),
      text: String(text).trim(),
      created_at: now,
    })

    const comment = await db.collection('comments').findOne({ _id: result.insertedId })
    return res.status(201).json({ ...comment, id: comment._id.toString() })
  })

  filesRouter.get('/:id/comments', async (req, res) => {
    const comments = await db
      .collection('comments')
      .find({ file_id: req.params.id })
      .sort({ created_at: 1 })
      .toArray()

    return res.json(comments.map(c => ({ ...c, id: c._id.toString() })))
  })

  app.use('/api/files', filesRouter)

  // ── Comments delete route ─────────────────────────────────────────────────────

  const commentsRouter = express.Router()
  commentsRouter.use(authenticate)

  commentsRouter.delete('/:commentId', async (req, res) => {
    const oid = parseObjectId(req.params.commentId)
    if (!oid) return res.status(404).json({ error: 'Comment not found' })

    const comment = await db.collection('comments').findOne({ _id: oid })
    if (!comment) return res.status(404).json({ error: 'Comment not found' })

    if (comment.author_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the comment author can delete this comment' })
    }

    await db.collection('comments').deleteOne({ _id: oid })
    return res.json({ message: 'Comment deleted' })
  })

  app.use('/api/comments', commentsRouter)

  // ── Health check ──────────────────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // ── 404 fallback ──────────────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // ── Global error handler ──────────────────────────────────────────────────────

  app.use((err, _req, res, _next) => {
    console.error('[Test Error]', err)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
