const roomMembers = new Map();
const socketRoom = new Map();

function normalizeRoomId(roomId) {
  return typeof roomId === 'string' ? roomId.trim() : '';
}

function normalizeUserName(userName) {
  const normalized = typeof userName === 'string' ? userName.trim() : '';
  return normalized || 'anonymous';
}

function getOrCreateRoom(roomId) {
  if (!roomMembers.has(roomId)) {
    roomMembers.set(roomId, new Map());
  }

  return roomMembers.get(roomId);
}

function getRoomUserList(roomId) {
  const members = roomMembers.get(roomId);
  if (!members) {
    return [];
  }

  return Array.from(members.values());
}

function broadcastRoomUsers(io, roomId) {
  io.to(roomId).emit('room-users', {
    roomId,
    users: getRoomUserList(roomId),
  });
}

function removeSocketFromRoom(io, socket, notify = true) {
  const roomId = socketRoom.get(socket.id);
  if (!roomId) {
    return;
  }

  socket.leave(roomId);
  socketRoom.delete(socket.id);

  const members = roomMembers.get(roomId);
  let departingUserName = 'anonymous';

  if (members) {
    const currentMember = members.get(socket.id);
    if (currentMember?.userName) {
      departingUserName = currentMember.userName;
    }

    members.delete(socket.id);
    if (members.size === 0) {
      roomMembers.delete(roomId);
    }
  }

  if (notify) {
    io.to(roomId).emit('user-left', {
      roomId,
      socketId: socket.id,
      userName: departingUserName,
      message: `${departingUserName} disconnected`,
    });
    broadcastRoomUsers(io, roomId);
  }
}

function getSenderName(roomId, socketId) {
  const members = roomMembers.get(roomId);
  if (!members) {
    return 'anonymous';
  }

  return members.get(socketId)?.userName || 'anonymous';
}

export function registerCollaborationHandlers(io) {
  io.on('connection', (socket) => {
    socket.on('join-room', ({ roomId, userName }) => {
      const nextRoomId = normalizeRoomId(roomId);
      if (!nextRoomId) {
        return;
      }

      const normalizedUserName = normalizeUserName(userName);
      const currentRoomId = socketRoom.get(socket.id);

      if (currentRoomId && currentRoomId !== nextRoomId) {
        removeSocketFromRoom(io, socket, true);
      }

      socket.join(nextRoomId);
      socketRoom.set(socket.id, nextRoomId);

      const members = getOrCreateRoom(nextRoomId);
      members.set(socket.id, {
        socketId: socket.id,
        userName: normalizedUserName,
      });

      socket.emit('room-joined', {
        roomId: nextRoomId,
        socketId: socket.id,
        userName: normalizedUserName,
      });

      socket.to(nextRoomId).emit('user-joined', {
        roomId: nextRoomId,
        socketId: socket.id,
        userName: normalizedUserName,
        message: `${normalizedUserName} joined the room`,
      });

      broadcastRoomUsers(io, nextRoomId);
    });

    socket.on('code-change', (payload, acknowledge) => {
      const { roomId, filePath, content, cursor } = payload || {};
      const normalizedRoomId = normalizeRoomId(roomId);
      const activeRoomId = socketRoom.get(socket.id);

      if (!normalizedRoomId || !filePath || activeRoomId !== normalizedRoomId) {
        if (typeof acknowledge === 'function') {
          acknowledge({ ok: false });
        }
        return;
      }

      const senderUserName = getSenderName(normalizedRoomId, socket.id);

      socket.to(normalizedRoomId).emit('code-update', {
        roomId: normalizedRoomId,
        filePath,
        content: typeof content === 'string' ? content : '',
        cursor: cursor || null,
        socketId: socket.id,
        userName: senderUserName,
      });

      if (typeof acknowledge === 'function') {
        acknowledge({
          ok: true,
          roomId: normalizedRoomId,
          filePath,
        });
      }
    });

    socket.on('cursor-change', (payload) => {
      const { roomId, filePath, cursor } = payload || {};
      const normalizedRoomId = normalizeRoomId(roomId);

      if (!normalizedRoomId || !filePath || !cursor) {
        return;
      }

      const senderUserName = getSenderName(normalizedRoomId, socket.id);

      socket.in(normalizedRoomId).emit('cursor-update', {
        roomId: normalizedRoomId,
        filePath,
        cursor,
        socketId: socket.id,
        userName: senderUserName,
      });
    });

    socket.on('fs-event', (payload) => {
      const { roomId } = payload || {};
      const normalizedRoomId = normalizeRoomId(roomId);

      if (!normalizedRoomId) {
        return;
      }

      socket.to(normalizedRoomId).emit('fs-event', {
        ...payload,
        socketId: socket.id,
        userName: getSenderName(normalizedRoomId, socket.id),
      });
    });

    socket.on('disconnect', () => {
      removeSocketFromRoom(io, socket, true);
    });
  });
}
