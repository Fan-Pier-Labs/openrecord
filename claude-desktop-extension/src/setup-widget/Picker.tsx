import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BackLink } from './components';
import { nextSelectable, pickerRows, type PickerRow } from './flow';
import type { Host } from './host';

type Results = { kind: 'closed' } | { kind: 'loading' } | { kind: 'rows'; rows: PickerRow[] };

const NO_MATCHES = 'No matching health systems. Not listed? Type your MyChart web address, e.g. mychart.example.org.';

/** A directory row's banner logo, in a fixed slot so names stay aligned whether or not it loads. */
function RowLogo({ url }: { url: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <img className="row-logo row-logo-empty" alt="" />;
  return <img className="row-logo" alt="" src={url} onError={() => setFailed(true)} />;
}

function Row({ row, active, onPick, onHover }: { row: PickerRow; active: boolean; onPick: () => void; onHover: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const classes = [row.unavailable ? 'unavailable' : '', active ? 'active' : ''].join(' ').trim();
  return (
    <li
      ref={ref}
      className={classes || undefined}
      aria-disabled={row.unavailable ? true : undefined}
      // mousedown beats the input's blur, so the pick lands before the list
      // closes. An unavailable row still swallows it rather than letting it
      // fall through to the document handler, which would just close the list
      // and look like the pick was accepted.
      onMouseDown={(e) => {
        e.preventDefault();
        if (!row.unavailable) onPick();
      }}
      onMouseMove={row.unavailable ? undefined : onHover}
    >
      <RowLogo url={row.logoUrl} />
      <div className="row-text">
        <span className="row-name">{row.name || row.hostname}</span>
        {row.custom ? <span className="row-host">Not in our list. Connect to this address directly.</span>
          : row.unavailable ? <span className="row-unavailable">{row.unavailable}</span>
            : <span className="row-host">{row.hostname}</span>}
      </div>
    </li>
  );
}

/**
 * The health-system search for a manual sign-in. Results appear only once the
 * user types — no default suggestions — and a query that is itself a web
 * address also offers a "Use <host>" row for portals the directory lacks.
 */
export function Picker({ host, onPick, onBack }: { host: Host; onPick: (row: PickerRow) => void; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>({ kind: 'closed' });
  const [active, setActive] = useState(-1);
  const epoch = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const box = useRef<HTMLDivElement>(null);

  const close = () => {
    setResults({ kind: 'closed' });
    setActive(-1);
  };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      clearTimeout(debounce.current);
    };
  }, []);

  const search = async (q: string) => {
    const mine = ++epoch.current;
    setResults({ kind: 'loading' });
    setActive(-1);
    const res = await host.callTool('search_mycharts', { query: q, limit: 8 });
    if (mine !== epoch.current) return; // a newer query is in flight; drop this response
    setResults({ kind: 'rows', rows: pickerRows(res, q) });
  };

  const onChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounce.current);
    const q = value.trim();
    if (!q) {
      epoch.current++; // invalidate any in-flight response
      close();
      return;
    }
    debounce.current = setTimeout(() => void search(q), 180);
  };

  const rows = results.kind === 'rows' ? results.rows : [];
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (results.kind === 'closed') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(nextSelectable(rows, active, e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[active >= 0 ? active : nextSelectable(rows, -1, 1)];
      if (row && !row.unavailable) onPick(row);
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div className="step">
      <BackLink onClick={onBack} />
      <p className="step-sub">Search for your hospital or clinic, then pick it from the list. Not listed? Type your MyChart web address instead.</p>
      <div className="field combobox" ref={box}>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search hospital or clinic (e.g. 'Denver Health')"
          autoComplete="off"
          spellCheck={false}
        />
        {results.kind !== 'closed' && (
          <ul className="results">
            {results.kind === 'loading' ? <li className="loading">Searching…</li>
              : rows.length === 0 ? <li className="empty">{NO_MATCHES}</li>
                : rows.map((row, i) => (
                  <Row key={row.slgId ?? row.hostname} row={row} active={i === active} onPick={() => onPick(row)} onHover={() => setActive(i)} />
                ))}
          </ul>
        )}
      </div>
    </div>
  );
}
