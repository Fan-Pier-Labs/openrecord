/**
 * eUnity's AmfServices wire layer: build the AMF3 request frames the viewer
 * sends, and parse the binary responses that come back.
 *
 * The eUnity server uses a proprietary AMF protocol:
 * - Request/response type: com.clientoutlook.web.metaservices.AmfServicesMessage
 * - messageType = "call" for requests, "response" for responses
 * - body = AmfServicesRequest for requests, AmfServicesResponse for responses
 *
 * Protocol reverse-engineered from eUnity's Dart/WASM viewer network traffic.
 *
 * Everything here is pure: buffers in, plain objects out, no network. The
 * requests go over the wire in `session.ts`; the images they unlock are pulled
 * in `download.ts`.
 */
import { logger } from '../../../shared/logger';
import { type Amf3Object, collectAmf3Objects, decodeAmf3, unwrapAmf3 } from './amf3Reader';
import { Amf3Writer } from '../../../shared/amf3Writer';

// ─── AMF3 Request Construction ───

/**
 * Build an AMF3 call to AmfServicesServlet.
 *
 * Protocol (reverse-engineered from captured browser traffic):
 * - Outer object: com.clientoutlook.web.metaservices.AmfServicesMessage
 *   - messageID: incrementing string ID (e.g. "HTTPSimpleLoader_1")
 *   - messageType: "call"
 *   - body: com.clientoutlook.web.metaservices.AmfServicesRequest
 *     - service: service class name (e.g. "StudyService")
 *     - method: method name (e.g. "getStudyListMeta")
 *     - parameters: array of method arguments (NOT "args")
 *
 * Member order matters for AMF3 sealed objects: messageID comes BEFORE messageType.
 */
function buildAmfCall(
  messageID: string,
  service: string,
  method: string,
  parameters: ((w: Amf3Writer) => void)[],
): Buffer {
  // Callback params are numbered by nesting depth (w1, w2, …): each callback
  // writes to exactly the writer it is handed, so the code stays correct by
  // construction even if a writer method ever hands down a sub-writer.
  const w = new Amf3Writer();
  w.writeTypedObject(
    'com.clientoutlook.web.metaservices.AmfServicesMessage',
    ['messageID', 'messageType', 'body'],
    [
      (w1) => w1.writeString(messageID),
      (w1) => w1.writeString('call'),
      (w1) => w1.writeTypedObject(
        'com.clientoutlook.web.metaservices.AmfServicesRequest',
        ['service', 'method', 'parameters'],
        [
          (w2) => w2.writeString(service),
          (w2) => w2.writeString(method),
          (w2) => w2.writeArray(parameters),
        ],
      ),
    ],
  );
  return w.toBuffer();
}

/**
 * Build the getStudyListMeta AMF request.
 *
 * This is the first call the WASM viewer makes after getting a JSESSIONID.
 * It initializes the server-side session for a specific study, which is
 * required before CustomImageServlet will serve image data (otherwise 403).
 *
 * The single parameter is a StudyListRequest — an Externalizable AMF3 object
 * with a custom binary format containing:
 *   - 4-byte BE header (value 2)
 *   - String "getStudyList" (method qualifier)
 *   - String "1.2.0" (version)
 *   - Anonymous dynamic object with:
 *     - notUsed: true
 *     - requestedPHI: ArrayCollection wrapping RequestedPHI objects
 *     - environment: Environment object
 *
 * Reverse-engineered from captured browser AMF traffic (748 bytes).
 */
