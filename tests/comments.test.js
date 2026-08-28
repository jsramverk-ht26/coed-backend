/**
 * tests/comments.test.js
 *
 * Integration tests for the comments endpoints:
 *   POST   /api/files/:id/comments
 *   GET    /api/files/:id/comments
 *   DELETE /api/comments/:commentId
 *
 * Uses mongodb-memory-server for an isolated in-memory database.
 */

import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import request from 'supertest'
import { createTestApp } from './helpers/testApp.js'

let mongoServer
let mongoClient
let db
let app
let authToken
let fileId
let commentId

const TEST_USER = {
  username: 'commentuser',
  email: 'commentuser@example.com',
  password: 'testpassword1',
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  const uri = mongoServer.getUri()

  process.env.MONGODB_URI = uri

  mongoClient = new MongoClient(uri)
  await mongoClient.connect()
  db = mongoClient.db('coed-test-comments')

  await db.collection('users').createIndex({ username: 1 }, { unique: true })
  await db.collection('users').createIndex({ email: 1 }, { unique: true })

  app = createTestApp(db)

  // Register and log in.
  const registerRes = await request(app).post('/api/auth/register').send(TEST_USER)
  expect(registerRes.status).toBe(201)
  authToken = registerRes.body.token

  // Create a file to attach comments to.
  const fileRes = await request(app)
    .post('/api/files')
    .set({ Authorization: `Bearer ${authToken}` })
    .send({ name: 'commented.js' })
  expect(fileRes.status).toBe(201)
  fileId = fileRes.body.id
})

afterAll(async () => {
  await mongoClient.close()
  await mongoServer.stop()
})

function authHeader() {
  return { Authorization: `Bearer ${authToken}` }
}

// ── POST /api/files/:id/comments ─────────────────────────────────────────────

describe('POST /api/files/:id/comments', () => {
  test('creates a comment and returns 201', async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/comments`)
      .set(authHeader())
      .send({ line: 5, text: 'This is a comment' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      file_id: fileId,
      line: 5,
      text: 'This is a comment',
      author_username: TEST_USER.username,
    })
    expect(res.body).toHaveProperty('id')

    // Store the comment ID for subsequent tests.
    commentId = res.body.id
  })

  test('returns 400 when line is missing', async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/comments`)
      .set(authHeader())
      .send({ text: 'Missing line number' })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  test('returns 400 when text is missing', async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/comments`)
      .set(authHeader())
      .send({ line: 1 })

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  test('returns 404 for a non-existent file', async () => {
    const fakeId = '000000000000000000000000'
    const res = await request(app)
      .post(`/api/files/${fakeId}/comments`)
      .set(authHeader())
      .send({ line: 1, text: 'ghost comment' })

    expect(res.status).toBe(404)
  })

  test('returns 401 without an auth token', async () => {
    const res = await request(app)
      .post(`/api/files/${fileId}/comments`)
      .send({ line: 1, text: 'unauthorized' })

    expect(res.status).toBe(401)
  })
})

// ── GET /api/files/:id/comments ───────────────────────────────────────────────

describe('GET /api/files/:id/comments', () => {
  test('returns an array containing the created comment', async () => {
    const res = await request(app)
      .get(`/api/files/${fileId}/comments`)
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)

    const found = res.body.find(c => c.id === commentId)
    expect(found).toBeDefined()
    expect(found.text).toBe('This is a comment')
    expect(found.line).toBe(5)
  })

  test('returns an empty array for a file with no comments', async () => {
    // Create another file with no comments.
    const newFile = await request(app)
      .post('/api/files')
      .set(authHeader())
      .send({ name: 'empty.js' })
    expect(newFile.status).toBe(201)

    const res = await request(app)
      .get(`/api/files/${newFile.body.id}/comments`)
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(0)
  })

  test('returns 401 without an auth token', async () => {
    const res = await request(app).get(`/api/files/${fileId}/comments`)
    expect(res.status).toBe(401)
  })
})

// ── DELETE /api/comments/:commentId ──────────────────────────────────────────

describe('DELETE /api/comments/:commentId', () => {
  test('deletes a comment by its owner and returns 200', async () => {
    // Create a fresh comment so this test is self-contained.
    const createRes = await request(app)
      .post(`/api/files/${fileId}/comments`)
      .set(authHeader())
      .send({ line: 10, text: 'To be deleted' })
    expect(createRes.status).toBe(201)
    const toDeleteId = createRes.body.id

    const delRes = await request(app)
      .delete(`/api/comments/${toDeleteId}`)
      .set(authHeader())

    expect(delRes.status).toBe(200)
    expect(delRes.body).toHaveProperty('message')

    // Confirm the comment is gone from the file's list.
    const listRes = await request(app)
      .get(`/api/files/${fileId}/comments`)
      .set(authHeader())
    expect(listRes.body.find(c => c.id === toDeleteId)).toBeUndefined()
  })

  test('returns 403 when a non-author tries to delete', async () => {
    // Register a second user.
    const otherRes = await request(app)
      .post('/api/auth/register')
      .send({ username: 'othercmt', email: 'othercmt@example.com', password: 'password99' })
    expect(otherRes.status).toBe(201)
    const otherToken = otherRes.body.token

    const delRes = await request(app)
      .delete(`/api/comments/${commentId}`)
      .set({ Authorization: `Bearer ${otherToken}` })

    expect(delRes.status).toBe(403)
  })

  test('returns 404 for a non-existent comment id', async () => {
    const fakeId = '000000000000000000000000'
    const res = await request(app)
      .delete(`/api/comments/${fakeId}`)
      .set(authHeader())

    expect(res.status).toBe(404)
  })

  test('returns 401 without an auth token', async () => {
    const res = await request(app).delete(`/api/comments/${commentId}`)
    expect(res.status).toBe(401)
  })
})
