// The readers live in core so that core's own modules (dcsDocument.ts) can use
// them without importing the processor layer above them. Processors keep this
// path.
export * from '../core/read';
