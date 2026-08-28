/**
 * tests/auth.test.js
 *
 * Integration tests for POST /api/auth/register and POST /api/auth/login.
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

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  const uri = mongoServer.getUri()

  process.env.MONGODB_URI = uri

  mongoClient = new MongoClient(uri)
  await mongoClient.connect()
  db = mongoClient.db('coed-test')

  // Unique indexes mirror production setup.
  await db.collection('users').createIndex({ username: 1 }, { unique: true })
  await db.collection('users').createIndex({ email: 1 }, { unique: true })

  app = createTestApp(db)
})

afterAll(async () => {
  await mongoClient.close()
  await mongoServer.stop()
})

afterEach(async () => {
  // Clean up between tests so each test starts with an empty database.
  await db.collection('users').deleteMany({})
})

// ── Register ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  test('returns 201 and a token when given valid data', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'alice@example.com', password: 'secret123' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('token')
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user).toMatchObject({ username: 'alice', email: 'alice@example.com' })
    // Password must not be returned.
    expect(res.body.user).not.toHaveProperty('password')
  })

  test('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'bob' }) // email and password missing

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  test('returns 400 when username is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ab', email: 'ab@example.com', password: 'secret123' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/username/i)
  })

  test('returns 400 when email is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'charlie', email: 'not-an-email', password: 'secret123' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/email/i)
  })

  test('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'charlie', email: 'charlie@example.com', password: 'short' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/password/i)
  })

  test('returns 409 when username is already taken', async () => {
    const userData = { username: 'alice', email: 'alice@example.com', password: 'secret123' }

    // Register once successfully.
    await request(app).post('/api/auth/register').send(userData)

    // Second attempt with same username (different email).
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'alice2@example.com', password: 'secret123' })

    expect(res.status).toBe(409)
    expect(res.body).toHaveProperty('error')
  })
})

// ── Login ──────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    // Pre-register a user before each login test.
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', email: 'alice@example.com', password: 'secret123' })
  })

  test('returns 200 and a token with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'secret123' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(typeof res.body.token).toBe('string')
    expect(res.body.user).toMatchObject({ username: 'alice' })
    expect(res.body.user).not.toHaveProperty('password')
  })

  test('returns 401 with wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'wrongpassword' })

    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })

  test('returns 401 with unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'secret123' })

    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })

  test('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice' }) // password missing

    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })
})
