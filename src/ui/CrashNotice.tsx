import { useEffect, useState } from 'react';
import { clearCrash, crashSummary, lastCrash } from '../app/crashlog';

/** APK only: after a crash, the next start shows what went wrong, ready for a screenshot. */
export function CrashNotice() {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    lastCrash().then(setText);
  }, []);

  if (!text) return null;

  function close() {
    clearCrash();
    setText('');
  }

  function copy() {
    navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false));
  }

  const head = text.split('\n').slice(0, 4);
  return (
    <div className="crash" role="alertdialog" aria-label="The app closed by mistake">
      <div className="crash-box">
        <p className="eyebrow">Sorry, the app closed by mistake</p>
        <p>Please take a screenshot of this and send it. It shows what went wrong, so it can be fixed.</p>
        <pre className="crash-text">{[...head, '', ...crashSummary(text)].join('\n')}</pre>
        <details>
          <summary>Full report</summary>
          <pre className="crash-text crash-full">{text}</pre>
        </details>
        <div className="btn-row">
          <button type="button" className="btn btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy the report'}</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
