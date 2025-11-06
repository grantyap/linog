import { parsePhivolcsDate } from '$lib/datetime';
import { phivolcsListToEarthquakeData, type PhivolcsListItem } from '$lib/phivolcs/schema';
import { error, json } from '@sveltejs/kit';
import * as cheerio from 'cheerio';
import type { RequestHandler } from './$types';
import type { EarthquakeData } from '$lib/usgs/schema';

const PHIVOLCS_BASE_URL = 'https://earthquake.phivolcs.dost.gov.ph';
const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
	data: EarthquakeData | null;
	lastModified: string | null;
	timestamp: number;
}

const cache = {
	currentMonth: { data: null, lastModified: null, timestamp: 0 } as CacheEntry,
	lastMonth: { data: null, lastModified: null, timestamp: 0 } as CacheEntry
};

function isCacheValid(entry: CacheEntry): boolean {
	return !!(entry.data && entry.timestamp && Date.now() - entry.timestamp < CACHE_TTL);
}

function isCacheFresh(entry: CacheEntry): boolean {
	return !!(entry.data && entry.lastModified);
}

export const GET: RequestHandler = async ({ request, fetch }) => {
	const currentMonthURL = PHIVOLCS_BASE_URL;
	const lastMonthURL = (() => {
		const date = new Date();
		let year = date.getFullYear();
		let month = date.getMonth() + 1;

		month -= 1;
		if (month < 1) {
			month = 12;
			year -= 1;
		}

		return `${PHIVOLCS_BASE_URL}/EQLatest-Monthly/${year}/${year}_${MONTHS[month - 1]}.html`;
	})();

	// Fetch both sources concurrently
	const [currentMonthResult, lastMonthResult] = await Promise.allSettled([
		fetchMonthData(currentMonthURL, cache.currentMonth, fetch, request.signal),
		fetchMonthData(lastMonthURL, cache.lastMonth, fetch, request.signal)
	]);

	// Update cache for current month
	if (currentMonthResult.status === 'fulfilled' && currentMonthResult.value) {
		cache.currentMonth = currentMonthResult.value;
	} else if (currentMonthResult.status === 'rejected') {
		console.error('Error fetching current month:', currentMonthResult.reason);
	}

	// Update cache for last month
	if (lastMonthResult.status === 'fulfilled' && lastMonthResult.value) {
		cache.lastMonth = lastMonthResult.value;
	} else if (lastMonthResult.status === 'rejected') {
		console.error('Error fetching last month:', lastMonthResult.reason);
	}

	// Get the best available data (prefer fresh, fall back to stale cache)
	const currentMonthData = cache.currentMonth.data;
	const lastMonthData = cache.lastMonth.data;

	if (!currentMonthData || !lastMonthData) {
		console.error('PHIVOLCS: No data available (fresh or cached)');
		error(503, 'Earthquake data temporarily unavailable');
	}

	// Determine the newest last-modified date for response headers
	const newestLastModified = getNewestLastModified(
		cache.currentMonth.lastModified,
		cache.lastMonth.lastModified
	);

	// Check if client cache is still valid
	const ifModifiedSince = request.headers.get('if-modified-since');
	if (ifModifiedSince && newestLastModified) {
		const clientDate = new Date(ifModifiedSince);
		const serverDate = new Date(newestLastModified);

		if (clientDate >= serverDate) {
			return new Response(null, {
				status: 304,
				headers: {
					'last-modified': newestLastModified,
					'cache-control': 'public, max-age=300' // 5 minutes
				}
			});
		}
	}

	// Combine and return data
	const combinedData: EarthquakeData = {
		...currentMonthData,
		metadata: {
			...currentMonthData.metadata,
			count: currentMonthData.metadata.count + lastMonthData.metadata.count
		},
		features: [...lastMonthData.features, ...currentMonthData.features]
	};

	return json(combinedData, {
		headers: {
			'last-modified': newestLastModified ?? new Date().toUTCString(),
			'cache-control': 'public, max-age=300' // 5 minutes
		}
	});
};

async function fetchMonthData(
	url: string,
	cacheEntry: CacheEntry,
	fetch: typeof globalThis.fetch,
	signal: AbortSignal
): Promise<CacheEntry | null> {
	// If cache is still valid (within TTL), don't fetch
	if (isCacheValid(cacheEntry)) {
		return null; // null means "use existing cache"
	}

	// Build headers with conditional request if we have cached data
	const headers: Record<string, string> = {};
	if (isCacheFresh(cacheEntry)) {
		headers['if-modified-since'] = cacheEntry.lastModified!;
	}

	try {
		const response = await fetch(url, { headers, signal });

		// 304: Server says our cache is still fresh
		if (response.status === 304) {
			return {
				...cacheEntry,
				timestamp: Date.now() // Refresh TTL
			};
		}

		if (!response.ok) {
			console.error(`HTTP ${response.status} from ${url}`);
			// Return null to keep using existing cache
			return null;
		}

		// Parse and cache new data
		const html = await response.text();
		const items = await getPhivolcsItemsFromMonthPage(html, { fetch });
		const data = phivolcsListToEarthquakeData(items);

		return {
			data,
			lastModified: response.headers.get('last-modified'),
			timestamp: Date.now()
		};
	} catch (err) {
		console.error(`Error fetching ${url}:`, err);
		// Return null to keep using existing cache
		return null;
	}
}

