import { describe, expect, it } from 'vitest';
import { describeGeoError } from './geolocationSource';

describe('describeGeoError', () => {
  it('gives actionable guidance for PERMISSION_DENIED (code 1)', () => {
    expect(describeGeoError(1, 'User denied Geolocation')).toMatch(/blocked/i);
  });

  it('gives actionable guidance for POSITION_UNAVAILABLE (code 2)', () => {
    expect(describeGeoError(2, 'Position unavailable')).toMatch(/currently unavailable/i);
  });

  it('gives actionable guidance for TIMEOUT (code 3)', () => {
    expect(describeGeoError(3, 'Timeout expired')).toMatch(/timed out/i);
  });

  it('falls back to the raw message for an unknown code', () => {
    expect(describeGeoError(99, 'some unusual browser error')).toBe('some unusual browser error');
  });

  it('falls back to a non-empty generic message for an unknown code with no raw text', () => {
    const result = describeGeoError(99, '');
    expect(result.length).toBeGreaterThan(0);
  });
});