export function buildGetStudyListMetaRequest(
  accession: string,
  serviceInstance: string,
  patientId: string,
): Buffer {
  // Callback params are numbered by nesting depth (w1…w6): each callback
  // writes to exactly the writer it is handed, so the code stays correct by
  // construction even if a writer method ever hands down a sub-writer.
  return buildAmfCall('HTTPSimpleLoader_1', 'StudyService', 'getStudyListMeta', [
    (w1) => {
      // StudyListRequest is Externalizable — custom binary format
      w1.writeExternalizableObject(
        'com.clientoutlook.web.metaservices.StudyListRequest',
        (w2) => {
          // 4-byte big-endian header (observed value: 2)
          w2.writeBE32(2);
          // Method qualifier string
          w2.writeString('getStudyList');
          // Version string
          w2.writeString('1.2.0');
          // Anonymous sealed object with 3 members and empty class name.
          // NOT dynamic — the browser uses plain sealed traits (0x33 = 3 members, no dynamic flag).
          w2.writeTypedObject(
            '', // empty class name = anonymous object
            ['notUsed', 'requestedPHI', 'environment'],
            [
              // notUsed: true
              (w3) => w3.writeTrue(),
              // requestedPHI: ArrayCollection wrapping RequestedPHI objects
              (w3) => {
                // ArrayCollection is Externalizable — wraps a standard AMF3 array
                w3.writeExternalizableObject(
                  'flex.messaging.io.ArrayCollection',
                  (w4) => {
                    w4.writeArray([
                      (w5) => {
                        // RequestedPHI sealed object (8 members)
                        w5.writeTypedObject(
                          'com.clientoutlook.data.RequestedPHI',
                          [
                            'patientId',
                            'studyUID',
                            'accessionNumber',
                            'serviceInstanceParameter',
                            'serviceInstanceProperties',
                            'serviceInstance',
                            'originalServiceInstanceParameter',
                            'originalServiceInstance',
                          ],
                          [
                            (w6) => w6.writeString(patientId),        // e.g. "<MRN>$$$<site>"
                            (w6) => w6.writeNull(),                    // studyUID: null
                            (w6) => w6.writeString(accession),         // e.g. "E48330984"
                            (w6) => w6.writeString(''),                // serviceInstanceParameter: empty
                            (w6) => w6.writeNull(),                    // serviceInstanceProperties: null
                            (w6) => w6.writeString(serviceInstance),   // e.g. "EXAMPLEstudystrategy"
                            (w6) => w6.writeString(''),                // originalServiceInstanceParameter: empty
                            (w6) => w6.writeString(serviceInstance),   // originalServiceInstance: same
                          ],
                        );
                      },
                    ]);
                  },
                );
              },
              // environment: Environment sealed object (6 members)
              (w3) => {
                w3.writeTypedObject(
                  'com.clientoutlook.data.hangingprotocol.Environment',
                  ['levelValue', 'level', 'user', 'roles', 'device', 'numberOfScreens'],
                  [
                    (w4) => w4.writeNull(),           // levelValue: null
                    (w4) => w4.writeInteger(0),        // level: 0
                    (w4) => w4.writeNull(),           // user: null
                    (w4) => w4.writeNull(),           // roles: null
                    (w4) => w4.writeString('WEB'),    // device: "WEB"
                    (w4) => w4.writeString('1'),      // numberOfScreens: "1"
                  ],
                );
              },
            ],
          );
        },
      );
    },
  ]);
}

// ─── AMF3 Response Parsing ───

export interface AmfResponse {
  code: number;
  response: string | null;
}

/**
 * Parse the outer AmfServicesMessage response to extract code and response text.
 * Returns null if the response can't be parsed.
 */
export function parseAmfResponse(buf: Buffer): AmfResponse | null {
  // Look for the response pattern: AmfServicesResponse followed by code (integer) and response (string or null)
  const text = buf.toString('latin1');
  const codeIdx = text.indexOf('code');
  if (codeIdx < 0) return null;

  // After "code" member name, look for integer marker (0x04) followed by U29 value
  // The response member follows
  let pos = buf.indexOf(Buffer.from('code'), 0);
  if (pos < 0) return null;
  pos += 4; // skip "code"

  // Skip the second member name (either inline or reference)
  // Look for the AMF3 integer marker after both member names
  // Find position of the integer marker for code value
  while (pos < buf.length && buf[pos] !== 0x04 && buf[pos] !== 0x01) pos++;
  if (pos >= buf.length) return null;

  let code = -1;
  let response: string | null = null;

  if (buf[pos] === 0x04) { // Integer
    pos++;
    // Byte reads are `!`-asserted: positions are bounded by the scan loop above; noUncheckedIndexedAccess.
    code = buf[pos]! & 0x7F;
    pos++;
  }

  // Next value is the response (string or null)
  if (pos < buf.length) {
    if (buf[pos] === 0x01) { // null
      response = null;
    } else if (buf[pos] === 0x06) { // string
      pos++;
      // Read U29 string length
      let len: number;
      if (buf[pos]! < 0x80) {
        len = buf[pos]! >> 1;
        pos++;
      } else {
        len = ((buf[pos]! & 0x7F) << 7) | buf[pos + 1]!;
        len >>= 1;
        pos += 2;
      }
      if (len > 0 && pos + len <= buf.length) {
        response = buf.toString('utf-8', pos, pos + len);
      }
    }
  }

  return { code, response };
}

