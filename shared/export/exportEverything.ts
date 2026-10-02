/**
 * Export a patient's whole chart into one folder: every category's data, every
 * visit note and After Visit Summary, every message thread and attachment,
 * every Document Center file, every billing statement and every imaging study's
 * pictures — plus an `index.json` listing each record once, which is what
 * `organizeExport` groups by health issue.
 *
 * Deterministic on purpose. Pushing a chart through a model to "export" it
 * loses whatever does not fit in its context and differs run to run; this walks
 * the registry, so a read capability added there is exported the same day.
 *
 * Every read goes through `executeCapability`, one call per item, so the
 * active-patient assertion runs before each — a patient switched mid-export
 * makes the rest of the export refuse, never write a family member's records
 * into this folder. Calls are sequential: an export is a background job, and
 * one session's re-login and patient state are simplest unshared.
 *
 * File I/O is the {@link ExportFolder} the caller passes; each client decides
 * where the folder lives.
 */

import type { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import { renderMarkdown } from '../../scrapers/myChart/processors/markdown';
import { safeFileName } from '../../scrapers/myChart/core/safeFileName';
import { convertCloToBitmap } from '../../scrapers/myChart/clo-image-parser/clo_to_bitmap';
import { convertBitmapToJpgPureJs } from '../../scrapers/myChart/clo-image-parser/exporters/to_jpg_purejs';
import {
  executeCapability,
  FULL_SCRAPE_CAPABILITIES,
  type CapabilityContext,
  type FilePayload,
  type StudyImagePayload,
} from '../capabilities';

export interface ExportFolder {
  /** Write one file at a `/`-separated path under the export root, creating folders as needed. */
  write(relativePath: string, data: string | Uint8Array): Promise<void>;
  read(relativePath: string): Promise<string>;
}

export const EXPORT_FORMAT = 'openrecord-export/1';
export const EXPORT_INDEX_FILE = 'index.json';

/** One record in the export — what a person would call "a thing in my chart". */
export interface ExportItem {
  /** Short and stable within this export (`visit-12`), so a model can cite it back. */
  id: string;
  category: string;
  /** `YYYY-MM-DD`, or null when MyChart gave no date. */
  date: string | null;
  title: string;
  /** Provider, diagnoses, components — the context that says which health issue it belongs to. */
  about: string;
  /** Paths relative to the export root. The first is the item's own Markdown record. */
  files: string[];
}

interface ExportFailure {
  what: string;
  error: string;
}

export interface ExportIndex {
  format: typeof EXPORT_FORMAT;
  hostname: string;
  /** Whose chart this is — the `patient` asserted, or the account holder. */
  patient: string;
  exportedAt: string;
  items: ExportItem[];
  failures: ExportFailure[];
}

export interface ExportOptions {
  hostname: string;
  /** Passed to every read, so each asserts the same patient. Omitted means the account holder. */
  patient?: string | undefined;
  ctx?: CapabilityContext | undefined;
  onProgress?: (line: string) => void;
  now?: Date;
}

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

/**
 * Drop null, empty-string and empty-collection fields, recursively, from what a
 * person reads. A visit is ~90 fields of which a third are empty, and a page of
 * "(none)" buries the five that matter. Only the per-record Markdown: `data/`
 * keeps every field.
 */
export function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    const kept = value.map(prune).filter((v) => v !== undefined);
    return kept.length ? kept : undefined;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array)) {
    const kept = Object.entries(value).flatMap(([k, v]) => {
      const p = prune(v);
      return p === undefined ? [] : [[k, p] as const];
    });
    return kept.length ? Object.fromEntries(kept) : undefined;
  }
  return value === null || value === '' ? undefined : value;
}

/** Markdown for a person, or null when nothing in it survives {@link prune}. */
function readable(value: unknown, title: string): string | null {
  const kept = prune(value);
  return kept === undefined ? null : renderMarkdown(kept, title);
}

