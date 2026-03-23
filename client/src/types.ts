export type NodeKind = 'file' | 'folder';

export interface FileNode {
  name: string;
  path: string;
  kind: NodeKind;
  children: FileNode[];
  handle?: any;
}

export interface FsTreeResponse {
  tree: FileNode;
}

export interface RemoteFileResponse {
  path: string;
  content: string;
}

export interface AiFixResponse {
  originalCode: string;
  correctedCode: string;
  model?: string;
}

export interface CodeChangePayload {
  roomId: string;
  filePath: string;
  content: string;
  socketId?: string;
  userName?: string;
  cursor?: {
    line: number;
    column: number;
  } | null;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface CursorUpdatePayload {
  roomId: string;
  filePath: string;
  socketId: string;
  userName: string;
  cursor: CursorPosition;
}

export interface RoomUser {
  socketId: string;
  userName: string;
}

export type ExecutionLanguage = 'python' | 'java' | 'c' | 'cpp';

export type TerminalStream = 'stdout' | 'stderr' | 'system';

export interface TerminalChunk {
  id: number;
  text: string;
  stream: TerminalStream;
}