// ─── AMF Response Series Parsing ───

export interface ParsedStudyInfo {
  studyUID: string;
  series: Array<{
    seriesUID: string;
    instanceUID: string;
    seriesDescription: string;
  }>;
}


/**
 * Parse the getStudyListMeta response *structurally* with the AMF3 reader:
 * decode the typed-object tree and walk Study → series → images, so every
 * (seriesUID, instanceUID) pair and series description is exact.
 *
 * This is the primary parser. The positional heuristic below remains as the
 * fallback for responses the reader can't decode (e.g. an externalizable
 * class we haven't seen). The heuristic mispaired UIDs on Mass General
 * Brigham multi-slice studies — it took a frameOfReferenceUID for the series UID and
 * the real series UIDs for instances, so every CustomImageServlet request
 * came back CLOERROR "Failed to find image in any supplied providers".
 *
 * @param accession When the response carries several studies (priors in
 * relevantStudyList), picks the one whose accessionNumber matches; otherwise
 * the first study with image series wins.
 */
export function parseStudySeriesFromAmfStructured(amfBuf: Buffer, accession?: string): ParsedStudyInfo | null {
  let root: unknown;
  try {
    root = decodeAmf3(amfBuf);
  } catch (err) {
    logger.debug(`      [AMF-PARSE] Structured decode failed: ${(err as Error).message}`);
    return null;
  }

  const studies = collectAmf3Objects(root, 'com.clientoutlook.data.Study');
  if (studies.length === 0) return null;

  const seriesOf = (study: Amf3Object): Amf3Object[] => {
    const arr = unwrapAmf3(study.series);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is Amf3Object =>
      typeof s === 'object' && s !== null && typeof (s as Amf3Object).uid === 'string' && !!(s as Amf3Object).uid);
  };

  const study =
    (accession ? studies.find((s) => s.accessionNumber === accession && seriesOf(s).length > 0) : undefined) ??
    studies.find((s) => seriesOf(s).length > 0) ??
    studies[0];
  // An empty study list previously crashed on `study.uid`; null is this
  // function's failure value for a response it can't use.
  if (!study) return null;

  const studyUID = study.uid;
  if (typeof studyUID !== 'string' || !studyUID) return null;

  const series: ParsedStudyInfo['series'] = [];
  let seriesCount = 0;
  for (const s of seriesOf(study)) {
    seriesCount++;
    const seriesUID = s.uid as string;
    const description = typeof s.description === 'string' && s.description.trim()
      ? s.description.trim()
      : `Series ${seriesCount}`;

    const images = unwrapAmf3(s.images);
    const instances = (Array.isArray(images) ? images : [])
      .filter((img): img is Amf3Object =>
        typeof img === 'object' && img !== null && typeof (img as Amf3Object).uid === 'string' && !!(img as Amf3Object).uid)
      .sort((a, b) => (Number(a.instanceNumber) || 0) - (Number(b.instanceNumber) || 0));

    for (const img of instances) {
      series.push({ seriesUID, instanceUID: img.uid as string, seriesDescription: description });
    }
    logger.debug(`      [AMF-PARSE] ${description}: ${instances.length} instances`);
  }

  if (series.length === 0) return null;
  logger.debug(`      [AMF-PARSE] Structured parse: ${series.length} (seriesUID, instanceUID) entries across ${seriesCount} series`);
  return { studyUID, series };
}

/**
 * Parse the study/series/instance tree from a getStudyListMeta response:
 * structured AMF3 decode first, positional heuristic as fallback.
 *
 * The fallback is loud on purpose. The heuristic is the parser that mispaired
 * UIDs on Mass General Brigham multi-slice studies and produced a silent
 * zero-image result, so when it runs, the log says so — a future zero-image
 * report must be diagnosable to "the strict reader couldn't decode this
 * response" in one step rather than rediscovered from scratch.
 */
