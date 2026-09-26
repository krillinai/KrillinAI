import { readFileSync, writeFileSync } from 'node:fs';

// Natural Earth 1:50m admin-0 countries (public domain), pinned at:
// https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19
// Coverage: September 21, 2026 website snapshot, plus Senegal (starred September 22).
const starredCodes = new Set(`
  ARE ARG ARM AUS AUT AZE BEL BGD BGR BIH BLR BRA CAN CHE CHL CHN CIV
  COL CRI CYP CZE DEU DNK DOM DZA ECU EGY ESP EST FIN FRA GAB GBR GEO
  GHA GRC HKG HUN IDN IND IRL IRN ISL ISR ITA JOR JPN KAZ KEN KHM
  KOR KWT LKA LTU LVA MAC MAR MEX MLT MMR MNG MYS NGA NIC NLD NOR
  NPL NZL PAK PER PHL POL PRI PRT PRY PSE QAT ROU RUS SAU SEN SGP
  SOM SRB SVK SWE THA TUN TUR TWN TZA UGA UKR USA UZB VNM YEM ZAF
  XKX
`.trim().split(/\s+/));

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Usage: node scripts/generate-star-coverage-map.mjs <Natural Earth GeoJSON>');
if (starredCodes.size !== 99) throw new Error(`Expected 99 regions, found ${starredCodes.size}`);

const { features } = JSON.parse(readFileSync(sourcePath, 'utf8'));
const width = 1120;
const height = 470;
const left = 18;
const top = 16;
const mapWidth = width - left * 2;
const mapHeight = height - top * 2;
const x = longitude => (left + ((longitude + 180) / 360) * mapWidth).toFixed(1);
const y = latitude => (top + ((84 - latitude) / 144) * mapHeight).toFixed(1);

function simplify(points, toleranceSquared = 0.65) {
  const keep = new Set([0, points.length - 1]);
  function visit(start, end) {
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
    let largestDistance = 0;
    let largestIndex = -1;
    for (let index = start + 1; index < end; index++) {
      const [px, py] = points[index];
      const fraction = lengthSquared === 0 ? 0
        : Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lengthSquared));
      const distance = (px - ax - fraction * (bx - ax)) ** 2
        + (py - ay - fraction * (by - ay)) ** 2;
      if (distance > largestDistance) {
        largestDistance = distance;
        largestIndex = index;
      }
    }
    if (largestDistance > toleranceSquared && largestIndex !== -1) {
      keep.add(largestIndex);
      visit(start, largestIndex);
      visit(largestIndex, end);
    }
  }
  visit(0, points.length - 1);
  return points.filter((_, index) => keep.has(index));
}

function pathForGeometry(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map(polygon => polygon.map(ring => {
    const points = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]
      ? ring.slice(0, -1)
      : ring;
    const projected = points.map(([longitude, latitude]) => [Number(x(longitude)), Number(y(latitude))]);
    const reduced = simplify(projected);
    return (reduced.length < 3 ? projected.slice(0, 3) : reduced)
      .map(([pointX, pointY], index) => `${index === 0 ? 'M' : 'L'}${pointX} ${pointY}`)
      .join(' ') + ' Z';
  }).join(' ')).join(' ');
}

const countries = features.filter(feature => feature.properties.ADMIN !== 'Antarctica').map(feature => {
  const code = feature.properties.ADMIN === 'Kosovo' ? 'XKX'
    : feature.properties.ISO_A3 === '-99' ? feature.properties.ADM0_A3
      : feature.properties.ISO_A3;
  return { code, path: pathForGeometry(feature.geometry) };
});
const availableCodes = new Set(countries.map(country => country.code));
const missing = [...starredCodes].filter(code => !availableCodes.has(code));
if (missing.length) throw new Error(`Missing map regions: ${missing.join(', ')}`);

const grid = [
  ...[-120, -60, 0, 60, 120].map(longitude =>
    `<path d="M${x(longitude)} ${top}V${height - top}"/>`),
  ...[-30, 0, 30, 60].map(latitude =>
    `<path d="M${left} ${y(latitude)}H${width - left}"/>`)
].join('\n    ');
const paths = selected => countries.filter(country => starredCodes.has(country.code) === selected)
  .map(country => `<path d="${country.path}"/>`).join('\n    ');

// Small regions remain visible when the shared image is scaled down in a README.
const markers = [
  [114.17, 22.3], // Hong Kong
  [113.54, 22.2], // Macao
  [103.82, 1.35], // Singapore
  [14.38, 35.94], // Malta
  [-66.59, 18.22] // Puerto Rico
].map(([longitude, latitude]) =>
  `<circle cx="${x(longitude)}" cy="${y(latitude)}" r="3.3"/>`).join('\n    ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">OpenCreator Star coverage around the world</title>
  <desc id="desc">At least 99 countries and regions with GitHub users who have starred OpenCreator are highlighted.</desc>
  <rect width="${width}" height="${height}" rx="12" fill="#edf5f4"/>
  <g fill="none" stroke="#d8e9e6" stroke-width="1">
    ${grid}
  </g>
  <g fill="#cbd9da" stroke="#edf5f4" stroke-width="0.8" fill-rule="evenodd">
    ${paths(false)}
  </g>
  <g fill="#168574" stroke="#edf5f4" stroke-width="0.8" fill-rule="evenodd">
    ${paths(true)}
  </g>
  <g fill="#e5a84b" stroke="#ffffff" stroke-width="1.4">
    ${markers}
  </g>
</svg>
`;

writeFileSync('docs/images/star-coverage-map.svg', svg);