/** `a.b.c` into nested records, `undefined` the moment one is missing. */
function at(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const key of path.split('.')) cur = rec(cur)[key];
  return cur;
}

function joinAbout(parts: unknown[]): string {
  return parts.map(str).filter(Boolean).join(' · ').slice(0, 400);
}

/**
 * MyChart dates come as ISO instants, `MM/DD/YYYY`, `Jan 10, 2026` and
 * `/Date(ms)/` depending on the endpoint. All of them become `YYYY-MM-DD`
 * without a trip through UTC, which would move a local midnight to the day
 * before for anyone east of Greenwich.
 */
export function toIsoDate(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (us) return `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  const ms = /^\/Date\((-?\d+)\)\/$/.exec(s);
  const parsed = ms ? new Date(Number(ms[1])) : new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/**
 * Where each category's records are in its `json` payload, and what to call
 * one. A category with no entry here is still exported in full under `data/`;
 * it just has no per-record files to group.
 */
interface ItemSource {
  capability: string;
  /** The `id` prefix, and the drill-down key. */
  kind: string;
  category: string;
  folder: string;
  list: (data: unknown) => unknown[];
  title: (item: Rec) => string;
  date: (item: Rec) => unknown;
  about: (item: Rec) => string;
}

const visitAbout = (v: Rec) =>
  joinAbout([
    v.PrimaryProviderName,
    at(v, 'PrimaryDepartment.Name'),
    v.ChiefComplaint,
    ...list(v.Diagnoses).map((d) => rec(d).Description),
    ...list(v.SurgicalProcedures).map((p) => rec(p).Name),
  ]);

const resultAbout = (o: Rec) => {
  const first = rec(list(o.results)[0]);
  return joinAbout([
    at(first, 'orderMetadata.orderProviderName'),
    ...list(at(first, 'orderMetadata.associatedDiagnoses')).map((d) => (typeof d === 'string' ? d : rec(d).name)),
    ...list(first.resultComponents).map((c) => at(c, 'componentInfo.name')),
    at(first, 'studyResult.impression.contentAsString'),
  ]);
};

const resultDate = (o: Rec) => at(list(o.results)[0], 'orderMetadata.prioritizedInstantISO');

const billingAccounts = (d: unknown) => list(rec(d).accounts).map(rec);

const ITEM_SOURCES: readonly ItemSource[] = [
  {
    capability: 'get_past_visits', kind: 'visit', category: 'Visit', folder: 'Visits',
    list: (d) => list(rec(d).visits),
    title: (v) => str(v.VisitTypeName) || 'Visit',
    date: (v) => v.instantISO ?? v.PrimaryDate,
    about: visitAbout,
  },
  {
    capability: 'get_upcoming_visits', kind: 'upcoming', category: 'Upcoming visit', folder: 'Upcoming visits',
    list: (d) => list(rec(d).visits),
    title: (v) => str(v.VisitTypeName) || 'Visit',
    date: (v) => v.instantISO ?? v.PrimaryDate,
    about: visitAbout,
  },
  {
    capability: 'get_lab_results', kind: 'lab', category: 'Lab result', folder: 'Lab results',
    list: (d) => list(rec(d).orders),
    title: (o) => str(o.orderName) || 'Lab result',
    date: resultDate,
    about: resultAbout,
  },
  {
    capability: 'get_imaging_results', kind: 'imaging', category: 'Imaging', folder: 'Imaging',
    list: (d) => list(rec(d).orders),
    title: (o) => str(o.orderName) || 'Imaging study',
    date: resultDate,
    about: resultAbout,
  },
  {
    capability: 'get_messages', kind: 'message', category: 'Message', folder: 'Messages',
    list: (d) => list(rec(d).conversations),
    title: (c) => str(c.subject) || 'Conversation',
    date: (c) => c.latestMessageInstantISO,
    about: (c) => joinAbout([...list(c.audienceNames), c.previewText]),
  },
  {
    capability: 'get_documents', kind: 'document', category: 'Document', folder: 'Documents',
    list: (d) => list(rec(d).documents),
    title: (doc) => joinAbout([doc.docType, doc.docDesc]) || 'Document',
    date: (doc) => doc.dateISO ?? doc.date,
    about: (doc) => joinAbout([doc.docExt]),
  },
  {
    capability: 'get_letters', kind: 'letter', category: 'Letter', folder: 'Letters',
    list: (d) => list(rec(d).letters),
    title: (l) => str(l.reason) || 'Letter',
    date: (l) => l.dateISO,
    about: (l) => joinAbout([l.providerName]),
  },
  {
    capability: 'get_billing', kind: 'bill', category: 'Bill', folder: 'Billing',
    list: (d) => billingAccounts(d).flatMap((a) => list(a.visits)),
    title: (v) => str(v.Description) || 'Billed visit',
    date: (v) => v.StartDateDisplay,
    about: (v) =>
      joinAbout([v.Provider, v.SelfAmountDue && `You owe ${str(v.SelfAmountDue)}`, ...list(v.ProcedureList).map((p) => rec(p).DescriptionText)]),
  },
  {
    capability: 'get_billing', kind: 'statement', category: 'Billing statement', folder: 'Billing statements',
    list: (d) => billingAccounts(d).flatMap((a) => list(a.statements)),
    title: (s) => joinAbout(['Statement', s.FormattedDateDisplay]),
    date: (s) => s.dateISO,
    about: (s) => joinAbout([s.StatementAmountDisplay, s.Description]),
  },
  {
    capability: 'get_medications', kind: 'medication', category: 'Medication', folder: 'Medications',
    list: (d) => list(rec(d).prescriptions),
    title: (m) => str(m.name) || 'Medication',
    date: (m) => m.startDate,
    about: (m) => joinAbout([m.sig, at(m, 'authorizingProvider.name')]),
  },
  {
    capability: 'get_health_issues', kind: 'issue', category: 'Health issue', folder: 'Health issues',
    list: (d) => list(rec(d).dataList).map((x) => rec(x).healthIssueItem),
    title: (i) => str(i.name) || 'Health issue',
    date: (i) => i.formattedDateNoted,
    about: () => '',
  },
  {
    capability: 'get_allergies', kind: 'allergy', category: 'Allergy', folder: 'Allergies',
    list: (d) => list(rec(d).dataList).map((x) => rec(x).allergyItem),
    title: (a) => str(a.name) || 'Allergy',
    date: (a) => a.formattedDateNoted,
    about: (a) => joinAbout([a.reaction, a.severity]),
  },
  {
    capability: 'get_immunizations', kind: 'immunization', category: 'Immunization', folder: 'Immunizations',
    list: (d) => list(rec(d).immunizations),
    title: (i) => str(i.name) || 'Immunization',
    date: (i) => list(i.formattedAdministeredDates)[0],
    about: (i) => joinAbout([i.organizationName]),
  },
  {
    capability: 'get_medical_history', kind: 'history', category: 'Past diagnosis', folder: 'Medical history',
    list: (d) => list(at(d, 'medicalHistory.diagnoses')),
    title: (x) => str(x.diagnosisName) || 'Diagnosis',
    date: (x) => x.diagnosisDate,
    about: () => '',
  },
  {
    capability: 'get_medical_history', kind: 'surgery', category: 'Past surgery', folder: 'Medical history',
    list: (d) => list(at(d, 'surgicalHistory.surgeries')),
    title: (x) => str(x.surgeryName) || 'Surgery',
    date: (x) => x.surgeryDate,
    about: () => '',
  },
  {
    capability: 'get_referrals', kind: 'referral', category: 'Referral', folder: 'Referrals',
    list: (d) => list(rec(d).referralList),
    title: (r) => joinAbout(['Referral to', r.referredToProviderName || r.referredToFacility]),
    date: (r) => r.start || r.creationDate,
    about: (r) => joinAbout([r.referredByProviderName, r.statusString]),
  },
  {
    capability: 'get_upcoming_orders', kind: 'order', category: 'Upcoming order', folder: 'Upcoming orders',
    list: (d) => list(rec(d).orderList),
    title: (o) => str(o.orderName) || 'Order',
    date: (o) => o.orderedDate,
    about: (o) => joinAbout([o.orderType, o.orderedByProvider, o.facilityName]),
  },
];

/** Hands out unique paths, so two visits of the same type on the same day both survive. */
class PathClaims {
  private readonly taken = new Set<string>();
  claim(folder: string, base: string, ext: string): string {
    const name = safeFileName(base, 'record');
    for (let n = 1; ; n++) {
      const candidate = `${folder}/${n === 1 ? name : `${name} (${n})`}${ext}`;
      if (!this.taken.has(candidate.toLowerCase())) {
        this.taken.add(candidate.toLowerCase());
        return candidate;
      }
    }
  }
}

function extOf(fileName: string): string {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(fileName);
  return m ? m[0].toLowerCase() : '';
}

interface Collected {
  item: ExportItem;
  source: Rec;
}

export async function exportEverything(
  request: MyChartRequest,
  folder: ExportFolder,
  options: ExportOptions,
): Promise<ExportIndex> {
  const { ctx, onProgress = () => {} } = options;
  const patientArg = options.patient !== undefined ? { patient: options.patient } : {};
  const failures: ExportFailure[] = [];
  const claims = new PathClaims();

  const read = async (id: string, args: Rec = {}) =>
    executeCapability(request, id, { ...patientArg, mode: 'json', ...args }, ctx);
  const attempt = async <T>(what: string, fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await fn();
    } catch (err) {
      failures.push({ what, error: (err as Error).message });
      onProgress(`  ✗ ${what}: ${(err as Error).message}`);
      return undefined;
    }
  };
  const writeFile = async (path: string, data: string | Uint8Array) => {
    await folder.write(path, data);
    return path;
  };

  // 1. Every argument-free category, as data and as readable Markdown.
  const data = new Map<string, unknown>();
  for (const capability of FULL_SCRAPE_CAPABILITIES) {
    onProgress(`  ${capability.title}`);
    const payload = await attempt(capability.title, () => read(capability.id));
    if (payload === undefined) continue;
    data.set(capability.id, payload);
    await writeFile(`data/${capability.id}.json`, JSON.stringify(payload, null, 2));
    await writeFile(`data/${capability.id}.md`, renderMarkdown(payload, capability.title));
  }

  // 2. One record per thing in the chart.
  const collected = new Map<string, Collected[]>();
  const items: ExportItem[] = [];
  for (const source of ITEM_SOURCES) {
    if (!data.has(source.capability)) continue;
    const bucket: Collected[] = [];
    for (const raw of source.list(data.get(source.capability))) {
      const entry = rec(raw);
      const title = source.title(entry);
      const date = toIsoDate(source.date(entry));
      const path = claims.claim(`records/${source.folder}`, `${date ?? 'undated'} ${title}`, '.md');
      const item: ExportItem = {
        id: `${source.kind}-${bucket.length + 1}`,
        category: source.category,
        date,
        title,
        about: source.about(entry),
        files: [path],
      };
      bucket.push({ item, source: entry });
      items.push(item);
    }
    collected.set(source.kind, bucket);
  }

  const sections = new Map<ExportItem, string[]>();
  // A message thread supersedes the listing's copy of the same messages.
  const fuller = new Map<ExportItem, unknown>();
  const append = (item: ExportItem, markdown: string | null) => {
    if (markdown === null) return;
    sections.set(item, [...(sections.get(item) ?? []), markdown]);
  };
  // A file sits beside its record and shares its name: `2026-01-10 X-ray.md`, `2026-01-10 X-ray.pdf`.
  const saveFile = async (item: ExportItem, payload: FilePayload, suffix?: string) => {
    const record = item.files[0]!;
    const dir = record.slice(0, record.lastIndexOf('/'));
    const base = record.slice(dir.length + 1).replace(/\.md$/, '');
    const path = claims.claim(dir, suffix ? `${base} - ${suffix}` : base, extOf(payload.fileName));
    item.files.push(await writeFile(path, payload.bytes));
  };

  // 3. What each record points at.
  for (const { item, source } of collected.get('visit') ?? []) {
    const csn = str(source.Csn);
    if (!csn) continue;
    onProgress(`  Notes: ${item.date ?? ''} ${item.title}`);
    const notes = rec(await attempt(`Notes for ${item.title} (${item.date})`, () => read('get_visit_notes', { csn })));
    for (const note of list(notes.noteList).map(rec)) {
      const content = await attempt(`Note "${str(note.displayName)}" (${item.date})`, () =>
        read('get_note_content', { csn, lrp_id: str(notes.lrpID), hno_id: str(note.hnoID), hno_dat: str(note.hnoDAT) }),
      );
      if (content === undefined) continue;
      append(item, readable(content, str(note.displayName) || 'Clinical note'));
      // "Office Visit" says nothing about which issue it was for; the note's opening lines usually do.
      if (!item.about.includes('Note:')) {
        item.about = joinAbout([item.about, `Note: ${str(rec(content).reportContentText).replace(/\s+/g, ' ').slice(0, 200)}`]);
      }
    }
    const avs = await attempt(`After Visit Summary for ${item.title} (${item.date})`, () => read('get_visit_avs', { csn }));
    if (avs !== undefined) append(item, readable(avs, 'After Visit Summary'));
  }

  for (const { item, source } of collected.get('message') ?? []) {
    const conversationId = str(source.hthId);
    if (!conversationId) continue;
    onProgress(`  Message: ${item.title}`);
    const thread = await attempt(`Message thread "${item.title}"`, () =>
      read('get_message_thread', { conversation_id: conversationId }),
    );
    if (thread === undefined) continue;
    fuller.set(item, thread);
    const attachments = list(rec(thread).messages).flatMap((m) => list(rec(m).attachments).map(rec));
    for (const attachment of attachments) {
      const dcsId = str(attachment.dcsId);
      if (!dcsId) continue;
      const file = await attempt(`Attachment "${str(attachment.name)}" in "${item.title}"`, () =>
        read('get_message_attachment', { conversation_id: conversationId, attachment_id: dcsId }),
      );
      if (file) {
        const payload = file as FilePayload;
        await saveFile(item, payload, payload.fileName.replace(/\.[A-Za-z0-9]{1,8}$/, ''));
      }
    }
  }

  for (const { item, source } of collected.get('document') ?? []) {
    const dcsId = str(source.dcsID);
    if (!dcsId) continue;
    onProgress(`  Document: ${item.title}`);
    const file = await attempt(`Document "${item.title}" (${item.date})`, () => read('download_document', { document_id: dcsId }));
    if (file) await saveFile(item, file as FilePayload);
  }

  for (const { item, source } of collected.get('statement') ?? []) {
    const recordId = str(source.RecordID);
    if (!recordId) continue;
    onProgress(`  ${item.title}`);
    const file = await attempt(item.title, () => read('download_billing_statement', { record_id: recordId }));
    if (file) await saveFile(item, file as FilePayload);
  }

  for (const { item, source } of collected.get('letter') ?? []) {
    const hnoId = str(source.hnoId);
    const csn = str(source.csn);
    if (!hnoId || !csn) continue;
    const letter = await attempt(`Letter "${item.title}"`, () => read('get_letter_details', { hno_id: hnoId, csn }));
    if (letter !== undefined) append(item, readable(letter, 'Letter'));
  }

  for (const { item, source } of collected.get('imaging') ?? []) {
    const imageId = str(source.image_id);
    if (!imageId) continue;
    onProgress(`  Imaging: ${item.title} (this can take a while)`);
    const study = (await attempt(`Images for ${item.title} (${item.date})`, () =>
      read('download_imaging_study', { image_id: imageId, study_name: item.title }),
    )) as StudyImagePayload | undefined;
    if (!study) continue;
    for (const error of study.errors) failures.push({ what: `Images for ${item.title}`, error });
    const dir = item.files[0]!.replace(/\.md$/, ' - images');
    let n = 0;
    for (const image of study.images) {
      if (!image.pixelData?.length) continue;
      try {
        const bitmap = convertCloToBitmap(
          Buffer.from(image.pixelData),
          image.wrapperData ? Buffer.from(image.wrapperData) : undefined,
        );
        n++;
        const series = safeFileName(image.seriesDescription, 'image');
        item.files.push(await writeFile(`${dir}/${String(n).padStart(3, '0')} ${series}.jpg`, convertBitmapToJpgPureJs(bitmap).buffer));
      } catch (err) {
        failures.push({ what: `Image ${image.index} of ${item.title}`, error: (err as Error).message });
      }
    }
  }

  // 4. Each record's own file: what MyChart listed, then what it pointed at.
  for (const bucket of collected.values()) {
    for (const { item, source } of bucket) {
      const attached = item.files.slice(1).map((f) => `- [${f.slice(f.lastIndexOf('/') + 1)}](<${relativeFrom(item.files[0]!, f)}>)`);
      const body = [
        `# ${item.title}`,
        '',
        `${item.category}${item.date ? ` · ${item.date}` : ''} · \`${item.id}\``,
        ...(attached.length ? ['', '## Files', '', ...attached] : []),
        '',
        readable(fuller.get(item) ?? source, 'As listed in MyChart') ?? '',
        ...(sections.get(item) ?? []).flatMap((s) => ['', s]),
      ];
      await writeFile(item.files[0]!, body.join('\n'));
    }
  }

  const index: ExportIndex = {
    format: EXPORT_FORMAT,
    hostname: options.hostname,
    patient: options.patient ?? 'me',
    exportedAt: (options.now ?? new Date()).toISOString(),
    items,
    failures,
  };
  await writeFile('README.md', renderExportReadme(index, [...data.keys()]));
  // Written last: its presence is what says the export finished.
  await writeFile(EXPORT_INDEX_FILE, JSON.stringify(index, null, 2));
  return index;
}