export function parseStudySeries(amfBuf: Buffer, accession: string): ParsedStudyInfo | null {
  const structured = parseStudySeriesFromAmfStructured(amfBuf, accession);
  if (structured) return structured;
  logger.warn(
    '      [AMF-PARSE] Structured AMF3 decode failed; falling back to the positional UID heuristic. ' +
    'UID pairing may be wrong on multi-slice studies — capture this response and extend amf3Reader.ts.',
  );
  return parseStudySeriesFromAmf(amfBuf);
}

/**
 * Parse the AMF getStudyListMeta response to extract study UID and series info.
 *
 * Positional-heuristic fallback for responses {@link parseStudySeriesFromAmfStructured}
 * can't decode.
 *
 * The AMF response contains a structured list where series UIDs appear as boundaries,
 * followed by their instance UIDs. For multi-slice studies (CT scans), each series
 * has many instance UIDs (one per slice).
 *
 * Strategy:
 * 1. Find all DICOM UIDs in the binary (pattern: 1.X.X.X.X...)
 * 2. Filter out DICOM standard SOP Class UIDs (1.2.840.10008.*)
 * 3. Identify the study UID
 * 4. Detect series UIDs: UIDs that appear multiple times in the binary are typically
 *    series UIDs (they appear in headers and as references). UIDs appearing exactly
 *    once are typically instance UIDs.
 * 5. Walk UIDs in position order, using series UIDs as group boundaries
 * 6. Each series entry includes ALL its instance UIDs for complete multi-slice support
 */
