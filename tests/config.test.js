import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_API_BASE, resolveApiBase } from '../src/config.js';

test('default API base is a relative production-safe path', () => {
  assert.equal(DEFAULT_API_BASE, '/api');
  assert.equal(resolveApiBase(), '/api');
});

test('custom API URLs are normalized without duplicate trailing slashes', () => {
  assert.equal(resolveApiBase('https://example.com/api/'), 'https://example.com/api');
  assert.equal(resolveApiBase('/api/'), '/api');
  assert.equal(resolveApiBase('http://127.0.0.1:8787/api'), 'http://127.0.0.1:8787/api');
});
