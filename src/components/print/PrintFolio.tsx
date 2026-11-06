import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/** A browser-independent footer; native browser headers/footers are a print-dialog setting. */
export function PrintFolio() {
  const [printedAt, setPrintedAt] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => {
      // The print snapshot can be taken before a normally scheduled React update commits.
      flushSync(() => setPrintedAt(new Date()));
    };
    window.addEventListener('beforeprint', refresh);
    return () => window.removeEventListener('beforeprint', refresh);
  }, []);
  return (
    <footer className="print-folio" aria-label="Print footer">
      <time className="print-folio-date" dateTime={printedAt.toISOString()}>
        {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(printedAt)}
      </time>
      <span className="print-folio-title">Fate Campaign Companion</span>
    </footer>
  );
}