export function parseStudySeriesFromAmf(amfBuf: Buffer): ParsedStudyInfo | null {
  const text = amfBuf.toString('latin1');

  // Find all DICOM UIDs with positions (including duplicates for frequency analysis)
  const uidPattern = /1\.\d+\.\d+\.\d+(?:\.\d+){2,}/g;
  const uidOccurrences: Array<{ uid: string; pos: number }> = [];
  const uidFrequency = new Map<string, number>();
  const firstPosition = new Map<string, number>();
  let match;
  while ((match = uidPattern.exec(text)) !== null) {
    const uid = match[0];
    // 1.2.840.10008.* = DICOM standard SOP Class UIDs (universal spec, not institution-specific)
    // These are type identifiers like "CT Image Storage" that appear as metadata,
    // not study/series/instance UIDs. Defined in the DICOM standard PS3.4.
    if (uid.startsWith('1.2.840.10008.')) continue;
    uidOccurrences.push({ uid, pos: match.index });
    uidFrequency.set(uid, (uidFrequency.get(uid) || 0) + 1);
    if (!firstPosition.has(uid)) firstPosition.set(uid, match.index);
  }

  if (uidOccurrences.length === 0) return null;

  const uniqueUIDs = [...new Set(uidOccurrences.map(o => o.uid))];
  logger.debug(`      [AMF-PARSE] ${uniqueUIDs.length} unique study-related UIDs from ${uidOccurrences.length} occurrences`);

  // Study UID: the first UID in the response (AMF always starts with study-level data)
  const studyUID = uniqueUIDs[0]!; // uidOccurrences checked non-empty above; noUncheckedIndexedAccess

  // Detect series vs instance UIDs using positional structure analysis.
  //
  // The AMF binary lists UIDs in order: series UID, then its instance UIDs.
  // Within the UID stream, we can detect series boundaries by grouping
  // consecutive UIDs by their "parent" (all segments except the last).
  // Single-UID sub-groups are series UIDs; multi-UID runs are instances.
  //
  // For UIDs with very different roots (e.g., COR/SAG vs NONCONTRAST),
  // we first split by major root boundary, then analyze within each root.

  const orderedUIDs = [...firstPosition.entries()]
    .filter(([uid]) => uid !== studyUID)
    .sort((a, b) => a[1] - b[1])
    .map(([uid]) => uid);

  // Sub-group by "parent" (drop last segment)
  const getParent = (uid: string) => uid.split('.').slice(0, -1).join('.');
  const subGroups: Array<{ parent: string; uids: string[] }> = [];
  let currentParent = '';
  let currentGroup: string[] = [];

  for (const uid of orderedUIDs) {
    const parent = getParent(uid);
    if (parent !== currentParent) {
      if (currentGroup.length > 0) {
        subGroups.push({ parent: currentParent, uids: currentGroup });
      }
      currentParent = parent;
      currentGroup = [uid];
    } else {
      currentGroup.push(uid);
    }
  }
  if (currentGroup.length > 0) {
    subGroups.push({ parent: currentParent, uids: currentGroup });
  }

  // Walk sub-groups to identify series and instance relationships.
  // Single-UID sub-groups are series UIDs; multi-UID sub-groups are their instances.
  const candidateSeriesUIDs: string[] = [];
  const seriesInstances = new Map<string, Set<string>>();
  let currentSeriesUID = '';

  for (const sg of subGroups) {
    if (sg.uids.length === 1) {
      // Single UID — likely a series UID (or a standalone instance like Scout)
      const uid = sg.uids[0]!; // length === 1 checked above; noUncheckedIndexedAccess
      // If the previous "series" had no instances, it was actually an instance itself
      // Add it to the current series
      if (currentSeriesUID && seriesInstances.get(currentSeriesUID)!.size === 0) {
        // Previous single was actually an instance, not a series
        // Retroactively add it as an instance of the series before it
        const prevSeries = candidateSeriesUIDs[candidateSeriesUIDs.length - 2];
        if (prevSeries) {
          const oldSeries = candidateSeriesUIDs.pop()!;
          seriesInstances.get(prevSeries)!.add(oldSeries);
          seriesInstances.delete(oldSeries);
        }
      }
      currentSeriesUID = uid;
      candidateSeriesUIDs.push(uid);
      seriesInstances.set(uid, new Set());
    } else {
      // Multi-UID sub-group — these are instances of the current series
      if (currentSeriesUID) {
        for (const uid of sg.uids) {
          seriesInstances.get(currentSeriesUID)!.add(uid);
        }
      }
    }
  }

  // Check if the positional analysis produced useful results.
  // For small studies (X-rays) where all UIDs have unique parents,
  // every UID becomes a "series" with 0 instances — fall back to legacy parser.
  //
  // Also fall back when: the remaining UIDs (excluding study UID) form clean pairs
  // but the positional analysis collapsed them into too few series. This happens when
  // UIDs share a common parent prefix (e.g., 1.3.51.0.7.X) but are actually
  // alternating series/instance pairs.
  const totalInstances = [...seriesInstances.values()].reduce((sum, s) => sum + s.size, 0);
  const expectedPairCount = Math.floor(orderedUIDs.length / 2);
  const actualSeriesWithImages = [...seriesInstances.values()].filter(s => s.size > 0).length;

  if (candidateSeriesUIDs.length === 0 || totalInstances === 0) {
    logger.debug(`      [AMF-PARSE] Positional analysis found ${candidateSeriesUIDs.length} series with ${totalInstances} instances, falling back to pair-based parsing`);
    return parseStudySeriesFromAmfLegacy(amfBuf);
  }

  // If positional analysis collapsed many UIDs into one series with few instances,
  // and pair-based parsing would produce more series, fall back to pairs.
  // This catches X-ray studies (2-6 views) where UIDs share a parent prefix
  // but are actually separate series+instance pairs.
  // Don't fall back for CT/MRI with many instances per series (>10).
  const maxInstancesPerSeries = Math.max(...[...seriesInstances.values()].map(s => s.size));
  if (expectedPairCount >= 2 && actualSeriesWithImages <= 1 && maxInstancesPerSeries <= 10 && expectedPairCount > actualSeriesWithImages) {
    logger.debug(`      [AMF-PARSE] Positional analysis found ${actualSeriesWithImages} series with images but ${expectedPairCount} pairs expected, falling back to pair-based parsing`);
    return parseStudySeriesFromAmfLegacy(amfBuf);
  }

  logger.debug(`      [AMF-PARSE] Detected ${candidateSeriesUIDs.length} series via positional analysis`);

  // Extract series descriptions from nearby readable strings
  const descriptionPattern = /[\x20-\x7e]{3,100}/g;
  const readableStrings: Array<{ text: string; pos: number }> = [];
  let strMatch;
  while ((strMatch = descriptionPattern.exec(text)) !== null) {
    const s = strMatch[0].trim();
    if (/^\d+\.\d+\.\d+/.test(s)) continue;
    if (s.includes('com.clientoutlook') || s.includes('flex.messaging')) continue;
    if (s.includes('AmfServices') || s.includes('HTTPSimpleLoader')) continue;
    if (s.includes('getStudyList') || s.includes('StudyService')) continue;
    if (/^[\d.]+$/.test(s)) continue;
    readableStrings.push({ text: s, pos: strMatch.index });
  }

  // Build the result — flatten each series' instances into individual entries
  // for backward compatibility with the download loop
  const series: ParsedStudyInfo['series'] = [];
  let seriesIdx = 0;
  for (let si = 0; si < candidateSeriesUIDs.length; si++) {
    const seriesUID = candidateSeriesUIDs[si]!; // si bounded by loop; noUncheckedIndexedAccess
    const instances = seriesInstances.get(seriesUID)!;
    const seriesPos = firstPosition.get(seriesUID) ?? 0;
    // Search for descriptions between this series and the next one
    const nextSeriesPos = si + 1 < candidateSeriesUIDs.length
      ? (firstPosition.get(candidateSeriesUIDs[si + 1]!) ?? text.length)
      : text.length;

    // Find series description: look for readable strings between this series and the next
    let bestDesc = `Series ${++seriesIdx}`;
    let bestScore = 0;
    for (const rs of readableStrings) {
      if (rs.pos < seriesPos || rs.pos > nextSeriesPos) continue;
      // Prefer strings that look like series names (short, no UIDs, not too generic)
      const s = rs.text;
      if (s.length < 3 || s.length > 50) continue;
      // Score: prefer shorter, more descriptive strings
      let score = 10;
      if (/^[A-Z]/.test(s)) score += 5; // Starts with uppercase
      if (s.includes(' ')) score += 3; // Has spaces (human-readable)
      if (/\d+x\d+|\d+mm/i.test(s)) score += 3; // Resolution-like
      if (s.length < 20) score += 2;
      if (score > bestScore) {
        bestScore = score;
        bestDesc = s;
      }
    }

    if (instances.size === 0) {
      // Series with no detected instances — add a self-referencing entry
      series.push({ seriesUID, instanceUID: seriesUID, seriesDescription: bestDesc });
    } else {
      // Add an entry for EACH instance UID — the download loop iterates these
      const sortedInstances = [...instances].sort((a, b) => {
        // DICOM UIDs are decimal digit runs joined by dots (see uidPattern),
        // so the trailing component sorts as a base-10 number.
        const aNum = parseInt(a.split('.').pop()!, 10) || 0;
        const bNum = parseInt(b.split('.').pop()!, 10) || 0;
        return aNum - bNum;
      });

      for (const instanceUID of sortedInstances) {
        series.push({ seriesUID, instanceUID, seriesDescription: bestDesc });
      }
    }

    logger.debug(`      [AMF-PARSE] ${bestDesc}: ${instances.size} instances`);
  }

  logger.debug(`      [AMF-PARSE] Total: ${series.length} (seriesUID, instanceUID) entries across ${candidateSeriesUIDs.length} series`);

  return { studyUID, series };
}

