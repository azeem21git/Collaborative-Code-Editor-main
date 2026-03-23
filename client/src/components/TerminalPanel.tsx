import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { ExecutionLanguage, TerminalChunk } from '../types';

interface TerminalPanelProps {
  terminalChunks: TerminalChunk[];
  selectedLanguage: ExecutionLanguage;
  onLanguageChange: (language: ExecutionLanguage) => void;
  onRun: () => void;
  onStop: () => void;
  onInput: (data: string) => void;
  isRunning: boolean;
  runDisabled: boolean;
}

const MIN_HEIGHT = 130;
const MAX_HEIGHT = 420;
const ANSI_RESET = '\u001b[0m';

const LANGUAGE_OPTIONS: Array<{ label: string; value: ExecutionLanguage }> = [
  { label: 'Python', value: 'python' },
  { label: 'Java', value: 'java' },
  { label: 'C', value: 'c' },
  { label: 'C++', value: 'cpp' },
];

function normalizeLineEndings(value: string): string {
  return value.replace(/\r?\n/g, '\r\n');
}

function TerminalPanel({
  terminalChunks,
  selectedLanguage,
  onLanguageChange,
  onRun,
  onStop,
  onInput,
  isRunning,
  runDisabled,
}: TerminalPanelProps) {
  const [height, setHeight] = useState(210);
  const isDraggingRef = useRef(false);
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const renderedChunksRef = useRef(0);
  const onInputRef = useRef(onInput);
  const isRunningRef = useRef(isRunning);

  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const terminalContainer = terminalContainerRef.current;
    if (!terminalContainer) {
      return;
    }

    const terminal = new Terminal({
      fontFamily: 'Consolas, Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: true,
      convertEol: false,
      scrollback: 5000,
      theme: {
        background: '#1a1a1a',
        foreground: '#d4d4d4',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalContainer);
    fitAddon.fit();
    terminal.focus();

    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const inputDisposable = terminal.onData((data) => {
      if (!isRunningRef.current) {
        return;
      }

      onInputRef.current(data);
    });

    const handleWindowResize = () => {
      fitAddon.fit();
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      inputDisposable.dispose();
      terminal.dispose();
      terminalInstanceRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!isDraggingRef.current) {
        return;
      }

      const nextHeight = window.innerHeight - event.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, nextHeight)));
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!fitAddonRef.current) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [height]);

  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (!terminal) {
      return;
    }

    if (terminalChunks.length < renderedChunksRef.current) {
      terminal.clear();
      renderedChunksRef.current = 0;
    }

    const pendingChunks = terminalChunks.slice(renderedChunksRef.current);
    for (const chunk of pendingChunks) {
      const normalizedText = normalizeLineEndings(chunk.text);

      if (chunk.stream === 'stderr') {
        terminal.write(`\u001b[31m${normalizedText}${ANSI_RESET}`);
        continue;
      }

      if (chunk.stream === 'system') {
        terminal.write(`\u001b[36m${normalizedText}${ANSI_RESET}`);
        continue;
      }

      terminal.write(normalizedText);
    }

    renderedChunksRef.current = terminalChunks.length;
  }, [terminalChunks]);

  return (
    <section className="terminal" style={{ height }}>
      <div
        className="terminal-resizer"
        onMouseDown={() => {
          isDraggingRef.current = true;
        }}
      />

      <header className="terminal-header">
        <span>TERMINAL</span>
        <div className="terminal-controls">
          <label htmlFor="run-language" className="terminal-control-label">
            Language
          </label>
          <select
            id="run-language"
            className="terminal-language-select"
            value={selectedLanguage}
            onChange={(event) => onLanguageChange(event.target.value as ExecutionLanguage)}
            disabled={isRunning}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button type="button" className="ghost-button" onClick={onRun} disabled={runDisabled || isRunning}>
            Run
          </button>
          <button
            type="button"
            className="ghost-button terminal-stop-button"
            onClick={onStop}
            disabled={!isRunning}
          >
            Stop
          </button>
        </div>
      </header>

      <div className="terminal-content">
        <div
          className="terminal-xterm"
          ref={terminalContainerRef}
          onClick={() => {
            terminalInstanceRef.current?.focus();
          }}
        />
      </div>
    </section>
  );
}

export default TerminalPanel;
