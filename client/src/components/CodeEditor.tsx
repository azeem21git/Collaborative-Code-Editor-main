import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import type { CursorPosition } from '../types';

interface CodeEditorProps {
  value: string;
  language?: string;
  onChange: (value: string) => void;
  onCursorChange?: (cursor: CursorPosition) => void;
  disabled?: boolean;
  placeholder?: string;
  remoteCursors?: Array<{
    socketId: string;
    userName: string;
    line: number;
    column: number;
  }>;
}

const EDITOR_LINE_HEIGHT = 20;
const EDITOR_PADDING_Y = 12;

function mapLanguageToPrism(language?: string): string {
  switch ((language || '').toLowerCase()) {
    case 'js':
    case 'javascript':
      return 'javascript';
    case 'jsx':
      return 'jsx';
    case 'ts':
    case 'typescript':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    case 'py':
    case 'python':
      return 'python';
    case 'html':
      return 'markup';
    case 'css':
      return 'css';
    case 'json':
      return 'json';
    case 'java':
      return 'java';
    case 'c':
      return 'c';
    case 'cpp':
      return 'cpp';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'sh':
    case 'bash':
    case 'shell':
      return 'bash';
    default:
      return 'plaintext';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getActiveLine(value: string, caretIndex: number): number {
  if (!value) {
    return 1;
  }

  return value.slice(0, Math.max(0, caretIndex)).split('\n').length;
}

function getCursorPosition(value: string, caretIndex: number): CursorPosition {
  const safeIndex = Math.max(0, caretIndex);
  const textBefore = value.slice(0, safeIndex);
  const lines = textBefore.split('\n');
  const currentLineText = lines[lines.length - 1] || '';

  return {
    line: lines.length,
    column: currentLineText.length + 1,
  };
}

function getCursorColor(socketId: string): string {
  const palette = ['#4FC1FF', '#C586C0', '#4EC9B0', '#DCDCaa', '#F48771', '#CE9178'];
  let hash = 0;
  for (let index = 0; index < socketId.length; index += 1) {
    hash = (hash << 5) - hash + socketId.charCodeAt(index);
    hash |= 0;
  }

  return palette[Math.abs(hash) % palette.length];
}

function CodeEditor({
  value,
  language = 'plaintext',
  onChange,
  onCursorChange,
  disabled = false,
  placeholder,
  remoteCursors = [],
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [activeLine, setActiveLine] = useState(1);
  const prismLanguage = useMemo(() => mapLanguageToPrism(language), [language]);

  const lineCount = useMemo(() => Math.max(1, value.split('\n').length), [value]);
  const lineNumbers = useMemo(() => Array.from({ length: lineCount }, (_, index) => index + 1), [lineCount]);
  const highlightedCode = useMemo(() => {
    const sourceCode = value || ' ';
    const grammar = Prism.languages[prismLanguage];
    if (grammar) {
      return Prism.highlight(sourceCode, grammar, prismLanguage);
    }
    return escapeHtml(sourceCode);
  }, [prismLanguage, value]);

  const remoteCursorMarkers = useMemo(
    () =>
      remoteCursors.map((remoteCursor) => ({
        ...remoteCursor,
        top: EDITOR_PADDING_Y + (Math.max(1, remoteCursor.line) - 1) * EDITOR_LINE_HEIGHT - scrollTop,
        left: 16 + (Math.max(1, remoteCursor.column) - 1) * 7.8 - scrollLeft,
        color: getCursorColor(remoteCursor.socketId),
      })),
    [remoteCursors, scrollLeft, scrollTop],
  );

  const updateEditorMetrics = () => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    setScrollTop(textarea.scrollTop);
    setScrollLeft(textarea.scrollLeft);
    setActiveLine(getActiveLine(textarea.value, textarea.selectionStart ?? 0));

    if (onCursorChange) {
      onCursorChange(getCursorPosition(textarea.value, textarea.selectionStart ?? 0));
    }
  };

  useEffect(() => {
    updateEditorMetrics();
  }, [value]);

  const activeLineTop = EDITOR_PADDING_Y + (activeLine - 1) * EDITOR_LINE_HEIGHT - scrollTop;

  return (
    <div
      className={`code-editor-shell ${disabled ? 'code-editor-shell--disabled' : ''}`}
      style={
        {
          '--editor-line-height': `${EDITOR_LINE_HEIGHT}px`,
          '--editor-padding-y': `${EDITOR_PADDING_Y}px`,
          '--active-line-top': `${activeLineTop}px`,
        } as CSSProperties
      }
    >
      <div className="code-editor-gutter" aria-hidden="true">
        <div className="code-editor-active-line code-editor-active-line--gutter" />
        <div
          className="code-editor-gutter-inner"
          style={{ transform: `translateY(-${scrollTop}px)` }}
        >
          {lineNumbers.map((lineNumber) => (
            <div
              key={lineNumber}
              className={`code-editor-line-number ${lineNumber === activeLine ? 'active' : ''}`}
            >
              {lineNumber}
            </div>
          ))}
        </div>
      </div>

      <div className="code-editor-input-wrap">
        <div className="code-editor-active-line code-editor-active-line--editor" />
        <div className="code-editor-highlight" aria-hidden="true">
          <pre
            className={`code-editor-pre language-${prismLanguage}`}
            style={{ transform: `translate(${-scrollLeft}px, -${scrollTop}px)` }}
          >
            <code
              className={`language-${prismLanguage}`}
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>
        </div>

        <div className="code-editor-remote-cursors" aria-hidden="true">
          {remoteCursorMarkers.map((marker) => (
            <div
              key={`${marker.socketId}-${marker.line}-${marker.column}`}
              className="code-editor-remote-cursor"
              style={{
                top: `${marker.top}px`,
                left: `${Math.max(0, marker.left)}px`,
                color: marker.color,
              }}
            >
              <span className="code-editor-remote-caret" />
              <span className="code-editor-remote-label">{marker.userName}</span>
            </div>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          className="editor"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveLine(getActiveLine(event.target.value, event.target.selectionStart ?? 0));
            setScrollTop(event.target.scrollTop);
            setScrollLeft(event.target.scrollLeft);

            if (onCursorChange) {
              onCursorChange(getCursorPosition(event.target.value, event.target.selectionStart ?? 0));
            }
          }}
          onScroll={(event) => {
            setScrollTop(event.currentTarget.scrollTop);
            setScrollLeft(event.currentTarget.scrollLeft);
          }}
          onClick={updateEditorMetrics}
          onMouseUp={updateEditorMetrics}
          onKeyUp={updateEditorMetrics}
          onSelect={updateEditorMetrics}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
        />
      </div>
    </div>
  );
}

export default CodeEditor;
