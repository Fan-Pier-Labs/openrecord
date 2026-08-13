/**
 * The write confirmation dialog.
 *
 * Every write tool the model calls stops here first. The body is built from
 * the literal payload that will run (`describeWrite`), never from the model's
 * account of it — the whole point is that the user approves the real thing.
 *
 * Yes or no, and that is all. No "always allow": a standing approval is how
 * you end up back where this started, with a model sending messages to a
 * doctor off the back of a question.
 *
 * Rendered inside whichever surface asked, so the phone gets an iOS-style
 * alert and the desktop window gets a desktop one.
 */
import { useEffect, useRef } from 'react';
import { describeWrite } from '../agent';
import type { PendingWrite } from '../types';

type Props = {
  write: PendingWrite;
  variant: 'ios' | 'desktop';
  onDecide: (approved: boolean) => void;
};

export function WriteConfirm({ write, variant, onDecide }: Props) {
  const { title, description, verb, fields } = describeWrite(write);
  const approveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // preventScroll: the dialog is inside a device frame partway down a long
    // page, and focusing normally yanks the whole page to it.
    approveRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    // Escape is a decline, matching the iOS alert's dismiss-is-cancel.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDecide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDecide]);

  return (
    <div
      className={`wc-overlay ${variant}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wc-title"
      // A click on the backdrop is a decline, not an approval.
      onClick={() => onDecide(false)}
    >
      <div className="wc-card" onClick={(e) => e.stopPropagation()}>
        <div className="wc-head">
          <span className="wc-icon" aria-hidden="true">
            !
          </span>
          <div>
            <div className="wc-title" id="wc-title">
              {title}
            </div>
            <div className="wc-desc">{description}</div>
          </div>
        </div>

        <dl className="wc-fields">
          {fields.length > 0 ? (
            fields.map((f) => (
              <div className="wc-field" key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))
          ) : (
            <div className="wc-field">
              <dd className="wc-empty">No details</dd>
            </div>
          )}
        </dl>

        <div className="wc-actions">
          <button type="button" className="wc-btn wc-no" onClick={() => onDecide(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="wc-btn wc-yes"
            ref={approveRef}
            onClick={() => onDecide(true)}
          >
            {verb}
          </button>
        </div>
      </div>
    </div>
  );
}
