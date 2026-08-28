/**
 * Authentication controller — register and login.
 * Uses MongoDB native driver via getDB().
 */

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { getDB } from '../config/db.js'
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/env.js'

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

export async function register(req, res) {
  const { username, email, password } = req.body

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'username, email and password are required' })
  }

  if (username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  try {
    const db = getDB()

    const existing = await db.collection('users').findOne({
      $or: [{ username: username.trim() }, { email: email.trim().toLowerCase() }],
    })

    if (existing) {
      if (existing.username === username.trim()) {
        return res.status(409).json({ error: 'Username already taken' })
      }
      return res.status(409).json({ error: 'Email already registered' })
    }

    const hashed = await bcrypt.hash(password, 12)

    const result = await db.collection('users').insertOne({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      createdAt: new Date(),
    })

    const user = await db.collection('users').findOne({ _id: result.insertedId })
    const token = signToken(user)

    return res.status(201).json({ user: sanitizeUser(user), token })
  } catch (err) {
    // Duplicate key error from MongoDB unique index
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0]
      if (key === 'email') return res.status(409).json({ error: 'Email already registered' })
      return res.status(409).json({ error: 'Username already taken' })
    }
    console.error('[register]', err)
    return res.status(500).json({ error: 'Registration failed' })
  }
}

export async function login(req, res) {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' })
  }

  try {
    const db = getDB()

    const user = await db.collection('users').findOne({ username: username.trim() })

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' })
    }

    const token = signToken(user)

    return res.json({ user: sanitizeUser(user), token })
  } catch (err) {
    console.error('[login]', err)
    return res.status(500).json({ error: 'Login failed' })
  }
}
