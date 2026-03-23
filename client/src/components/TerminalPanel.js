import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
const MIN_HEIGHT = 130;
const MAX_HEIGHT = 420;
const ANSI_RESET = '\u001b[0m';
const LANGUAGE_OPTIONS = [
    { label: 'Python', value: 'python' },
    { label: 'Java', value: 'java' },
    { label: 'C', value: 'c' },
    { label: 'C++', value: 'cpp' },
];
function normalizeLineEndings(value) {
    return value.replace(/\r?\n/g, '\r\n');
}
function TerminalPanel({ terminalChunks, selectedLanguage, onLanguageChange, onRun, onStop, onInput, isRunning, runDisabled, }) {
    const [height, setHeight] = useState(210);
    const isDraggingRef = useRef(false);
    const terminalContainerRef = useRef(null);
    const terminalInstanceRef = useRef(null);
    const fitAddonRef = useRef(null);
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
        const onMouseMove = (event) => {
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
    return (_jsxs("section", { className: "terminal", style: { height }, children: [_jsx("div", { className: "terminal-resizer", onMouseDown: () => {
                    isDraggingRef.current = true;
                } }), _jsxs("header", { className: "terminal-header", children: [_jsx("span", { children: "TERMINAL" }), _jsxs("div", { className: "terminal-controls", children: [_jsx("label", { htmlFor: "run-language", className: "terminal-control-label", children: "Language" }), _jsx("select", { id: "run-language", className: "terminal-language-select", value: selectedLanguage, onChange: (event) => onLanguageChange(event.target.value), disabled: isRunning, children: LANGUAGE_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }), _jsx("button", { type: "button", className: "ghost-button", onClick: onRun, disabled: runDisabled || isRunning, children: "Run" }), _jsx("button", { type: "button", className: "ghost-button terminal-stop-button", onClick: onStop, disabled: !isRunning, children: "Stop" })] })] }), _jsx("div", { className: "terminal-content", children: _jsx("div", { className: "terminal-xterm", ref: terminalContainerRef, onClick: () => {
                        terminalInstanceRef.current?.focus();
                    } }) })] }));
}
export default TerminalPanel;
