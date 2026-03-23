interface DiffViewProps {
  originalCode: string;
  correctedCode: string;
}

function DiffView({ originalCode, correctedCode }: DiffViewProps) {
  const leftLines = originalCode.split('\n');
  const rightLines = correctedCode.split('\n');
  const maxLines = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="diff-grid">
      <div className="diff-column">
        <div className="diff-header">Original</div>
        <div className="diff-body">
          {Array.from({ length: maxLines }).map((_, lineIndex) => {
            const lineText = leftLines[lineIndex] ?? '';
            const isChanged = lineText !== (rightLines[lineIndex] ?? '');

            return (
              <div key={`left-${lineIndex}`} className={`diff-line ${isChanged ? 'changed' : ''}`}>
                <span className="line-number">{lineIndex + 1}</span>
                <span className="line-text">{lineText || ' '}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="diff-column">
        <div className="diff-header">Corrected</div>
        <div className="diff-body">
          {Array.from({ length: maxLines }).map((_, lineIndex) => {
            const lineText = rightLines[lineIndex] ?? '';
            const isChanged = lineText !== (leftLines[lineIndex] ?? '');

            return (
              <div key={`right-${lineIndex}`} className={`diff-line ${isChanged ? 'changed' : ''}`}>
                <span className="line-number">{lineIndex + 1}</span>
                <span className="line-text">{lineText || ' '}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DiffView;
