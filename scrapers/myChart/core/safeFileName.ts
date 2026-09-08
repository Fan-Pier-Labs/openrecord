/**
 * A file name safe to create under any directory, from a name MyChart gave
 * us. Attachment names come straight off the record, so they can hold path
 * separators, control characters, or nothing at all; `fallback` (e.g.
 * `attachment.pdf`) names the file when nothing usable is left.
 */
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]+/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+/, '')
    .trim()
    .substring(0, 120);
  return cleaned || fallback;
}
