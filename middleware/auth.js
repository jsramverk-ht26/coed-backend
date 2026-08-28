/**
 * JWT authentication middleware.
 * Verifies Bearer token in Authorization header and attaches user to req.user.
 */

import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config/env.js'

export function authenticate(req, res, next) {
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
