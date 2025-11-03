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

const cache = {
	currentMonthData: null as EarthquakeData | null,
	currentMonthLastModified: null as string | null,
	lastMonthData: null as EarthquakeData | null,
	lastMonthLastModified: null as string | null
};

export const GET: RequestHandler = async ({ request, fetch }) => {
	const currentMonthURL = PHIVOLCS_BASE_URL;
	const lastMonthURL = (() => {
		const now = new Date();

		let year = now.getFullYear();
		let month = now.getMonth() + 1;

		month -= 1;
		// Handle underflow.
		if (month < 1) {
			month = 12;
			year -= 1;
		}

		return `${PHIVOLCS_BASE_URL}/EQLatest-Monthly/${year}/${year}_${MONTHS[month - 1]}.html`;
	})();

	const headers: Record<string, string> = {};
	const ifModifiedSince = request.headers.get('if-modified-since');
	const didCache = cache.currentMonthData || cache.lastMonthData;
	if (ifModifiedSince && didCache) {
		headers['if-modified-since'] = ifModifiedSince;
	}

	let [currentMonthData, lastMonthData] = await Promise.all([
		fetch(currentMonthURL, { headers, signal: request.signal }).then(async (response) => {
			if (response.status === 304) {
				return null;
			}

			if (!response.ok) {
				// No-op.
				console.error(
					`Error fetching earthquakes from this month: ${response.status} ${response.statusText}`
				);
				return null;
			}

			const items = await getPhivolcsItemsFromMonthPage(await response.text(), {
				fetch,
				ifModifiedSince: ifModifiedSince ?? ''
			});

			cache.currentMonthLastModified = response.headers.get('last-modified');
			cache.currentMonthData = phivolcsListToEarthquakeData(items);

			return phivolcsListToEarthquakeData(items);
		}),
		fetch(lastMonthURL, { headers, signal: request.signal }).then(async (response) => {
			if (response.status === 304) {
				return null;
			}

			if (!response.ok) {
				// No-op.
				console.error(
					`Error fetching earthquakes from previous month: ${response.status} ${response.statusText}`
				);
				return null;
			}

			const items = await getPhivolcsItemsFromMonthPage(await response.text(), {
				fetch,
				ifModifiedSince: ifModifiedSince ?? ''
			});

			cache.lastMonthLastModified = response.headers.get('last-modified');
			cache.lastMonthData = phivolcsListToEarthquakeData(items);

			return phivolcsListToEarthquakeData(items);
		})
	]);

	currentMonthData ??= cache.currentMonthData;
	lastMonthData ??= cache.lastMonthData;

	if (!currentMonthData || !lastMonthData) {
		console.error("PHIVOLCS cache empty, couldn't complete request");

		cache.currentMonthData = null;
		cache.lastMonthData = null;
		cache.currentMonthLastModified = null;
		cache.lastMonthLastModified = null;
		error(500);
	}

	const newestLastModified = (() => {
		const currentMonthLastModified = cache.currentMonthLastModified
			? new Date(cache.currentMonthLastModified)
			: null;
		const lastMonthLastModified = cache.lastMonthLastModified
			? new Date(cache.lastMonthLastModified)
			: null;

		if (!currentMonthLastModified) return lastMonthLastModified;
		if (!lastMonthLastModified) return currentMonthLastModified;
		return currentMonthLastModified > lastMonthLastModified
			? currentMonthLastModified
			: lastMonthLastModified;
	})();

	if (ifModifiedSince && newestLastModified) {
		const clientDate = new Date(ifModifiedSince);
		if (clientDate >= newestLastModified) {
			console.log(clientDate, 'Cache hit');
			return new Response(null, {
				status: 304,
				headers: {
					'last-modified': newestLastModified.toUTCString() ?? ''
				}
			});
		}
	}

	return json(
		{
			...currentMonthData,
			metadata: {
				...currentMonthData.metadata,
				count: currentMonthData.metadata.count + lastMonthData.metadata.count
			},
			features: [...(lastMonthData?.features ?? []), ...(currentMonthData?.features ?? [])]
		} satisfies EarthquakeData,
		{
			headers: {
				'last-modified': newestLastModified?.toUTCString() ?? ''
			}
		}
	);
};

