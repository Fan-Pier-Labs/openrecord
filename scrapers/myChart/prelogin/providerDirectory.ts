/**
 * The provider and clinic directory behind "Find a Doctor".
 *
 * MyChart's open-scheduling workflow runs for anonymous visitors under
 * `/<mount>/OpenScheduling`. Its data comes from two POSTs the page makes
 * itself, both form-encoded (`$$WPUtil.postify`) and both requiring the
 * page's antiforgery token as a header:
 *
 *   POST Scheduling/Anonymous/GetSchedulingWorkflowData
 *        schedulingParameters[workflow]=NewProvider&isFirstLoad=true
 *     → Specialties[], WorkflowSettings{…}, HomeOrganizationName
 *
 *   POST Scheduling/Anonymous/GetSpecialtyData
 *        SpecialtyId=<id>
 *     → Providers[], Departments[], Locations[], ProviderDepartmentPairs[],
 *       ReasonsForVisit[], VisitTypes[]
 *
 * Verified on five instances (root-mounted and prefixed). The URL routes,
 * the parameter names and every key read below are identical on all five.
 * Two keys are additive on the newer scheduling build only —
 * `Providers[].SpecialtySearchTerms` and `WorkflowSettings.UseLegacyQuestionnaires`
 * — and are read as optional; nothing else differs between the builds.
 *
 * What this is and is not: it lists every provider the org has enabled for
 * online scheduling, once per specialty they are bookable under. It is the
 * bookable directory, not the whole medical staff, and it carries no NPI —
 * the only identifier is the instance's opaque WP-encoded provider id, which
 * is stable across specialties (so providers dedupe on it).
 *
 * Size: one specialty is 0.6–2 MB of JSON, and a large org lists twenty-plus
 * specialties. `specialties` narrows the crawl; `maxSpecialties` caps it. The
 * per-host permit in `shared/hostConcurrency.ts` paces whatever is left.
 */

import type { MyChartRequest } from '../core/myChartRequest';
import { logger } from '../../../shared/logger';
import { openPreloginPage, postForm } from './preloginSession';
import type { Clinic, PortalFeatures, Provider, ProviderDirectory, Specialty } from './types';

export const OPEN_SCHEDULING_PATH = '/OpenScheduling';
export const WORKFLOW_DATA_PATH = '/Scheduling/Anonymous/GetSchedulingWorkflowData';
export const SPECIALTY_DATA_PATH = '/Scheduling/Anonymous/GetSpecialtyData';

// ── Raw shapes, as the instance sends them ───────────────────────────────────
// Only the keys the scraper reads. Everything else passes through untyped.

type RawSpecialty = { Id: string; Name: string };

type RawWorkflowSettings = {
  AllowSelfSignup?: boolean;
  IsLoginEnabled?: boolean;
  IsWorkflowTurnedOn?: boolean;
  DisableScheduleAsGuest?: boolean;
  AllowOnMyWay?: boolean;
  HasOnDemandVideoVisitSecurity?: boolean;
  /** Newer build only. Not surfaced; listed so the drift is written down. */
  UseLegacyQuestionnaires?: boolean;
};

export type RawWorkflowData = {
  WorkflowSettings: RawWorkflowSettings | null;
  Specialties: RawSpecialty[];
  HomeOrganizationName?: string | null;
};

type RawSpecialtyRef = { Title?: string | null };

type RawProvider = {
  ID: string;
  Name: string;
  NameLastFirst?: string | null;
  Credentials?: string | null;
  Specialties?: RawSpecialtyRef[] | null;
  Gender?: string | null;
  Languages?: string[] | null;
  PhotoUrl?: string | null;
  BioSlug?: string | null;
  /** Newer build only. */
  SpecialtySearchTerms?: { Title?: string | null }[] | null;
};

type RawDepartment = {
  ID: string;
  Name: string;
  Address?: string[] | null;
  PhoneNumber?: string | null;
  OverridePhoneNumber?: string | null;
  IsUsingOverridePhoneNumber?: boolean;
  Coordinates?: { Latitude: number | null; Longitude: number | null } | null;
  TimeZone?: { CacheTimeZone?: { Title?: string | null } | null } | null;
};

