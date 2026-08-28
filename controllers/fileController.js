/**
 * File controller — CRUD for files and sharing.
 * Uses MongoDB native driver via getDB().
 */

import { ObjectId } from 'mongodb'
import { getDB } from '../config/db.js'

const LANGUAGE_MAP = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  py: 'python',
  rb: 'ruby',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  json: 'json',
  md: 'markdown',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',
}

function getLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return LANGUAGE_MAP[ext] || 'plaintext'
}

function toId(id) {
  return new ObjectId(id)
}

function isValidId(id) {
  return ObjectId.isValid(id)
}

// ── List files ────────────────────────────────────────────────────────────────

export async function listFiles(req, res) {
  const userId = req.user.id

  try {
    const db = getDB()

    // Get file IDs shared with this user
    const sharedDocs = await db
      .collection('shares')
      .find({ userId })
      .toArray()

    const sharedFileIds = sharedDocs.map(s => s.fileId)

    // Get all owned files
    const ownedFiles = await db
      .collection('files')
      .find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .toArray()

    // Get all shared files (not owned)
    const sharedFiles =
      sharedFileIds.length > 0
        ? await db
            .collection('files')
            .find({
              _id: { $in: sharedFileIds.filter(id => isValidId(id)).map(id => toId(id)) },
              ownerId: { $ne: userId },
            })
            .sort({ createdAt: -1 })
            .toArray()
        : []

    const owned = ownedFiles.map(f => ({
      id: f._id.toString(),
      name: f.name,
      ownerId: f.ownerId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      is_shared: false,
      language: getLanguage(f.name),
    }))

    const shared = sharedFiles.map(f => ({
      id: f._id.toString(),
      name: f.name,
      ownerId: f.ownerId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      is_shared: true,
      language: getLanguage(f.name),
    }))

    return res.json([...owned, ...shared])
  } catch (err) {
    console.error('[listFiles]', err)
    return res.status(500).json({ error: 'Failed to list files' })
  }
}

// ── Create file ───────────────────────────────────────────────────────────────

export async function createFile(req, res) {
  const { name } = req.body
  const userId = req.user.id

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'File name is required' })
  }

  try {
    const db = getDB()

    const doc = {
      name: name.trim(),
      content: '',
      ownerId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const result = await db.collection('files').insertOne(doc)

    return res.status(201).json({
      id: result.insertedId.toString(),
      name: doc.name,
      content: doc.content,
      ownerId: doc.ownerId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      language: getLanguage(doc.name),
    })
  } catch (err) {
    console.error('[createFile]', err)
    return res.status(500).json({ error: 'Failed to create file' })
  }
}

// ── Get file ──────────────────────────────────────────────────────────────────

export async function getFile(req, res) {
  const userId = req.user.id

  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'File not found' })
  }

  try {
    const db = getDB()
    const fileId = toId(req.params.id)

    const file = await db.collection('files').findOne({ _id: fileId })

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    const isOwner = file.ownerId === userId

    if (!isOwner) {
      const share = await db
        .collection('shares')
        .findOne({ fileId: file._id.toString(), userId })

      if (!share) {
        return res.status(403).json({ error: 'Access denied' })
      }
    }

    return res.json({
      id: file._id.toString(),
      name: file.name,
      content: file.content,
      ownerId: file.ownerId,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      is_shared: !isOwner,
      language: getLanguage(file.name),
    })
  } catch (err) {
    console.error('[getFile]', err)
    return res.status(500).json({ error: 'Failed to get file' })
  }
}

// ── Update file content ───────────────────────────────────────────────────────

export async function updateFileContent(req, res) {
  const userId = req.user.id
  const { content } = req.body

  if (content === undefined) {
    return res.status(400).json({ error: 'content is required' })
  }

  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'File not found' })
  }

  try {
    const db = getDB()
    const fileId = toId(req.params.id)

    const file = await db.collection('files').findOne({ _id: fileId })

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    const isOwner = file.ownerId === userId

    if (!isOwner) {
      const share = await db
        .collection('shares')
        .findOne({ fileId: file._id.toString(), userId })

      if (!share) {
        return res.status(403).json({ error: 'Access denied' })
      }
    }

    const updatedAt = new Date()
    await db
      .collection('files')
      .updateOne({ _id: fileId }, { $set: { content, updatedAt } })

    return res.json({ id: file._id.toString(), updatedAt })
  } catch (err) {
    console.error('[updateFileContent]', err)
    return res.status(500).json({ error: 'Failed to update file' })
  }
}