/**
 * Legacy pair-based parser for simple studies (X-rays with few series).
 * Used as fallback when the frequency-based series detection doesn't find
 * enough high-frequency UIDs.
 */
function parseStudySeriesFromAmfLegacy(amfBuf: Buffer): ParsedStudyInfo | null {
  const text = amfBuf.toString('latin1');

  const uidPattern = /1\.\d+\.\d+\.\d+(?:\.\d+){2,}/g;
  const allUIDs: string[] = [];
  const uidPositions: Map<string, number> = new Map();
  let match;
  while ((match = uidPattern.exec(text)) !== null) {
    if (!uidPositions.has(match[0]) && !match[0].startsWith('1.2.840.10008.')) {
      allUIDs.push(match[0]);
      uidPositions.set(match[0], match.index);
    }
  }

  if (allUIDs.length === 0) return null;

  // Study UID: the first UID in the response (AMF always starts with study-level data)
  const studyUID = allUIDs[0]!; // allUIDs.length checked non-zero above; noUncheckedIndexedAccess
  const otherUIDs = allUIDs.filter(uid => uid !== studyUID);

  if (otherUIDs.length === 0) return { studyUID, series: [] };

  const descriptionPattern = /[\x20-\x7e]{3,100}/g;
  const readableStrings: Array<{ text: string; pos: number }> = [];
  let strMatch;
  while ((strMatch = descriptionPattern.exec(text)) !== null) {
    const s = strMatch[0].trim();
    if (/^\d+\.\d+\.\d+/.test(s)) continue;
    if (s.includes('com.clientoutlook') || s.includes('flex.messaging')) continue;
    if (s.includes('AmfServices') || s.includes('HTTPSimpleLoader')) continue;
    if (s.includes('getStudyList') || s.includes('StudyService')) continue;
    if (/^[\d.]+$/.test(s)) continue;
    readableStrings.push({ text: s, pos: strMatch.index });
  }

  const series: ParsedStudyInfo['series'] = [];
  for (let i = 0; i + 1 < otherUIDs.length; i += 2) {
    const seriesUID = otherUIDs[i]!; // i + 1 < length per loop condition; noUncheckedIndexedAccess
    const instanceUID = otherUIDs[i + 1]!;
    const seriesPos = uidPositions.get(seriesUID) ?? 0;

    let bestDesc = `Series ${Math.floor(i / 2) + 1}`;
    let bestDist = Infinity;
    for (const rs of readableStrings) {
      const dist = Math.abs(rs.pos - seriesPos);
      if (dist < bestDist && dist < 500 && rs.text.length >= 3 && rs.text.length <= 80) {
        bestDist = dist;
        bestDesc = rs.text;
      }
    }

    series.push({ seriesUID, instanceUID, seriesDescription: bestDesc });
  }

  return { studyUID, series };
}

