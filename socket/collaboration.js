/**
 * Socket.io collaboration module.
 *
 * Handles all real-time events for collaborative code editing:
 *  - Presence (join/leave, active file tracking)
 *  - Code changes (broadcast to room)
 *  - Cursor positions
 *
 * Room convention: each file gets its own room identified by `file:<fileId>`.
 *
 * Events (client → server):
 *   join-file       { fileId }                — join a file's room
 *   leave-file      { fileId }                — leave a file's room
 *   code-change     { fileId, delta }         — broadcast a Monaco delta
 *   cursor-move     { fileId, position }      — broadcast cursor position
 *
 * Events (server → client):
 *   user-joined     { user, activeFile }      — a user joined the file room
 *   user-left       { userId, fileId }        — a user left the file room
 *   active-users    [{ user, activeFile }]    — current presence list for a room
 *   code-change     { userId, delta }         — incoming code delta
 *   cursor-move     { userId, position }      — incoming cursor position
 *   error           { message }               — error message
 */

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

// Map<socketId, { userId, username, color, activeFile }>
const connectedUsers = new Map();

// Palette of distinct colours assigned to users
const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
  '#00bcd4', '#8bc34a', '#ff5722', '#607d8b',
];

let colorIndex = 0;

function nextColor() {
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;
  return color;
}

function roomName(fileId) {
  return `file:${fileId}`;
}

/**
 * Extracts and verifies the JWT from the socket handshake.
 * Returns the decoded payload or null on failure.
 */
function getUserFromSocket(socket) {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Registers all collaboration event handlers on the given Socket.io server.
 */
export function registerCollaboration(io) {
  // Auth middleware — reject connections without a valid token
  io.use((socket, next) => {
    const user = getUserFromSocket(socket);
    if (!user) {
      return next(new Error('Unauthorized'));
    }
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { id: userId, username } = socket.user;

    // Register this connection
    connectedUsers.set(socket.id, {
      userId,
      username,
      color: nextColor(),
      activeFile: null,
    });

    // ── join-file ─────────────────────────────────────────────────────────────
    socket.on('join-file', ({ fileId } = {}) => {
      if (!fileId) {
        return socket.emit('error', { message: 'fileId is required' });
      }

      const room = roomName(fileId);

      // Leave any previously active file room
      const meta = connectedUsers.get(socket.id);
      if (meta?.activeFile && meta.activeFile !== String(fileId)) {
        leaveFileRoom(socket, io, meta.activeFile);
      }

      socket.join(room);

      if (meta) {
        meta.activeFile = String(fileId);
      }

      // Send current presence list to the joining user
      const activeUsers = getActiveUsersInRoom(io, room);
      socket.emit('active-users', activeUsers);

      // Notify others in the room
      socket.to(room).emit('user-joined', {
        user: { userId, username, color: meta?.color },
        activeFile: fileId,
      });
    });

    // ── leave-file ────────────────────────────────────────────────────────────
    socket.on('leave-file', ({ fileId } = {}) => {
      if (!fileId) return;
      leaveFileRoom(socket, io, String(fileId));
    });

    // ── code-change ───────────────────────────────────────────────────────────
    // delta follows Monaco's IModelContentChangedEvent shape
    socket.on('code-change', ({ fileId, delta } = {}) => {
      if (!fileId || delta === undefined) return;

      socket.to(roomName(fileId)).emit('code-change', {
        userId,
        username,
        delta,
      });
    });

    // ── cursor-move ───────────────────────────────────────────────────────────
    socket.on('cursor-move', ({ fileId, position } = {}) => {
      if (!fileId || !position) return;

      socket.to(roomName(fileId)).emit('cursor-move', {
        userId,
        username,
        color: connectedUsers.get(socket.id)?.color,
        position,
      });
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const meta = connectedUsers.get(socket.id);

      if (meta?.activeFile) {
        leaveFileRoom(socket, io, meta.activeFile);
      }

      connectedUsers.delete(socket.id);
    });
  });
}

// ── Private helpers ───────────────────────────────────────────────────────────

function leaveFileRoom(socket, io, fileId) {
  const room = roomName(fileId);
  const meta = connectedUsers.get(socket.id);

  socket.leave(room);

  if (meta) {
    meta.activeFile = null;
  }

  // Notify remaining users
  socket.to(room).emit('user-left', {
    userId: socket.user.id,
    fileId,
  });
}

function getActiveUsersInRoom(io, room) {
  const sockets = io.sockets.adapter.rooms.get(room);
  if (!sockets) return [];

  const result = [];
  for (const socketId of sockets) {
    const meta = connectedUsers.get(socketId);
    if (meta) {
      result.push({
        user: {
          userId: meta.userId,
          username: meta.username,
          color: meta.color,
        },
        activeFile: meta.activeFile,
      });
    }
  }
  return result;
}
