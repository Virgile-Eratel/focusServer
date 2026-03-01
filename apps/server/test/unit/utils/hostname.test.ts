import { describe, it, expect } from 'vitest';
import { normalizeHostname } from '../../../src/utils/hostname';

describe('normalizeHostname', () => {
  it('returns normalized hostname for valid input', () => {
    expect(normalizeHostname('Example.Com')).toBe('example.com');
  });

  it('extracts hostname from URL', () => {
    expect(normalizeHostname('https://www.example.com/path?q=1')).toBe('www.example.com');
  });

  it('extracts hostname from HTTP URL', () => {
    expect(normalizeHostname('http://reddit.com')).toBe('reddit.com');
  });

  it('strips path from bare hostname', () => {
    expect(normalizeHostname('example.com/path')).toBe('example.com');
  });

  it('strips query from bare hostname', () => {
    expect(normalizeHostname('example.com?q=1')).toBe('example.com');
  });

  it('strips fragment from bare hostname', () => {
    expect(normalizeHostname('example.com#section')).toBe('example.com');
  });

  it('removes trailing dot', () => {
    expect(normalizeHostname('example.com.')).toBe('example.com');
  });

  it('trims and lowercases', () => {
    expect(normalizeHostname('  EXAMPLE.COM  ')).toBe('example.com');
  });

  it('returns null for null input', () => {
    expect(normalizeHostname(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeHostname(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeHostname('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(normalizeHostname('   ')).toBeNull();
  });

  it('returns null for hostname without dot', () => {
    expect(normalizeHostname('localhost')).toBeNull();
  });

  it('returns null for hostname with invalid characters', () => {
    expect(normalizeHostname('exam ple.com')).toBeNull();
  });

  it('returns null for hostname starting with dot', () => {
    expect(normalizeHostname('.example.com')).toBeNull();
  });

  it('returns null for hostname with consecutive dots', () => {
    expect(normalizeHostname('example..com')).toBeNull();
  });

  it('handles subdomain correctly', () => {
    expect(normalizeHostname('sub.domain.example.com')).toBe('sub.domain.example.com');
  });

  it('handles numeric hostname', () => {
    expect(normalizeHostname('123.456.com')).toBe('123.456.com');
  });

  it('returns null for hostname with special characters', () => {
    expect(normalizeHostname('exam!ple.com')).toBeNull();
  });

  it('returns null for hostname with underscore', () => {
    expect(normalizeHostname('ex_ample.com')).toBeNull();
  });
});
