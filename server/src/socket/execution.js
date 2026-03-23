import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Maps a language key to a function that returns the shell command sequence
 * needed to compile (if required) and run a source file placed in the given
 * temporary directory.
 *
 * Each entry returns an array of steps:
 *   { cmd: string, args: string[] }
 * The last step is the one whose process is kept alive for stdin/stdout.
 */
function buildCommandSteps(language, tmpDir, fileName) {
  const full = path.join(tmpDir, fileName);

  switch (language) {
    case 'python':
      return [{ cmd: 'python3', args: [full], keepAlive: true }];

    case 'java': {
      const base = path.basename(fileName, '.java');
      return [
        { cmd: 'javac', args: [full], keepAlive: false },
        { cmd: 'java', args: ['-cp', tmpDir, base], keepAlive: true },
      ];
    }

    case 'c': {
      const outFile = path.join(tmpDir, 'out_c');
      return [
        { cmd: 'gcc', args: [full, '-o', outFile], keepAlive: false },
        { cmd: outFile, args: [], keepAlive: true },
      ];
    }

    case 'cpp': {
      const outFile = path.join(tmpDir, 'out_cpp');
      return [
        { cmd: 'g++', args: [full, '-o', outFile], keepAlive: false },
        { cmd: outFile, args: [], keepAlive: true },
      ];
    }

    default:
      return null;
  }
}

/**
 * For Java source, extracts the public class name so the file can be named
 * correctly (javac requires FileName.java == public class FileName).
 * Returns null if no public class declaration is found.
 */
function extractJavaPublicClassName(source) {
  const match = source.match(/public\s+class\s+(\w+)/);
  return match ? match[1] : null;
}

/**
 * Sanitizes a fileName so it can never escape the tmp directory via path
 * traversal, and ensures the extension matches the target language.
 * For Java, overrides the name with the public class name found in source.
 */
function safeFileName(rawName, language, source) {
  const extMap = {
    python: '.py',
    java: '.java',
    c: '.c',
    cpp: '.cpp',
  };
  const expectedExt = extMap[language] ?? '';

  // For Java, always use the public class name as the file base.
  if (language === 'java') {
    const className = extractJavaPublicClassName(source ?? '');
    if (className) {
      return className + '.java';
    }
  }

  // Strip any directory components from the incoming name.
  const baseName = path.basename(rawName || 'program');

  // Ensure the extension is correct for the chosen language.
  const currentExt = path.extname(baseName);
  if (currentExt !== expectedExt) {
    return path.basename(baseName, currentExt) + expectedExt;
  }

  return baseName;
}

/**
 * Runs a single non-interactive compile/build step (e.g. javac, gcc, g++).
 * Resolves with combined stdout+stderr text on success, rejects on non-zero exit.
 */
