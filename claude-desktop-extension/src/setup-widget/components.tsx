import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Instance } from './flow';

export function Spinner() {
  return <span className="loader" />;
}

/** A button that shows a spinner and its busy label while its call runs. */
export function BusyButton({ busy, busyLabel, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy: boolean; busyLabel: string }) {
  return (
    <button type="button" {...rest} disabled={busy || rest.disabled}>
      {busy ? <><Spinner /> {busyLabel}</> : children}
    </button>
  );
}

export function BackLink({ onClick, children = '‹ Back' }: { onClick: () => void; children?: ReactNode }) {
  return <button className="link-btn" type="button" onClick={onClick}>{children}</button>;
}

/** Inline error label beneath a step's action button. */
export function FieldError({ message }: { message: string | null }) {
  return message ? <p className="field-error">{message}</p> : null;
}

/** The chosen system's banner logo above its name. A logo that is missing or fails to load leaves just the name. */
export function InstanceHeader({ instance }: { instance: Instance }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showLogo = instance.logoUrl && failed !== instance.logoUrl;
  return (
    <div className="instance-header">
      {showLogo && <img className="instance-logo" alt="" src={instance.logoUrl} onError={() => setFailed(instance.logoUrl ?? null)} />}
      <div className="instance-name">{instance.name || instance.hostname}</div>
    </div>
  );
}

export function RowText({ title, subtitle, note }: { title: string; subtitle: string; note?: string | null }) {
  return (
    <div className="row-text">
      <span className="row-name">{title}</span>
      <span className="row-host">{subtitle}</span>
      {note && <span className="row-note">{note}</span>}
    </div>
  );
}
