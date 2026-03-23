import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function DiffView({ originalCode, correctedCode }) {
    const leftLines = originalCode.split('\n');
    const rightLines = correctedCode.split('\n');
    const maxLines = Math.max(leftLines.length, rightLines.length);
    return (_jsxs("div", { className: "diff-grid", children: [_jsxs("div", { className: "diff-column", children: [_jsx("div", { className: "diff-header", children: "Original" }), _jsx("div", { className: "diff-body", children: Array.from({ length: maxLines }).map((_, lineIndex) => {
                            const lineText = leftLines[lineIndex] ?? '';
                            const isChanged = lineText !== (rightLines[lineIndex] ?? '');
                            return (_jsxs("div", { className: `diff-line ${isChanged ? 'changed' : ''}`, children: [_jsx("span", { className: "line-number", children: lineIndex + 1 }), _jsx("span", { className: "line-text", children: lineText || ' ' })] }, `left-${lineIndex}`));
                        }) })] }), _jsxs("div", { className: "diff-column", children: [_jsx("div", { className: "diff-header", children: "Corrected" }), _jsx("div", { className: "diff-body", children: Array.from({ length: maxLines }).map((_, lineIndex) => {
                            const lineText = rightLines[lineIndex] ?? '';
                            const isChanged = lineText !== (leftLines[lineIndex] ?? '');
                            return (_jsxs("div", { className: `diff-line ${isChanged ? 'changed' : ''}`, children: [_jsx("span", { className: "line-number", children: lineIndex + 1 }), _jsx("span", { className: "line-text", children: lineText || ' ' })] }, `right-${lineIndex}`));
                        }) })] })] }));
}
export default DiffView;
