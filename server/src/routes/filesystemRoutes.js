import { Router } from 'express';
import {
  createWorkspaceFile,
  createWorkspaceFolder,
  deleteWorkspacePath,
  getWorkspaceTree,
  readWorkspaceFile,
  renameWorkspacePath,
  writeWorkspaceFile,
} from '../utils/fsUtils.js';

export function createFilesystemRouter(io) {
  const router = Router();

  router.get('/tree', async (req, res) => {
    try {
      const tree = await getWorkspaceTree(req.query.path || '');
      res.json({ tree });
    } catch (error) {
      res.status(400).json({ error: error.message || 'Unable to load workspace tree' });
    }
  });

  router.get('/file', async (req, res) => {
    try {
      const payload = await readWorkspaceFile(req.query.path || '');
      res.json(payload);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Unable to read file' });
    }
  });

  router.put('/file', async (req, res) => {
    try {
      const { path, content, roomId } = req.body || {};
      const payload = await writeWorkspaceFile(path, content || '');

      if (roomId) {
        io.to(roomId).emit('fs-event', {
          type: 'file-updated',
          path,
        });
      }

      res.json(payload);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Unable to write file' });
    }
  });

  router.post('/file', async (req, res) => {
    try {
      const { path, roomId } = req.body || {};
      const payload = await createWorkspaceFile(path);

      if (roomId) {
        io.to(roomId).emit('fs-event', {
          type: 'file-created',
          path,
        });
      }

      res.status(201).json(payload);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Unable to create file' });
    }
  });

  router.post('/folder', async (req, res) => {
    try {
      const { path, roomId } = req.body || {};
      const payload = await createWorkspaceFolder(path);

      if (roomId) {
        io.to(roomId).emit('fs-event', {
          type: 'folder-created',
          path,
        });
      }

      res.status(201).json(payload);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Unable to create folder' });
    }
  });

  router.patch('/rename', async (req, res) => {
    try {
      const { oldPath, newPath, roomId } = req.body || {};
      const payload = await renameWorkspacePath(oldPath, newPath);

      if (roomId) {
        io.to(roomId).emit('fs-event', {
          type: 'path-renamed',
          oldPath,
          newPath,
        });
      }

      res.json(payload);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Unable to rename path' });
    }
  });

  router.delete('/path', async (req, res) => {
    try {
      const { path } = req.query || {};
      const roomId = req.query.roomId || undefined;
      const payload = await deleteWorkspacePath(path);

      if (roomId) {
        io.to(roomId).emit('fs-event', {
          type: 'path-deleted',
          path,
        });
      }

      res.json(payload);
    } catch (error) {
      res.status(400).json({ error: error.message || 'Unable to delete path' });
    }
  });

  return router;
}
