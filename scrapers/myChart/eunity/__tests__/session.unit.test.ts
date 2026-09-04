import { describe, it, expect } from 'bun:test';
import { parseEunityStudyParams } from '../session';

// ─── parseEunityStudyParams ───

describe('parseEunityStudyParams', () => {
  it('extracts params from URL query string', () => {
    const url = 'https://myimages.example.com/e/viewer?accession=12345&serviceInstance=MyChart&patientId=67890';
    const result = parseEunityStudyParams(url);
    expect(result).not.toBeNull();
    expect(result!.accession).toBe('12345');
    expect(result!.serviceInstance).toBe('MyChart');
    expect(result!.patientId).toBe('67890');
  });

  it('extracts params from viewer HTML body JSON', () => {
    const url = 'https://myimages.example.com/e/viewer?CLOAccessKeyID=abc&arg=encrypted';
    const body = `
      some html content
      "accessionNumber":"E48330984"
      "serviceInstance":"TestBundle"
      "patientId":"12345$$$SITE"
      more content
    `;
    const result = parseEunityStudyParams(url, body);
    expect(result).not.toBeNull();
    expect(result!.accession).toBe('E48330984');
    expect(result!.serviceInstance).toBe('TestBundle');
    expect(result!.patientId).toBe('12345$$$SITE');
  });

  it('returns null when params cannot be extracted', () => {
    const url = 'https://myimages.example.com/e/viewer?CLOAccessKeyID=abc&arg=encrypted';
    const result = parseEunityStudyParams(url);
    expect(result).toBeNull();
  });

  it('extracts params from pipe-delimited arg', () => {
    const url = 'https://myimages.example.com/e/viewer?arg=ACC123|ServiceInst|PatID456';
    const result = parseEunityStudyParams(url);
    expect(result).not.toBeNull();
    expect(result!.accession).toBe('ACC123');
    expect(result!.serviceInstance).toBe('ServiceInst');
    expect(result!.patientId).toBe('PatID456');
  });
});