function getNewestLastModified(...dates: (string | null)[]): string | null {
	const validDates = dates
		.filter((d): d is string => d !== null)
		.map((d) => new Date(d))
		.filter((d) => !isNaN(d.getTime()));

	if (validDates.length === 0) return null;

	const newest = validDates.reduce((max, current) => (current > max ? current : max));

	return newest.toUTCString();
}

async function getPhivolcsItemsFromMonthPage(html: string, { fetch = globalThis.fetch }) {
	const $ = cheerio.load(html);
	const table = $(`table:has(tbody > tr > td a[href*="Earthquake_Information"])`);
	const rows = $(table).find('tbody > tr');

	const rowPromises = rows.map(async (_, row) => {
		const cells = $(row).find('td');

		const itemParts = $(cells).map(async (i, cell): Promise<Partial<PhivolcsListItem>> => {
			switch (i) {
				case 0: {
					const aEl = $(cell).find('a');

					const href = (() => {
						let href = aEl.attr('href');
						if (typeof href === 'undefined' || !href) {
							return '';
						}

						// Use forward slashes instead
						href = href.replace(/\\/g, '/');
						// Remove leading '/'
						if (href.startsWith('/')) {
							href = href.slice(1);
						}

						return new URL(href, PHIVOLCS_BASE_URL).toString();
					})();

					const date = parsePhivolcsDate(aEl.text().trim());

					const intensity = await (async () => {
						// There is a recorded intensity if the link is blue.
						// The <a> element is blue by default, but if there's
						// a <span> inside, then it is pink (no intensity).
						if (aEl.find('span').length > 0) {
							return null;
						}

						try {
							return await getIntensityFromDetailPage(href, { fetch });
						} catch (err) {
							console.error(`Error getting intensity for ${href}:`, err);
							return null;
						}
					})();

					return { href, date, intensity };
				}
				case 1:
					return { latitudeN: Number.parseFloat($(cell).text().trim()) };
				case 2:
					return { longitudeE: Number.parseFloat($(cell).text().trim()) };
				case 3:
					return { depthKm: Number.parseFloat($(cell).text().trim()) };
				case 4:
					return { magnitude: Number.parseFloat($(cell).text().trim()) };
				case 5:
					return { location: $(cell).text().replace(/\s+/g, ' ').trim() };
				default:
					return {};
			}
		});

		return (await Promise.all(itemParts)).reduce(
			(obj: PhivolcsListItem, part) => Object.assign(obj, part) as PhivolcsListItem,
			{
				href: '',
				date: new Date(0),
				latitudeN: 0,
				longitudeE: 0,
				depthKm: 0,
				magnitude: 0,
				location: '',
				intensity: null
			} satisfies PhivolcsListItem
		);
	});

	const items = (await Promise.all(rowPromises)).filter((item) => item.href);
	const uniqueItems = items.filter(
		(item, index, self) => index === self.findIndex((t) => t.href === item.href)
	);

	return uniqueItems;
}

async function getIntensityFromDetailPage(url: string, { fetch = globalThis.fetch }) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}: ${response.statusText}`);
	}

	const body = await response.text();
	const $ = cheerio.load(body);

	const reportedIntensities = $(
		'table.MsoNormalTable table.MsoNormalTable > tbody > tr td:has(p.MsoNormal > b)'
	)
		.map((_, el) => {
			const $el = $(el);
			const elText = $el.text().trim().replace(/\s+/g, ' ');

			if (!elText.toLowerCase().includes('reported intensities')) {
				return null;
			}

			const intensityText = $el.next('td').text();
			const partsList = intensityText.matchAll(/Intensity (\w+)/g);
			if (!partsList) {
				return null;
			}

			const highestIntensity = partsList
				.map(([_matched, captured]) => intensityDisplayToValue(captured))
				.toArray()
				.toSorted((a, b) => b - a)
				.at(0);

			return highestIntensity;
		})
		.get()
		.at(0);

	return reportedIntensities ?? null;
}

function intensityDisplayToValue(intensity: string): number {
	const intensityMap: Record<string, number> = {
		i: 1,
		ii: 2,
		iii: 3,
		iv: 4,
		v: 5,
		vi: 6,
		vii: 7,
		viii: 8,
		ix: 9,
		x: 10
	};

	const value = intensityMap[intensity.toLowerCase()];
	if (value === undefined) {
		throw new Error(`Invalid intensity: ${intensity}`);
	}

	return value;
}
