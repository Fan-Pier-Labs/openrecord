import { mountPrefix } from '@/lib/mount';
import { rendersProxyAnchors } from '@/lib/proxy';

const MP = mountPrefix;

// ─── Proxy (multi-patient) selector ───────────────────────────────────
export type ProxySelectorEntry = { id: string; displayName: string };

export type ProxySelectorModel = {
  /**
   * The account holder's own record. Carries a real opaque `WP-…` id just like
   * a proxy record does — it is distinguished by being self, not by a blank id.
   */
  self: ProxySelectorEntry;
  /** Other patients this account can switch into. */
  subjects: ProxySelectorEntry[];
  /** Currently active record id. */
  activeId: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escape for embedding inside a double-quoted JS string in a <script> block. */
function escapeJsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\u003c');
}

/**
 * Anchor href for a record. Mirrors the `LinkUrl` values confirmed in the
 * `/ProxySwitch` payload: proxies carry the full switchcontext query, the
 * account holder's own record is a bare un-queried `inside.asp`.
 */
function proxySwitchHref(id: string, isSelf: boolean): string {
  return isSelf
    ? `${MP()}/inside.asp`
    : `${MP()}/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=${encodeURIComponent(id)}`;
}

/**
 * Marker the header leaves for the per-request proxy selector. The route
 * replaces it after a page is rendered, which is how every page gets the
 * selector without threading the model through ~25 page functions.
 */
export const PROXY_SELECTOR_PLACEHOLDER = '<!--PROXY_SELECTOR-->';

/**
 * The proxy-record selector MyChart renders in the header — on every page, not
 * just Home, which is where real instances put it.
 *
 * The `<details>` wrapper and styling are ours; the anchors inside are the part
 * that matters for fidelity and are what the scraper's HTML fallback parses:
 * `.proxySubjectLink`, `.proxySelectorDropDownNameEllipsis`, `currentContext`
 * on the active record, a `data-id`, and an href that carries the
 * switchcontext query for proxies but not for the account holder.
 *
 * In `script` discovery mode there are no anchors at all — only the React
 * personalization payload — so the control is a plain label. That's the shape
 * where a portal lists the records but never says which is active. The payload
 * stays generated here rather than living in an asset file: the scraper regexes
 * these `push(...)` calls straight out of the page.
 *
 * ⚠️ UNVERIFIED. Unlike the `/ProxySwitch` JSON, none of this markup has been
 * captured from a live instance; the class names and payload shape are inferred
 * from the original PR's guesses. Agreement between this and the scraper is
 * self-consistency, not evidence about real MyChart.
 */
export function renderProxySelector(model: ProxySelectorModel | null): string {
  if (!model) return '';
  const entries: Array<ProxySelectorEntry & { isSelf: boolean }> = [
    { ...model.self, isSelf: true },
    ...model.subjects.map(s => ({ ...s, isSelf: false })),
  ];
  const activeName = (entries.find(e => e.id === model.activeId) ?? entries[0]!).displayName; // entries always contains the self record

  if (rendersProxyAnchors()) {
    const anchors = entries.map(entry => {
      const selected = entry.id === model.activeId ? ' currentContext' : '';
      const label = entry.isSelf ? 'Access your record' : `Access ${entry.displayName}'s record`;
      // Every record carries its real id, self included — the account holder is
      // not identified by a missing one.
      return `        <a class="proxySubjectLink${selected}" data-id="${escapeHtml(entry.id)}" href="${proxySwitchHref(entry.id, entry.isSelf)}" aria-label="${escapeHtml(label)}">` +
        `<span class="proxySelectorDropDownNameEllipsis">${escapeHtml(entry.displayName)}</span></a>`;
    }).join('\n');
    return `<details class="proxy-switcher">
      <summary><span class="proxy-switcher-label">Viewing</span><strong>${escapeHtml(activeName)}</strong><span class="proxy-switcher-caret">\u25BE</span></summary>
      <div class="proxySelectorDropDown">
        <div class="proxy-switcher-heading">Switch patient record</div>
${anchors}
      </div>
    </details>`;
  }

  // `script` mode: minified personalization pushes with no selection flag.
  // Self carries an id like everyone else, so it's marked with an explicit
  // isSelf flag rather than by the absence of one.
  const pushes = entries.map(entry => {
    const selfPart = entry.isSelf ? ',isSelf:!0' : '';
    return `EpicPx.ReactContext.personalizations.proxySubjects.push({displayName:"${escapeJsString(entry.displayName)}",id:{type:"INTERNAL",value:"${escapeJsString(entry.id)}"}${selfPart}});`;
  }).join('');
  return `<span class="proxy-switcher-label">Viewing ${escapeHtml(activeName)}</span><script>${pushes}</script>`;
}
