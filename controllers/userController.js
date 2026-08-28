/**
 * User controller — profile management and user search.
 * Uses MongoDB native driver via getDB().
 */

import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb'
import { getDB } from '../config/db.js'

function toId(id) {
  return new ObjectId(id)
}

// ── Get profile ───────────────────────────────────────────────────────────────

export async function getProfile(req, res) {
  try {
    const db = getDB()
    const user = await db.collection('users').findOne({ _id: toId(req.user.id) })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
    })
  } catch (err) {
    console.error('[getProfile]', err)
    return res.status(500).json({ error: 'Failed to get profile' })
  }
}

// ── Update profile ────────────────────────────────────────────────────────────

export async function updateProfile(req, res) {
  const { username, email } = req.body
  const userId = req.user.id

  if (!username && !email) {
    return res.status(400).json({ error: 'Provide username or email to update' })
  }

  if (username !== undefined && username.trim().length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' })
  }

  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' })
    }
  }

  try {
    const db = getDB()

    // Check for conflicts with other users
    if (username || email) {
      const conditions = []
      if (username) conditions.push({ username: username.trim() })
      if (email) conditions.push({ email: email.trim().toLowerCase() })

      const conflict = await db.collection('users').findOne({
        _id: { $ne: toId(userId) },
        $or: conditions,
      })

      if (conflict) {
        if (username && conflict.username === username.trim()) {
          return res.status(409).json({ error: 'Username already taken' })
        }
        return res.status(409).json({ error: 'Email already registered' })
      }
    }

    const update = {}
    if (username) update.username = username.trim()
    if (email) update.email = email.trim().toLowerCase()

    await db.collection('users').updateOne({ _id: toId(userId) }, { $set: update })

    const updated = await db.collection('users').findOne({ _id: toId(userId) })

    return res.json({
      id: updated._id.toString(),
      username: updated.username,
      email: updated.email,
      createdAt: updated.createdAt,
    })
  } catch (err) {
    if (err.code === 11000) {
      const key = Object.keys(err.keyPattern || {})[0]
      if (key === 'email') return res.status(409).json({ error: 'Email already registered' })
      return res.status(409).json({ error: 'Username already taken' })
    }
    console.error('[updateProfile]', err)
    return res.status(500).json({ error: 'Failed to update profile' })
  }
}

// ── Change password ───────────────────────────────────────────────────────────

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body
  const userId = req.user.id

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' })
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' })
  }

  try {
    const db = getDB()
    const user = await db.collection('users').findOne({ _id: toId(userId) })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    const match = await bcrypt.compare(currentPassword, user.password)

    if (!match) {
      return res.status(401).json({ error: 'Current password is incorrect' })
    }

    const hashed = await bcrypt.hash(newPassword, 12)

    await db.collection('users').updateOne({ _id: toId(userId) }, { $set: { password: hashed } })

    return res.json({ message: 'Password updated' })
  } catch (err) {
    console.error('[changePassword]', err)
    return res.status(500).json({ error: 'Failed to change password' })
  }
}

// ── Search user ───────────────────────────────────────────────────────────────

export async function searchUser(req, res) {
  const { username } = req.query

  if (!username) {
    return res.status(400).json({ error: 'username query parameter is required' })
  }

  try {
    const db = getDB()
    const user = await db.collection('users').findOne({ username: username.trim() })

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.json({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
    })
  } catch (err) {
    console.error('[searchUser]', err)
    return res.status(500).json({ error: 'Failed to search for user' })
  }
}
