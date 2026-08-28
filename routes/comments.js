import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { deleteComment } from '../controllers/commentController.js'

const router = Router()

router.delete('/:commentId', authenticate, deleteComment)

export default router
