import { describe, expect, it } from 'vitest';
import { formatSpeedKmh } from './format';

describe('formatSpeedKmh', () => {
  it('formats 0 as "0 km/h"', () => {
    expect(formatSpeedKmh(0)).toBe('0 km/h');
  });

  it('formats 13.89 m/s as "50 km/h"', () => {
    expect(formatSpeedKmh(13.89)).toBe('50 km/h');
  });

  it('formats 13.4 m/s as "48 km/h"', () => {
    expect(formatSpeedKmh(13.4)).toBe('48 km/h');
  });
});
