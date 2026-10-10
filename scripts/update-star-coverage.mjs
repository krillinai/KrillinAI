import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const readmePaths = ['README.md', ...['zh', 'ja', 'ko', 'id', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'th']
  .map(locale => `docs/${locale}/README.md`)];

const query = `
  query StarLocations($cursor: String) {
    repository(owner: "krillinai", name: "OpenCreator") {
      stargazers(first: 100, after: $cursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        edges { node { location } }
      }
    }
  }
`;

const normalize = value => value.normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .replace(/\p{Regional_Indicator}/gu, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

export function createCountryLookup(features) {
  const lookup = new Map();
  const validCodes = new Set();
  const displayNames = ['en', 'zh', 'ja', 'ko', 'id', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'th']
    .map(locale => new Intl.DisplayNames([locale], { type: 'region' }));
  const add = (name, code) => {
    if (!name) return;
    const key = normalize(name);
    if (!key) return;
    if (!lookup.has(key)) lookup.set(key, code);
    else if (lookup.get(key) !== code) lookup.set(key, null);
  };

  for (const { properties } of features) {
    if (properties.ADMIN === 'Antarctica') continue;
    const code = properties.ADMIN === 'Kosovo' ? 'XKX'
      : properties.ISO_A3 === '-99' ? properties.ADM0_A3 : properties.ISO_A3;
    validCodes.add(code);
    for (const name of [properties.ADMIN, properties.NAME, properties.NAME_LONG, properties.FORMAL_EN]) {
      add(name, code);
    }
    add(properties.ISO_A3, code);
    const twoLetterCode = [properties.ISO_A2, properties.ISO_A2_EH]
      .find(value => /^[A-Z]{2}$/.test(value));
    if (twoLetterCode) {
      for (const names of displayNames) add(names.of(twoLetterCode), code);
    }
  }

  const aliases = {
    USA: ['USA', 'US', 'U.S.A.', 'America'],
    GBR: ['UK', 'U.K.', 'Britain', 'England', 'Scotland', 'Wales'],
    ARE: ['UAE'],
    KOR: ['South Korea'],
    PRK: ['North Korea'],
    CHN: ['PRC', 'Mainland China'],
    CIV: ['Ivory Coast'],
    CZE: ['Czech Republic'],
    COD: ['DR Congo', 'DRC'],
    COG: ['Republic of the Congo'],
    XKX: ['Kosovo']
  };
  for (const [code, names] of Object.entries(aliases)) {
    if (!validCodes.has(code)) continue;
    for (const name of names) add(name, code);
  }
  return lookup;
}

export function countryFromLocation(location, lookup) {
  if (!location) return null;
  const segments = location.split(/[,;/|]/).reverse();
  for (const segment of segments) {
    const key = normalize(segment).replace(/^(?:based in|living in|from) /, '');
    const code = lookup.get(key);
    if (code) return code;
  }
  return null;
}

export async function collectCoverage(fetchPage, lookup, baseline) {
  const codes = new Set(baseline);
  let cursor = null;
  let fetched = 0;
  let totalCount = 0;
  for (let page = 0; page < 1000; page++) {
    const result = await fetchPage(cursor);
    if (!result || !Array.isArray(result.edges) || !result.pageInfo) {
      throw new Error('Incomplete GitHub stargazer response');
    }
    if (page === 0) totalCount = result.totalCount;
    fetched += result.edges.length;
    if ((page + 1) % 20 === 0) console.log(`Checked ${fetched} stargazers...`);
    for (const edge of result.edges) {
      const code = countryFromLocation(edge.node?.location, lookup);
      if (code) codes.add(code);
    }
    if (!result.pageInfo.hasNextPage) {
      if (fetched < totalCount) throw new Error(`Only fetched ${fetched} of ${totalCount} stargazers`);
      return { codes, fetched };
    }
    if (!result.pageInfo.endCursor || result.pageInfo.endCursor === cursor || !result.edges.length) {
      throw new Error('GitHub stargazer pagination stalled');
    }
    cursor = result.pageInfo.endCursor;
  }
  throw new Error('GitHub stargazer pagination exceeded 1000 pages');
}

export function updateReadmeCount(content, oldCount, newCount) {
  const mapIndex = content.indexOf('star-coverage-map.svg');
  if (mapIndex < 0) throw new Error('Star coverage map missing from README');
  const paragraphStart = content.lastIndexOf('<p>', mapIndex);
  const paragraphEnd = content.indexOf('</p>', paragraphStart) + 4;
  if (paragraphStart < 0 || paragraphEnd > mapIndex || paragraphEnd < 4) {
    throw new Error('Star coverage count paragraph missing from README');
  }
  const paragraph = content.slice(paragraphStart, paragraphEnd);
  const numbers = paragraph.match(/\d+/g);
  if (numbers?.length !== 1 || Number(numbers[0]) !== oldCount) {
    throw new Error(`Expected one star coverage count of ${oldCount}`);
  }
  return content.slice(0, paragraphStart)
    + paragraph.replace(/\d+/, String(newCount))
    + content.slice(paragraphEnd);
}

async function fetchPage(cursor, token) {
  const config = `header = "Authorization: Bearer ${token}"\nheader = "Content-Type: application/json"\n`;
  const response = spawnSync('curl', [
    '-fsS', '--retry', '6', '--retry-all-errors', '--retry-delay', '1',
    '--connect-timeout', '10', '--max-time', '15',
    '-K', '-', '-d', JSON.stringify({ query, variables: { cursor } }),
    'https://api.github.com/graphql'
  ], { input: config, encoding: 'utf8', timeout: 130000, maxBuffer: 5 * 1024 * 1024 });
  if (response.status !== 0) {
    throw new Error(`GitHub GraphQL request failed: ${response.stderr.trim() || response.error?.message}`);
  }
  const payload = JSON.parse(response.stdout);
  if (payload.errors?.length) throw new Error(`GitHub GraphQL: ${payload.errors[0].message}`);
  return payload.data?.repository?.stargazers;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error('Usage: node scripts/update-star-coverage.mjs <Natural Earth GeoJSON>');
  const features = JSON.parse(readFileSync(sourcePath, 'utf8')).features;
  const lookup = createCountryLookup(features);
  const statePath = 'docs/star-coverage.json';
  const baseline = JSON.parse(readFileSync(statePath, 'utf8')).codes;
  const { codes, fetched } = await collectCoverage(cursor => fetchPage(cursor, token), lookup, baseline);
  const additions = [...codes].filter(code => !baseline.includes(code)).sort();
  console.log(`Checked ${fetched} stargazers; ${baseline.length} known regions; ${additions.length} new regions.`);
  if (!additions.length) return;

  const next = [...codes].sort();
  const readmes = readmePaths.map(path => ({
    path,
    content: updateReadmeCount(readFileSync(path, 'utf8'), baseline.length, next.length)
  }));
  writeFileSync(statePath, `${JSON.stringify({ codes: next }, null, 2)}\n`);
  for (const { path, content } of readmes) writeFileSync(path, content);
  console.log(`Added: ${additions.join(', ')}. New lower bound: ${next.length}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
