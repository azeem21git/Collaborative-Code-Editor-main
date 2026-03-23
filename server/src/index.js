import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { registerCollaborationHandlers } from './socket/collaboration.js';
import { registerExecutionHandlers } from './socket/execution.js';
import { createFilesystemRouter } from './routes/filesystemRoutes.js';
import { createAIRouter } from './routes/aiRoutes.js';

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: config.clientOrigin,
    credentials: true,
  },
});

app.use(
  cors({
    origin: config.clientOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'collabrix-server',
    workspaceRoot: config.workspaceRoot,
  });
});

app.use('/api/fs', createFilesystemRouter(io));
app.use('/api/ai', createAIRouter());

registerCollaborationHandlers(io);

io.on('connection', (socket) => {
  registerExecutionHandlers(io, socket);
});

httpServer.listen(config.port, () => {
  console.log(`CollaBrix server listening on http://localhost:${config.port}`);
  console.log(`Workspace root: ${config.workspaceRoot}`);
});
