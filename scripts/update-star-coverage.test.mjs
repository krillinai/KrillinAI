import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { collectCoverage, countryFromLocation, createCountryLookup, updateReadmeCount } from './update-star-coverage.mjs';

const features = [
  { properties: { ADMIN: 'United States of America', NAME: 'United States of America', NAME_LONG: 'United States', ISO_A2: 'US', ISO_A3: 'USA' } },
  { properties: { ADMIN: 'Germany', NAME: 'Germany', NAME_LONG: 'Germany', ISO_A2: 'DE', ISO_A3: 'DEU' } },
  { properties: { ADMIN: 'Vanuatu', NAME: 'Vanuatu', NAME_LONG: 'Vanuatu', ISO_A2: 'VU', ISO_A3: 'VUT' } },
  { properties: { ADMIN: 'Panama', NAME: 'Panama', NAME_LONG: 'Panama', ISO_A2: 'PA', ISO_A3: 'PAN' } },
  { properties: { ADMIN: 'Vatican City', NAME: 'Vatican City', NAME_LONG: 'Vatican City', ISO_A2: 'VA', ISO_A3: 'VAT' } },
  { properties: { ADMIN: 'Norway', NAME: 'Norway', NAME_LONG: 'Norway', ISO_A2: '-99', ISO_A2_EH: 'NO', ISO_A3: '-99', ADM0_A3: 'NOR' } },
  { properties: { ADMIN: 'Kosovo', NAME: 'Kosovo', NAME_LONG: 'Kosovo', ISO_A2: '-99', ISO_A3: '-99', ADM0_A3: 'KOS' } }
];
const lookup = createCountryLookup(features);

test('recognizes explicit countries and skips unresolvable locations', () => {
  assert.equal(countryFromLocation('Berlin, Germany', lookup), 'DEU');
  assert.equal(countryFromLocation('Remote | USA', lookup), 'USA');
  assert.equal(countryFromLocation('Vanuatu', lookup), 'VUT');
  assert.equal(countryFromLocation('Panama', lookup), 'PAN');
  assert.equal(countryFromLocation('Oslo, Norway', lookup), 'NOR');
  assert.equal(countryFromLocation('Richmond, VA', lookup), null);
  assert.equal(countryFromLocation('Philadelphia, PA', lookup), null);
  assert.equal(countryFromLocation('Kosovo', lookup), 'XKX');
  assert.equal(countryFromLocation('Somewhere on Earth', lookup), null);
  assert.equal(countryFromLocation(null, lookup), null);
});

test('collects every page and keeps previously verified coverage', async () => {
  const seen = [];
  const pages = [
    { totalCount: 3, edges: [{ node: { location: 'Germany' } }, { node: { location: null } }], pageInfo: { hasNextPage: true, endCursor: 'next' } },
    { totalCount: 3, edges: [{ node: { location: 'Vanuatu' } }], pageInfo: { hasNextPage: false, endCursor: null } }
  ];
  const result = await collectCoverage(async cursor => {
    seen.push(cursor);
    return pages.shift();
  }, lookup, ['USA']);
  assert.deepEqual(seen, [null, 'next']);
  assert.deepEqual([...result.codes].sort(), ['DEU', 'USA', 'VUT']);
  assert.equal(result.fetched, 3);
});

test('rejects incomplete GitHub pagination', async () => {
  await assert.rejects(
    collectCoverage(async () => ({ totalCount: 2, edges: [{ node: { location: 'Germany' } }], pageInfo: { hasNextPage: false, endCursor: null } }), lookup, []),
    /Only fetched 1 of 2/
  );
});

test('updates the coverage count in every README without touching other text', () => {
  const count = JSON.parse(readFileSync('docs/star-coverage.json', 'utf8')).codes.length;
  const files = ['README.md', ...['zh', 'ja', 'ko', 'id', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'th']
    .map(locale => `docs/${locale}/README.md`)];
  for (const file of files) {
    const current = readFileSync(file, 'utf8');
    const updated = updateReadmeCount(current, count, count + 1);
    assert.ok(updated.includes('star-coverage-map.svg'), file);
    assert.equal(updateReadmeCount(updated, count + 1, count), current, file);
  }
  assert.throws(() => updateReadmeCount(readFileSync(files[0], 'utf8'), count - 1, count + 1), /Expected one star coverage count/);
});