type RawPair = { ProviderId: string; DepartmentId: string };

export type RawSpecialtyData = {
  Providers: RawProvider[];
  Departments: RawDepartment[];
  ProviderDepartmentPairs: RawPair[];
};

// ── Parsing ──────────────────────────────────────────────────────────────────

function requireArray<T>(value: unknown, what: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${what} is missing from the scheduling response — the endpoint shape changed`);
  }
  return value as T[];
}

export function parseSpecialties(data: RawWorkflowData): Specialty[] {
  return requireArray<RawSpecialty>(data.Specialties, 'Specialties')
    .filter((s) => typeof s?.Id === 'string' && typeof s?.Name === 'string')
    .map((s) => ({ id: s.Id, name: s.Name }));
}

export function parseFeatures(data: RawWorkflowData): PortalFeatures {
  const s = data.WorkflowSettings ?? {};
  return {
    selfSignup: s.AllowSelfSignup === true,
    loginEnabled: s.IsLoginEnabled !== false,
    openScheduling: s.IsWorkflowTurnedOn !== false,
    scheduleAsGuest: s.DisableScheduleAsGuest !== true,
    onMyWay: s.AllowOnMyWay === true,
    onDemandVideoVisits: s.HasOnDemandVideoVisitSecurity === true,
  };
}

function titles(refs: { Title?: string | null }[] | null | undefined): string[] {
  return (refs ?? []).map((r) => r?.Title?.trim() ?? '').filter((t) => t.length > 0);
}

/** A department's phone: the override wins when the org turned it on. */
function departmentPhone(d: RawDepartment): string | null {
  const phone = d.IsUsingOverridePhoneNumber && d.OverridePhoneNumber ? d.OverridePhoneNumber : d.PhoneNumber;
  return phone?.trim() || null;
}

export function parseClinic(d: RawDepartment): Clinic {
  const lat = d.Coordinates?.Latitude;
  const lng = d.Coordinates?.Longitude;
  return {
    id: d.ID,
    name: d.Name,
    addressLines: (d.Address ?? []).filter((line) => typeof line === 'string' && line.trim().length > 0),
    phone: departmentPhone(d),
    coordinates: typeof lat === 'number' && typeof lng === 'number' ? { latitude: lat, longitude: lng } : null,
    timeZone: d.TimeZone?.CacheTimeZone?.Title?.trim() || null,
  };
}

/**
 * Merge one specialty's payload into the running directory.
 *
 * A provider listed under two specialties arrives twice with the same `ID`;
 * the merge keeps one record and unions the clinics and finder specialties.
 */
export function mergeSpecialtyData(
  data: RawSpecialtyData,
  specialty: Specialty,
  providers: Map<string, Provider>,
  clinics: Map<string, Clinic>,
): void {
  const rawProviders = requireArray<RawProvider>(data.Providers, 'Providers');
  const rawDepartments = requireArray<RawDepartment>(data.Departments, 'Departments');
  const pairs = Array.isArray(data.ProviderDepartmentPairs) ? data.ProviderDepartmentPairs : [];

  for (const d of rawDepartments) {
    if (typeof d?.ID !== 'string') continue;
    if (!clinics.has(d.ID)) clinics.set(d.ID, parseClinic(d));
  }

  const clinicIdsByProvider = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (typeof p?.ProviderId !== 'string' || typeof p?.DepartmentId !== 'string') continue;
    let set = clinicIdsByProvider.get(p.ProviderId);
    if (!set) clinicIdsByProvider.set(p.ProviderId, (set = new Set()));
    set.add(p.DepartmentId);
  }

  for (const raw of rawProviders) {
    if (typeof raw?.ID !== 'string' || typeof raw?.Name !== 'string') continue;
    const clinicIds = [...(clinicIdsByProvider.get(raw.ID) ?? [])];
    const existing = providers.get(raw.ID);
    if (existing) {
      existing.clinicIds = [...new Set([...existing.clinicIds, ...clinicIds])];
      if (!existing.finderSpecialties.includes(specialty.name)) existing.finderSpecialties.push(specialty.name);
      continue;
    }
    const provider: Provider = {
      id: raw.ID,
      name: raw.Name,
      nameLastFirst: raw.NameLastFirst ?? raw.Name,
      credentials: raw.Credentials ?? '',
      specialties: titles(raw.Specialties),
      gender: raw.Gender ?? '',
      languages: (raw.Languages ?? []).filter((l): l is string => typeof l === 'string' && l.length > 0),
      photoUrl: raw.PhotoUrl?.trim() || null,
      bioSlug: raw.BioSlug?.trim() || null,
      clinicIds,
      finderSpecialties: [specialty.name],
    };
    if (Array.isArray(raw.SpecialtySearchTerms)) provider.searchTerms = titles(raw.SpecialtySearchTerms);
    providers.set(raw.ID, provider);
  }
}

// ── Fetching ─────────────────────────────────────────────────────────────────

export type ProviderDirectoryOptions = {
  /**
   * Only crawl these specialties, matched case-insensitively by name or by id.
   * Unset means every specialty the instance lists.
   */
  specialties?: string[];
  /** Stop after this many specialties (after `specialties` filtering). */
  maxSpecialties?: number;
};

/** Open the workflow page and read the specialty list and feature flags. */
export async function fetchSchedulingWorkflow(
  request: MyChartRequest,
): Promise<{ token: string | null; data: RawWorkflowData }> {
  const page = await openPreloginPage(request, OPEN_SCHEDULING_PATH);
  const data = await postForm<RawWorkflowData>(
    request,
    WORKFLOW_DATA_PATH,
    page.token,
    { schedulingParameters: { workflow: 'NewProvider' }, isFirstLoad: true },
    OPEN_SCHEDULING_PATH,
  );
  return { token: page.token, data };
}

/**
 * One specialty's payload: its providers, departments and the pairs joining
 * them, plus the visit types and reasons for visit the slot search needs.
 *
 * Shared with `openSlots.ts` so the two-POST walk exists in one place.
 */
export async function fetchSpecialtyData<T = RawSpecialtyData>(
  request: MyChartRequest,
  token: string | null,
  specialtyId: string,
): Promise<T> {
  return postForm<T>(request, SPECIALTY_DATA_PATH, token, { SpecialtyId: specialtyId }, OPEN_SCHEDULING_PATH);
}

export function selectSpecialties(all: Specialty[], options: ProviderDirectoryOptions): Specialty[] {
  let chosen = all;
  if (options.specialties && options.specialties.length > 0) {
    const wanted = new Set(options.specialties.map((s) => s.trim().toLowerCase()));
    chosen = all.filter((s) => wanted.has(s.name.toLowerCase()) || wanted.has(s.id.toLowerCase()));
  }
  if (options.maxSpecialties !== undefined && options.maxSpecialties >= 0) {
    chosen = chosen.slice(0, options.maxSpecialties);
  }
  return chosen;
}

/**
 * Crawl the "Find a Doctor" workflow into one deduplicated directory.
 *
 * Specialties are fetched concurrently; the per-host permit is the throttle.
 */
export async function fetchProviderDirectory(
  request: MyChartRequest,
  options: ProviderDirectoryOptions = {},
): Promise<ProviderDirectory> {
  const { token, data } = await fetchSchedulingWorkflow(request);
  const all = parseSpecialties(data);
  const chosen = selectSpecialties(all, options);
  logger.debug(`open scheduling lists ${all.length} specialties on ${request.hostname}; crawling ${chosen.length}`);

  const providers = new Map<string, Provider>();
  const clinics = new Map<string, Clinic>();
  const payloads = await Promise.all(
    chosen.map((specialty) => fetchSpecialtyData(request, token, specialty.id)),
  );
  chosen.forEach((specialty, i) => mergeSpecialtyData(payloads[i]!, specialty, providers, clinics));

  return {
    specialties: all,
    providers: [...providers.values()],
    clinics: [...clinics.values()],
    features: parseFeatures(data),
    organizationName: data.HomeOrganizationName?.trim() || null,
  };
}
