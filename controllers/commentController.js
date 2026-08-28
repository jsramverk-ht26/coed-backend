/**
 * Comment controller — per-line comments on files.
 * Uses MongoDB native driver via getDB().
 * Emits Socket.io events for real-time comment updates.
 */

import { ObjectId } from 'mongodb'
import { getDB } from '../config/db.js'

function toId(id) {
  return new ObjectId(id)
}

function isValidId(id) {
  return ObjectId.isValid(id)
}

// ── Get comments ──────────────────────────────────────────────────────────────

export async function getComments(req, res) {
  const { id: fileId } = req.params

  try {
    const db = getDB()

    const comments = await db
      .collection('comments')
      .find({ fileId })
      .sort({ line: 1 })
      .toArray()

    return res.json(
      comments.map(c => ({
        id: c._id.toString(),
        fileId: c.fileId,
        userId: c.userId,
        username: c.username,
        line: c.line,
        text: c.text,
        createdAt: c.createdAt,
      }))
    )
  } catch (err) {
    console.error('[getComments]', err)
    return res.status(500).json({ error: 'Failed to get comments' })
  }
}

// ── Add comment ───────────────────────────────────────────────────────────────

export async function addComment(req, res) {
  const { id: fileId } = req.params
  const { line, text } = req.body
  const { id: userId, username } = req.user

  if (!Number.isInteger(line) || line < 1) {
    return res.status(400).json({ error: 'line must be an integer >= 1' })
  }

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text must not be empty' })
  }

  try {
    const db = getDB()

    const doc = {
      fileId,
      userId,
      username,
      line,
      text: text.trim(),
      createdAt: new Date(),
    }

    const result = await db.collection('comments').insertOne(doc)

    const comment = {
      id: result.insertedId.toString(),
      fileId: doc.fileId,
      userId: doc.userId,
      username: doc.username,
      line: doc.line,
      text: doc.text,
      createdAt: doc.createdAt,
    }

    req.io.to(`file:${fileId}`).emit('new-comment', comment)

    return res.status(201).json(comment)
  } catch (err) {
    console.error('[addComment]', err)
    return res.status(500).json({ error: 'Failed to add comment' })
  }
}

// ── Delete comment ────────────────────────────────────────────────────────────

export async function deleteComment(req, res) {
  const { commentId } = req.params
  const { id: userId } = req.user

  if (!isValidId(commentId)) {
    return res.status(404).json({ error: 'Comment not found' })
  }

  try {
    const db = getDB()

    const comment = await db.collection('comments').findOne({ _id: toId(commentId) })

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' })
    }

    if (comment.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own comments' })
    }

    await db.collection('comments').deleteOne({ _id: toId(commentId) })

    req.io
      .to(`file:${comment.fileId}`)
      .emit('comment-deleted', { commentId })

    return res.json({ message: 'Comment deleted' })
  } catch (err) {
    console.error('[deleteComment]', err)
    return res.status(500).json({ error: 'Failed to delete comment' })
  }
}
