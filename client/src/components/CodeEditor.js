import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
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
const EDITOR_LINE_HEIGHT = 20;
const EDITOR_PADDING_Y = 12;
function mapLanguageToPrism(language) {
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
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function getActiveLine(value, caretIndex) {
    if (!value) {
        return 1;
    }
    return value.slice(0, Math.max(0, caretIndex)).split('\n').length;
}
function getCursorPosition(value, caretIndex) {
    const safeIndex = Math.max(0, caretIndex);
    const textBefore = value.slice(0, safeIndex);
    const lines = textBefore.split('\n');
    const currentLineText = lines[lines.length - 1] || '';
    return {
        line: lines.length,
        column: currentLineText.length + 1,
    };
}
function getCursorColor(socketId) {
    const palette = ['#4FC1FF', '#C586C0', '#4EC9B0', '#DCDCaa', '#F48771', '#CE9178'];
    let hash = 0;
    for (let index = 0; index < socketId.length; index += 1) {
        hash = (hash << 5) - hash + socketId.charCodeAt(index);
        hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
}
function CodeEditor({ value, language = 'plaintext', onChange, onCursorChange, disabled = false, placeholder, remoteCursors = [], }) {
    const textareaRef = useRef(null);
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
    const remoteCursorMarkers = useMemo(() => remoteCursors.map((remoteCursor) => ({
        ...remoteCursor,
        top: EDITOR_PADDING_Y + (Math.max(1, remoteCursor.line) - 1) * EDITOR_LINE_HEIGHT - scrollTop,
        left: 16 + (Math.max(1, remoteCursor.column) - 1) * 7.8 - scrollLeft,
        color: getCursorColor(remoteCursor.socketId),
    })), [remoteCursors, scrollLeft, scrollTop]);
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
    return (_jsxs("div", { className: `code-editor-shell ${disabled ? 'code-editor-shell--disabled' : ''}`, style: {
            '--editor-line-height': `${EDITOR_LINE_HEIGHT}px`,
            '--editor-padding-y': `${EDITOR_PADDING_Y}px`,
            '--active-line-top': `${activeLineTop}px`,
        }, children: [_jsxs("div", { className: "code-editor-gutter", "aria-hidden": "true", children: [_jsx("div", { className: "code-editor-active-line code-editor-active-line--gutter" }), _jsx("div", { className: "code-editor-gutter-inner", style: { transform: `translateY(-${scrollTop}px)` }, children: lineNumbers.map((lineNumber) => (_jsx("div", { className: `code-editor-line-number ${lineNumber === activeLine ? 'active' : ''}`, children: lineNumber }, lineNumber))) })] }), _jsxs("div", { className: "code-editor-input-wrap", children: [_jsx("div", { className: "code-editor-active-line code-editor-active-line--editor" }), _jsx("div", { className: "code-editor-highlight", "aria-hidden": "true", children: _jsx("pre", { className: `code-editor-pre language-${prismLanguage}`, style: { transform: `translate(${-scrollLeft}px, -${scrollTop}px)` }, children: _jsx("code", { className: `language-${prismLanguage}`, dangerouslySetInnerHTML: { __html: highlightedCode } }) }) }), _jsx("div", { className: "code-editor-remote-cursors", "aria-hidden": "true", children: remoteCursorMarkers.map((marker) => (_jsxs("div", { className: "code-editor-remote-cursor", style: {
                                top: `${marker.top}px`,
                                left: `${Math.max(0, marker.left)}px`,
                                color: marker.color,
                            }, children: [_jsx("span", { className: "code-editor-remote-caret" }), _jsx("span", { className: "code-editor-remote-label", children: marker.userName })] }, `${marker.socketId}-${marker.line}-${marker.column}`))) }), _jsx("textarea", { ref: textareaRef, className: "editor", value: value, onChange: (event) => {
                            onChange(event.target.value);
                            setActiveLine(getActiveLine(event.target.value, event.target.selectionStart ?? 0));
                            setScrollTop(event.target.scrollTop);
                            setScrollLeft(event.target.scrollLeft);
                            if (onCursorChange) {
                                onCursorChange(getCursorPosition(event.target.value, event.target.selectionStart ?? 0));
                            }
                        }, onScroll: (event) => {
                            setScrollTop(event.currentTarget.scrollTop);
                            setScrollLeft(event.currentTarget.scrollLeft);
                        }, onClick: updateEditorMetrics, onMouseUp: updateEditorMetrics, onKeyUp: updateEditorMetrics, onSelect: updateEditorMetrics, disabled: disabled, placeholder: placeholder, spellCheck: false, wrap: "off" })] })] }));
}
export default CodeEditor;