async function getPhivolcsItemsFromMonthPage(
	html: string,
	{ fetch = globalThis.fetch, ifModifiedSince = '' }
) {
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
						if (typeof href === 'undefined') {
							return '';
						}
						if (!href) {
							return '';
						}

						// Use forward slashes instead.
						href = href.replace(/\\/g, '/');
						// Remove the leading '/'.
						if (href.at(0) === '/') {
							href = href.slice('/'.length);
						}

						return new URL(href, PHIVOLCS_BASE_URL).toString();
					})();
					const date = parsePhivolcsDate(aEl.text().trim());
					const intensity = await (async () => {
						// There is a recorded intensity if the link is blue.
						// The `<a>` element is blue by default, but if there's
						// a `<span>` inside, then it is pink.
						//
						// In other words, if there is a `<span>` inside, then
						// the item does not have a recorded intensity.
						if (aEl.find('span').length > 0) {
							return null;
						}

						try {
							return await getIntensityFromDetailPage(href, {
								fetch,
								ifModifiedSince: ifModifiedSince ?? undefined
							});
						} catch (err) {
							console.error(`Error getting intensity for ${href}`);
							return null;
						}
					})();

					return {
						href,
						date,
						intensity
					};
				}
				case 1: {
					return {
						latitudeN: Number.parseFloat($(cell).text().trim())
					};
				}
				case 2: {
					return {
						longitudeE: Number.parseFloat($(cell).text().trim())
					};
				}
				case 3: {
					return {
						depthKm: Number.parseFloat($(cell).text().trim())
					};
				}
				case 4: {
					return {
						magnitude: Number.parseFloat($(cell).text().trim())
					};
				}
				case 5: {
					return {
						location: $(cell).text().replace(/\s+/g, ' ').trim()
					};
				}
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

	return (await Promise.all(rowPromises)).filter((item) => item.href);
}

async function getIntensityFromDetailPage(
	url: string,
	{ fetch = globalThis.fetch, ifModifiedSince = '' }
) {
	const response = await fetch(url, {
		headers: {
			'if-modified-since': ifModifiedSince
		}
	});

	if (response.status === 304) {
		return null;
	}

	if (!response.ok) {
		error(response.status, await response.text());
	}

	const body = await response.text();
	const $ = cheerio.load(body);

	const reportedIntensities = $(
		'table.MsoNormalTable table.MsoNormalTable > tbody > tr td:has(p.MsoNormal > b)'
	)
		.map((_, el) => {
			const $el = $(el);
			const elText = $el.text().trim().replace(/\s+/g, ' ');

			const isReportedIntensities = elText.toLowerCase().includes('reported intensities');
			if (!isReportedIntensities) {
				return null;
			}

			const intensityText = $el.next('td').text();
			const partsList = intensityText.matchAll(/Intensity (\w+)/g);
			if (!partsList) {
				return null;
			}

			const highestIntensity = partsList
				.map(([_matched, captured]) => {
					return intensityDisplayToValue(captured);
				})
				.toArray()
				.toSorted((a, b) => {
					return b - a;
				})
				.at(0);

			return highestIntensity;
		})
		.get()
		.at(0);
	return reportedIntensities ?? null;
}

function intensityDisplayToValue(intensity: string) {
	switch (intensity.toLowerCase()) {
		case 'i':
			return 1;
		case 'ii':
			return 2;
		case 'iii':
			return 3;
		case 'iv':
			return 4;
		case 'v':
			return 5;
		case 'vi':
			return 6;
		case 'vii':
			return 7;
		case 'viii':
			return 8;
		case 'ix':
			return 9;
		case 'x':
			return 10;
		default:
			throw new Error('Invalid intensity');
	}
}
