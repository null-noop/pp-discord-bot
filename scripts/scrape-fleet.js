import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FLEET_URL = 'https://pilots.nimblebit.com/wiki/fleet.html';
const scriptDir = dirname(fileURLToPath(import.meta.url));
export const FLEET_DATA_PATH = resolve(scriptDir, '../data/fleet.json');

function stripTags(value) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&mdash;/gi, '—')
    .replace(/&#8212;/gi, '—')
    .replace(/&minus;/gi, '-')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumber(value) {
  const match = value.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function parseCargo(value) {
  const amount = parseNumber(value);
  if (amount === null) return null;
  return /\bt\b/i.test(value) ? Math.round(amount * 1000) : amount;
}

function parsePrice(value) {
  if (/barn find|beta gift/i.test(value) || value === '—') return null;
  const match = value.replace(/,/g, '').match(/\$([0-9]+(?:\.[0-9]+)?)([Mm]?)/);
  if (!match) return null;
  return Math.round(Number(match[1]) * (match[2].toLowerCase() === 'm' ? 1_000_000 : 1));
}

function parseRunway(value) {
  if (/helipad/i.test(value)) return { type: 'helipad', feet: null, display: 'Helipad' };
  const feet = parseNumber(value);
  return { type: /water/i.test(value) ? 'water' : 'runway', feet, display: stripTags(value) };
}

async function fetchWikiPage(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'NJ-Transit-Discord-Bot/1.0' },
  });
  if (!response.ok) throw new Error(`Wiki page returned ${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function discoverPlaneDetailUrls(baseUrl) {
  const wikiBase = new URL('.', baseUrl);
  const indexHtml = await fetchWikiPage(new URL('planes.html', wikiBase).href);
  const classUrls = [...new Set([...indexHtml.matchAll(/href="([^"]*class-[^"]*\.html)"/gi)]
    .map(match => new URL(match[1], wikiBase).href))];

  const detailUrls = new Map();
  for (const classUrl of classUrls) {
    const classHtml = await fetchWikiPage(classUrl);
    for (const match of classHtml.matchAll(/<a href="(plane-[^"]+\.html)">([^<]+)<\/a>/gi)) {
      detailUrls.set(planeNameForLookup(stripTags(match[2])), new URL(match[1], classUrl).href);
    }
  }
  return detailUrls;
}

function planeNameForLookup(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseRestoration(html) {
  const rowMatch = html.match(/<tr><th>Restoring it<\/th><td>(.*?)<\/td><\/tr>/is);
  if (!rowMatch) return null;

  const display = stripTags(rowMatch[1]);
  const costMatch = display.match(/\$([0-9][0-9,.]*)([Mm]?)/);
  const stagesMatch = display.match(/([0-9]+) stages?/i);
  const timeMatch = display.match(/about ([^,]+)$/i);

  let costUsd = null;
  if (costMatch) {
    costUsd = Math.round(Number(costMatch[1].replace(/,/g, ''))
      * (costMatch[2].toLowerCase() === 'm' ? 1_000_000 : 1));
  }

  return {
    restorationCost: display,
    restorationCostUsd: costUsd,
    restorationStages: stagesMatch ? Number(stagesMatch[1]) : null,
    restorationTime: timeMatch ? timeMatch[1].trim() : null,
  };
}

export async function loadLocalFleet() {
  return JSON.parse(await readFile(FLEET_DATA_PATH, 'utf8'));
}

export async function scrapeFleet(url = FLEET_URL) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'NJ-Transit-Discord-Bot/1.0' },
  });
  if (!response.ok) throw new Error(`Fleet page returned ${response.status} ${response.statusText}`);

  const html = await response.text();
  const tableMatch = html.match(/<table[^>]*class="[^"]*\bgrid\b[^"]*"[^>]*>(.*?)<\/table>/is);
  if (!tableMatch) throw new Error('Could not find fleet table in page');

  const rows = [...tableMatch[1].matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)].map(match => match[1]);
  if (rows.length < 2) throw new Error('Fleet table contains no data rows');

  const headers = [...rows[0].matchAll(/<(?:th|td)[^>]*>(.*?)<\/(?:th|td)>/gis)]
    .map(match => stripTags(match[1]).toLowerCase());
  if (!headers.includes('plane')) throw new Error('Fleet table is missing the Plane column');

  let detailUrls = new Map();
  try {
    detailUrls = await discoverPlaneDetailUrls(url);
  } catch (error) {
    console.warn(`Could not discover plane detail URLs: ${error.message}`);
  }

  const planes = [];
  for (const row of rows.slice(1)) {
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map(match => stripTags(match[1]));
    if (cells.length !== headers.length) continue;

    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    if (!record.plane) continue;

    const runway = parseRunway(record.runway);
    const plane = {
      name: record.plane,
      seats: parseNumber(record.seats),
      cargoKg: parseCargo(record.cargo),
      cargoDisplay: record.cargo,
      speedKnots: parseNumber(record.speed),
      speedDisplay: record.speed,
      rangeNm: parseNumber(record.range),
      rangeDisplay: record.range,
      runway: runway.display,
      runwayType: runway.type,
      runwayFeet: runway.feet,
      license: record.license === '—' ? null : record.license,
      licenseDisplay: record.license,
      price: record.price,
      priceUsd: parsePrice(record.price),
      wikiUrl: detailUrls.get(planeNameForLookup(record.plane)) ?? null,
      restorationCost: null,
      restorationCostUsd: null,
      restorationStages: null,
      restorationTime: null,
    };

    if (/barn find/i.test(record.price)) {
      const detailUrl = detailUrls.get(planeNameForLookup(plane.name));
      if (detailUrl) {
        try {
          const detailHtml = await fetchWikiPage(detailUrl);
          const restoration = parseRestoration(detailHtml);
          if (restoration) Object.assign(plane, restoration);
        } catch (error) {
          console.warn(`Could not scrape restoration data for ${plane.name}: ${error.message}`);
        }
      }
    }

    planes.push(plane);
  }

  if (planes.length === 0) throw new Error('No fleet aircraft could be parsed');
  return { source: FLEET_URL, scrapedAt: new Date().toISOString(), planes };
}

export async function refreshFleet(url = FLEET_URL) {
  const fleet = await scrapeFleet(url);
  await mkdir(dirname(FLEET_DATA_PATH), { recursive: true });
  const temporaryPath = `${FLEET_DATA_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(fleet, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, FLEET_DATA_PATH);
  return fleet;
}

const isCli = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  refreshFleet()
    .then(fleet => {
      console.log(`Updated ${fleet.planes.length} planes in ${FLEET_DATA_PATH}`);
      console.log(`Scraped at ${fleet.scrapedAt}`);
    })
    .catch(error => {
      console.error(`Fleet refresh failed: ${error.message}`);
      process.exitCode = 1;
    });
}
