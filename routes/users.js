import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import {
  getProfile,
  updateProfile,
  changePassword,
  searchUser,
} from '../controllers/userController.js'

const router = Router()

router.get('/me', authenticate, getProfile)
router.patch('/me', authenticate, updateProfile)
router.post('/me/password', authenticate, changePassword)
router.get('/search', authenticate, searchUser)

export default router