function runCompileStep({ cmd, args }) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('error', (error) => {
      reject(new Error(`${cmd}: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(output.trim() || `${cmd} exited with code ${code}`));
      } else {
        resolve(output);
      }
    });
  });
}

/**
 * Per-socket process state: Map<socketId, { process, tmpDir }>
 */
const runningProcesses = new Map();

function cleanupSocket(socketId) {
  const entry = runningProcesses.get(socketId);
  if (!entry) return;

  try {
    if (entry.process && !entry.process.killed) {
      entry.process.kill('SIGTERM');
    }
  } catch (_) {
    // Ignore kill errors during cleanup.
  }

  try {
    if (entry.tmpDir) {
      fs.rmSync(entry.tmpDir, { recursive: true, force: true });
    }
  } catch (_) {
    // Ignore fs errors during cleanup.
  }

  runningProcesses.delete(socketId);
}

export function registerExecutionHandlers(io, socket) {
  socket.on('run-code', async (payload) => {
    const { fileName, fileContent, language } = payload ?? {};

    // Kill any previous process owned by this socket before starting a new one.
    cleanupSocket(socket.id);

    if (
      !language ||
      !['python', 'java', 'c', 'cpp'].includes(language) ||
      typeof fileContent !== 'string'
    ) {
      socket.emit('execution-error', {
        message: `Unsupported or missing language: "${language}".`,
      });
      return;
    }

    // Validate / fix source file name for this language.
    // Pass fileContent so Java can extract the public class name.
    const safeFile = safeFileName(fileName, language, fileContent);

    // Create an isolated temp directory for this run.
    let tmpDir;
    try {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'collabrix-'));
    } catch (error) {
      socket.emit('execution-error', {
        message: `Failed to create temp directory: ${error.message}`,
      });
      return;
    }

    // Write the source file.
    try {
      fs.writeFileSync(path.join(tmpDir, safeFile), fileContent, 'utf8');
    } catch (error) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      socket.emit('execution-error', {
        message: `Failed to write source file: ${error.message}`,
      });
      return;
    }

    const steps = buildCommandSteps(language, tmpDir, safeFile);
    if (!steps) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      socket.emit('execution-error', {
        message: `No command mapping found for language: "${language}".`,
      });
      return;
    }

    socket.emit('execution-started', { language, fileName: safeFile });

    // ── Compile steps (non-interactive, before the final live process) ──────
    const compileSteps = steps.filter((s) => !s.keepAlive);
    for (const step of compileSteps) {
      try {
        const compileOutput = await runCompileStep(step);
        if (compileOutput.trim()) {
          socket.emit('execution-output', { stream: 'stdout', chunk: compileOutput });
        }
      } catch (error) {
        socket.emit('execution-output', { stream: 'stderr', chunk: error.message + '\n' });
        socket.emit('execution-finished', { exitCode: 1, signal: null, durationMs: 0 });
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return;
      }
    }

    // ── Live interactive process ─────────────────────────────────────────────
    const runStep = steps.find((s) => s.keepAlive);
    if (!runStep) {
      socket.emit('execution-finished', { exitCode: 0, signal: null, durationMs: 0 });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    }

    let liveProcess;
    try {
      liveProcess = spawn(runStep.cmd, runStep.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: tmpDir,
      });
    } catch (error) {
      socket.emit('execution-error', {
        message: `Failed to start process: ${error.message}`,
      });
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    }

    const startTime = Date.now();
    runningProcesses.set(socket.id, { process: liveProcess, tmpDir });

    liveProcess.stdout.on('data', (data) => {
      socket.emit('execution-output', { stream: 'stdout', chunk: data.toString() });
    });

    liveProcess.stderr.on('data', (data) => {
      socket.emit('execution-output', { stream: 'stderr', chunk: data.toString() });
    });

    liveProcess.on('error', (error) => {
      socket.emit('execution-error', { message: error.message });
      cleanupSocket(socket.id);
    });

    liveProcess.on('close', (code, signal) => {
      const durationMs = Date.now() - startTime;
      socket.emit('execution-finished', {
        exitCode: code,
        signal: signal ?? null,
        durationMs,
      });
      cleanupSocket(socket.id);
    });
  });

  // ── Stop ──────────────────────────────────────────────────────────────────
  socket.on('stop-execution', () => {
    const entry = runningProcesses.get(socket.id);
    if (!entry || !entry.process) {
      return;
    }

    try {
      entry.process.kill('SIGTERM');
    } catch (_) {
      // Ignore kill errors.
    }
  });

  // ── Stdin ─────────────────────────────────────────────────────────────────
  socket.on('terminal-input', ({ data } = {}) => {
    if (!data || typeof data !== 'string') return;

    const entry = runningProcesses.get(socket.id);
    if (!entry || !entry.process || !entry.process.stdin) return;

    try {
      entry.process.stdin.write(data);
    } catch (_) {
      // Ignore write errors if process has already closed stdin.
    }
  });

  // ── Cleanup on disconnect ─────────────────────────────────────────────────
  socket.on('disconnect', () => {
    cleanupSocket(socket.id);
  });
}
