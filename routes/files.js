import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import {
  listFiles,
  createFile,
  getFile,
  updateFileContent,
  deleteFile,
  listShares,
  shareFile,
  removeShare,
} from '../controllers/fileController.js'
import { getComments, addComment } from '../controllers/commentController.js'

const router = Router()

// All file routes require authentication
router.use(authenticate)

router.get('/', listFiles)
router.post('/', createFile)
router.get('/:id', getFile)
router.put('/:id/content', updateFileContent)
router.delete('/:id', deleteFile)

router.get('/:id/shares', listShares)
router.post('/:id/shares', shareFile)
router.delete('/:id/shares/:userId', removeShare)

router.get('/:id/comments', getComments)
router.post('/:id/comments', addComment)

export default router