/** A link from one export file to another, both relative to the export root. */
export function relativeFrom(fromFile: string, toFile: string): string {
  const from = fromFile.split('/').slice(0, -1);
  const to = toFile.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  return [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/');
}

function renderExportReadme(index: ExportIndex, categories: string[]): string {
  const counts = new Map<string, number>();
  for (const item of index.items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  const files = index.items.reduce((n, item) => n + item.files.length, 0);
  return [
    `# Medical record export`,
    '',
    `From ${index.hostname}, exported ${index.exportedAt.slice(0, 10)} by OpenRecord.`,
    '',
    `${index.items.length} records, ${files} files, ${categories.length} data categories.`,
    '',
    '| Records | Count |',
    '| --- | --- |',
    ...[...counts].map(([category, n]) => `| ${category} | ${n} |`),
    '',
    '## What is where',
    '',
    '- `records/` — one Markdown file per visit, lab, message, document, bill and so on. Visit notes and',
    '  After Visit Summaries are inside their visit; documents, statements, attachments and imaging',
    '  pictures sit beside the record they belong to.',
    '- `data/` — every category exactly as OpenRecord reads it, as JSON (for software) and Markdown (for people).',
    '- `index.json` — every record with its id, date, title and files.',
    '- `By health issue/` — appears once the records have been grouped (ask Claude to "group my export by health issue").',
    ...(index.failures.length
      ? ['', `## Not exported (${index.failures.length})`, '', ...index.failures.map((f) => `- ${f.what}: ${f.error}`)]
      : []),
    '',
  ].join('\n');
}
