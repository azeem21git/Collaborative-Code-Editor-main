import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MonacoEditor, { type OnMount } from '@monaco-editor/react';
import type { IDisposable, editor as MonacoEditorApi } from 'monaco-editor';
import type { CursorPosition } from '../types';

interface EditorProps {
  filePath?: string | null;
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

type RemoteCursorMarker = {
  socketId: string;
  userName: string;
  top: number;
  left: number;
  color: string;
};

function mapLanguageToMonaco(language?: string): string {
  switch ((language || '').toLowerCase()) {
    case 'js':
    case 'javascript':
      return 'javascript';
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'typescript':
      return 'typescript';
    case 'tsx':
      return 'typescript';
    case 'py':
    case 'python':
      return 'python';
    case 'html':
      return 'html';
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
      return 'shell';
    default:
      return 'plaintext';
  }
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

function Editor({
  filePath,
  value,
  language = 'plaintext',
  onChange,
  onCursorChange,
  disabled = false,
  placeholder,
  remoteCursors = [],
}: EditorProps) {
  const editorRef = useRef<MonacoEditorApi.IStandaloneCodeEditor | null>(null);
  const suppressExternalSyncRef = useRef(false);
  const disposablesRef = useRef<IDisposable[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [remoteCursorMarkers, setRemoteCursorMarkers] = useState<RemoteCursorMarker[]>([]);

  const monacoLanguage = useMemo(() => mapLanguageToMonaco(language), [language]);

  const updateRemoteCursorMarkers = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const layoutInfo = editor.getLayoutInfo();
    const nextMarkers = remoteCursors
      .map((remoteCursor) => {
        const visiblePosition = editor.getScrolledVisiblePosition({
          lineNumber: Math.max(1, remoteCursor.line),
          column: Math.max(1, remoteCursor.column),
        });

        if (!visiblePosition) {
          return null;
        }

        return {
          socketId: remoteCursor.socketId,
          userName: remoteCursor.userName,
          top: visiblePosition.top,
          left: layoutInfo.contentLeft + visiblePosition.left,
          color: getCursorColor(remoteCursor.socketId),
        };
      })
      .filter((marker): marker is RemoteCursorMarker => marker !== null);

    setRemoteCursorMarkers(nextMarkers);
  }, [remoteCursors]);

  const editorOptions = useMemo<MonacoEditorApi.IStandaloneEditorConstructionOptions>(
    () => ({
      automaticLayout: true,
      readOnly: disabled,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      fontSize: 13,
      lineHeight: 20,
      tabSize: 2,
      insertSpaces: true,
      padding: { top: 12, bottom: 12 },
      wordWrap: 'off',
      renderLineHighlight: 'all',
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      overviewRulerBorder: false,
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 10,
      quickSuggestions: !disabled,
    }),
    [disabled],
  );

  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((disposable) => disposable.dispose());
      disposablesRef.current = [];
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const currentValue = editor.getValue();
    if (currentValue === value) {
      return;
    }

    const model = editor.getModel();
    if (!model) {
      return;
    }

    suppressExternalSyncRef.current = true;
    editor.executeEdits('remote-sync', [
      {
        range: model.getFullModelRange(),
        text: value,
        forceMoveMarkers: true,
      },
    ]);
    suppressExternalSyncRef.current = false;
  }, [filePath, value]);

  useEffect(() => {
    updateRemoteCursorMarkers();
  }, [filePath, updateRemoteCursorMarkers, value]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;

    disposablesRef.current.forEach((disposable) => disposable.dispose());
    disposablesRef.current = [
      editor.onDidChangeModelContent(() => {
        if (suppressExternalSyncRef.current) {
          return;
        }

        onChange(editor.getValue());
      }),
      editor.onDidChangeCursorPosition((event) => {
        onCursorChange?.({
          line: event.position.lineNumber,
          column: event.position.column,
        });
      }),
      editor.onDidScrollChange(() => {
        updateRemoteCursorMarkers();
      }),
      editor.onDidLayoutChange(() => {
        updateRemoteCursorMarkers();
      }),
      editor.onDidFocusEditorText(() => {
        setIsFocused(true);
      }),
      editor.onDidBlurEditorText(() => {
        setIsFocused(false);
      }),
    ];

    updateRemoteCursorMarkers();
  };

  return (
    <div className={`monaco-editor-shell ${disabled ? 'monaco-editor-shell--disabled' : ''}`}>
      {placeholder && !value && !isFocused ? (
        <div className="editor-placeholder" aria-hidden="true">
          {placeholder}
        </div>
      ) : null}

      <MonacoEditor
        height="100%"
        path={filePath || 'untitled'}
        defaultLanguage={monacoLanguage}
        defaultValue={value}
        language={monacoLanguage}
        theme="vs-dark"
        options={editorOptions}
        onMount={handleMount}
        loading={<div className="placeholder">Loading editor...</div>}
        saveViewState
      />

      <div className="editor-remote-cursors-layer" aria-hidden="true">
        {remoteCursorMarkers.map((marker) => (
          <div
            key={`${marker.socketId}-${marker.top}-${marker.left}`}
            className="editor-remote-cursor"
            style={{
              top: `${marker.top}px`,
              left: `${marker.left}px`,
              color: marker.color,
            }}
          >
            <span className="editor-remote-caret" />
            <span className="editor-remote-label">{marker.userName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Editor;