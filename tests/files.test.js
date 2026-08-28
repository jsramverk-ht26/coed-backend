/**
 * tests/files.test.js
 *
 * Integration tests for the /api/files endpoints.
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
let createdFileId

const TEST_USER = {
  username: 'fileuser',
  email: 'fileuser@example.com',
  password: 'testpassword1',
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  const uri = mongoServer.getUri()

  process.env.MONGODB_URI = uri

  mongoClient = new MongoClient(uri)
  await mongoClient.connect()
  db = mongoClient.db('coed-test-files')

  await db.collection('users').createIndex({ username: 1 }, { unique: true })
  await db.collection('users').createIndex({ email: 1 }, { unique: true })

  app = createTestApp(db)

  // Register and log in once for all file tests.
  const res = await request(app).post('/api/auth/register').send(TEST_USER)
  expect(res.status).toBe(201)
  authToken = res.body.token
})

afterAll(async () => {
  await mongoClient.close()
  await mongoServer.stop()
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function authHeader() {
  return { Authorization: `Bearer ${authToken}` }
}

// ── POST /api/files ────────────────────────────────────────────────────────────

describe('POST /api/files', () => {
  test('creates a file and returns 201 with the file object', async () => {
    const res = await request(app)
      .post('/api/files')
      .set(authHeader())
      .send({ name: 'hello.js' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'hello.js', content: '' })
    expect(res.body).toHaveProperty('id')
    expect(res.body).toHaveProperty('owner_id')

    // Store the ID for subsequent tests.
    createdFileId = res.body.id
  })

  test('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/files')
      .set(authHeader())
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  test('returns 401 without an auth token', async () => {
    const res = await request(app).post('/api/files').send({ name: 'secret.js' })
    expect(res.status).toBe(401)
  })
})

// ── GET /api/files ─────────────────────────────────────────────────────────────

describe('GET /api/files', () => {
  test('returns an array that includes the previously created file', async () => {
    const res = await request(app).get('/api/files').set(authHeader())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)

    const found = res.body.find(f => f.id === createdFileId)
    expect(found).toBeDefined()
    expect(found.name).toBe('hello.js')
  })

  test('returns 401 without an auth token', async () => {
    const res = await request(app).get('/api/files')
    expect(res.status).toBe(401)
  })
})

// ── GET /api/files/:id ─────────────────────────────────────────────────────────

describe('GET /api/files/:id', () => {
  test('returns the file with its content field', async () => {
    const res = await request(app)
      .get(`/api/files/${createdFileId}`)
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: createdFileId, name: 'hello.js' })
    expect(res.body).toHaveProperty('content')
  })

  test('returns 404 for a non-existent file id', async () => {
    const fakeId = '000000000000000000000000'
    const res = await request(app).get(`/api/files/${fakeId}`).set(authHeader())

    expect(res.status).toBe(404)
  })

  test('returns 401 without an auth token', async () => {
    const res = await request(app).get(`/api/files/${createdFileId}`)
    expect(res.status).toBe(401)
  })
})

// ── PUT /api/files/:id/content ────────────────────────────────────────────────

describe('PUT /api/files/:id/content', () => {
  test('updates file content and returns 200', async () => {
    const newContent = 'console.log("hello world")'

    const res = await request(app)
      .put(`/api/files/${createdFileId}/content`)
      .set(authHeader())
      .send({ content: newContent })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('message')

    // Verify the content was actually saved.
    const getRes = await request(app)
      .get(`/api/files/${createdFileId}`)
      .set(authHeader())
    expect(getRes.body.content).toBe(newContent)
  })

  test('returns 400 when content field is absent', async () => {
    const res = await request(app)
      .put(`/api/files/${createdFileId}/content`)
      .set(authHeader())
      .send({})

    expect(res.status).toBe(400)
  })

  test('returns 401 without an auth token', async () => {
    const res = await request(app)
      .put(`/api/files/${createdFileId}/content`)
      .send({ content: 'x' })
    expect(res.status).toBe(401)
  })
})

// ── DELETE /api/files/:id ─────────────────────────────────────────────────────

describe('DELETE /api/files/:id', () => {
  test('deletes the file and returns 200', async () => {
    // Create a fresh file specifically for deletion.
    const createRes = await request(app)
      .post('/api/files')
      .set(authHeader())
      .send({ name: 'to-delete.txt' })
    expect(createRes.status).toBe(201)
    const fileId = createRes.body.id

    const delRes = await request(app)
      .delete(`/api/files/${fileId}`)
      .set(authHeader())

    expect(delRes.status).toBe(200)
    expect(delRes.body).toHaveProperty('message')

    // Confirm the file is gone.
    const getRes = await request(app).get(`/api/files/${fileId}`).set(authHeader())
    expect(getRes.status).toBe(404)
  })

  test('returns 403 when a non-owner tries to delete', async () => {
    // Register a second user.
    const res2 = await request(app)
      .post('/api/auth/register')
      .send({ username: 'other', email: 'other@example.com', password: 'password99' })
    expect(res2.status).toBe(201)
    const otherToken = res2.body.token

    const delRes = await request(app)
      .delete(`/api/files/${createdFileId}`)
      .set({ Authorization: `Bearer ${otherToken}` })

    expect(delRes.status).toBe(403)
  })

  test('returns 401 without an auth token', async () => {
    const res = await request(app).delete(`/api/files/${createdFileId}`)
    expect(res.status).toBe(401)
  })
})