// ── Delete file ───────────────────────────────────────────────────────────────

export async function deleteFile(req, res) {
  const userId = req.user.id

  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'File not found' })
  }

  try {
    const db = getDB()
    const fileId = toId(req.params.id)

    const file = await db.collection('files').findOne({ _id: fileId })

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    if (file.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the owner can delete this file' })
    }

    await db.collection('files').deleteOne({ _id: fileId })

    // Clean up shares and comments for this file
    await db.collection('shares').deleteMany({ fileId: file._id.toString() })
    await db.collection('comments').deleteMany({ fileId: file._id.toString() })

    return res.json({ message: 'File deleted' })
  } catch (err) {
    console.error('[deleteFile]', err)
    return res.status(500).json({ error: 'Failed to delete file' })
  }
}

// ── List shares ───────────────────────────────────────────────────────────────

export async function listShares(req, res) {
  const userId = req.user.id

  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'File not found' })
  }

  try {
    const db = getDB()
    const fileId = toId(req.params.id)

    const file = await db.collection('files').findOne({ _id: fileId })

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    if (file.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the owner can view shares' })
    }

    const shares = await db
      .collection('shares')
      .find({ fileId: file._id.toString() })
      .toArray()

    // Join with user info
    const result = await Promise.all(
      shares.map(async share => {
        const user = isValidId(share.userId)
          ? await db.collection('users').findOne({ _id: toId(share.userId) })
          : await db.collection('users').findOne({ _id: share.userId })

        return {
          userId: share.userId,
          username: user?.username ?? '(unknown)',
          email: user?.email ?? '',
          sharedAt: share.createdAt,
        }
      })
    )

    return res.json(result)
  } catch (err) {
    console.error('[listShares]', err)
    return res.status(500).json({ error: 'Failed to list shares' })
  }
}

// ── Share file ────────────────────────────────────────────────────────────────

export async function shareFile(req, res) {
  const userId = req.user.id
  const { username } = req.body

  if (!username) {
    return res.status(400).json({ error: 'username is required' })
  }

  if (!isValidId(req.params.id)) {
    return res.status(404).json({ error: 'File not found' })
  }

  try {
    const db = getDB()
    const fileId = toId(req.params.id)

    const file = await db.collection('files').findOne({ _id: fileId })

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    if (file.ownerId !== userId) {
      return res.status(403).json({ error: 'Only the owner can share this file' })
    }

    const targetUser = await db.collection('users').findOne({ username: username.trim() })

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (targetUser._id.toString() === userId) {
      return res.status(400).json({ error: 'Cannot share a file with yourself' })
    }

    const targetId = targetUser._id.toString()
    const fileIdStr = file._id.toString()

    const existing = await db
      .collection('shares')
      .findOne({ fileId: fileIdStr, userId: targetId })

    if (existing) {
      return res.status(409).json({ error: 'File already shared with this user' })
    }

    await db.collection('shares').insertOne({
      fileId: fileIdStr,
      userId: targetId,
      createdAt: new Date(),
    })

    return res.status(201).json({
      fileId: fileIdStr,
      userId: targetId,
      username: targetUser.username,
    })
  } catch (err) {
    console.error('[shareFile]', err)
    return res.status(500).json({ error: 'Failed to share file' })
  }
}

// ── Remove share ──────────────────────────────────────────────────────────────

export async function removeShare(req, res) {
  const userId = req.user.id
  const { id: rawFileId, userId: targetUserId } = req.params

  if (!isValidId(rawFileId)) {
    return res.status(404).json({ error: 'File not found' })
  }

  try {
    const db = getDB()
    const fileId = toId(rawFileId)

    const file = await db.collection('files').findOne({ _id: fileId })

    if (!file) {
      return res.status(404).json({ error: 'File not found' })
    }

    const isOwner = file.ownerId === userId
    const isSelf = targetUserId === userId

    if (!isOwner && !isSelf) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const result = await db
      .collection('shares')
      .deleteOne({ fileId: file._id.toString(), userId: targetUserId })

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Share not found' })
    }

    return res.json({ message: 'Share removed' })
  } catch (err) {
    console.error('[removeShare]', err)
    return res.status(500).json({ error: 'Failed to remove share' })
  }
}