// ─── serviceInstance Extraction ───

/**
 * Extract the real serviceInstance from an AMF response buffer.
 * The server may return a different serviceInstance than the one we sent
 * (e.g., "MyChart" → "UCSFVNAEDGEBundle" for CT scans). The browser uses
 * this real value for a second AMF init call and all CustomImageServlet requests.
 */
export function extractServiceInstanceFromAmf(amfBuf: Buffer, originalServiceInstance: string): string | null {
  const text = amfBuf.toString('latin1');

  // Strategy 1: Look for a serviceInstance value near the "serviceInstance" or
  // "ServiceInstance" field name in the binary. The value typically follows
  // within 50 bytes of the field name.
  const fieldPositions: number[] = [];
  let idx = 0;
  while ((idx = text.indexOf('erviceInstance', idx)) !== -1) {
    fieldPositions.push(idx);
    idx++;
  }

  for (const pos of fieldPositions) {
    // Look at readable strings within 50 bytes after the field name
    const region = text.substring(pos, pos + 100);
    // Match capitalized identifiers that look like serviceInstance values
    // (not field names like "ServiceInstance", "ServiceInstanceParameter")
    const valuePattern = /([A-Z][A-Za-z0-9]{5,}(?:Bundle|Strategy|strategy))/g;
    let match;
    while ((match = valuePattern.exec(region)) !== null) {
      const val = match[1]!; // pattern has one mandatory capture group; noUncheckedIndexedAccess
      if (val !== originalServiceInstance && !val.startsWith('ServiceInstance')) {
        return val;
      }
    }
  }

  // Strategy 2: Look for known serviceInstance patterns anywhere in the binary.
  // These are institution-specific identifiers that end in "Bundle" or contain "strategy".
  const globalPattern = /([A-Z][A-Za-z0-9]{4,}Bundle|[A-Z][A-Za-z0-9]{4,}[Ss]trategy)/g;
  let match;
  while ((match = globalPattern.exec(text)) !== null) {
    const val = match[1]!; // pattern has one mandatory capture group; noUncheckedIndexedAccess
    if (val !== originalServiceInstance) {
      return val;
    }
  }

  return null;
}
