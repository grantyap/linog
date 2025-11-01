import { earthquakeDataSchema } from './schema';

let cache: {
	response: Response;
	lastModified: string | null;
	etag: string | null;
	expiresAt: number | null;
	cachedAt: number | null;
} | null = null;

export async function fetchEarthquakes({
	fetch = globalThis.fetch,
	ifModifiedSince
}: {
	fetch?: typeof globalThis.fetch;
	ifModifiedSince?: Date | string | null;
}) {
	const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson';
	const asEarthQuakeData = async (response: Response) => {
		return earthquakeDataSchema.parse(await response.json());
	};

	const headers: Record<string, string> = {};
	const ifModifiedSinceHeader =
		ifModifiedSince instanceof Date
			? ifModifiedSince.toUTCString()
			: typeof ifModifiedSince === 'string'
				? ifModifiedSince
				: null;

	if (ifModifiedSinceHeader) {
		headers['if-modified-since'] = ifModifiedSinceHeader;
	} else if (cache) {
		if (cache.lastModified) {
			headers['if-modified-since'] = cache.lastModified;
		}
		if (cache.etag) {
			headers['if-none-match'] = cache.etag;
		}

		// Check if cache is still fresh based on Cache-Control
		if (cache.expiresAt && Date.now() < cache.expiresAt) {
			console.log(new Date(), 'Cache hit!');
			const response = cache.response.clone();
			return {
				data: await asEarthQuakeData(response),
				lastModified: cache.lastModified,
				status: 200
			};
		}
	}

	// Make request with conditional headers
	const response = await fetch(url, { headers });

	// 304 Not Modified - return cached response
	if (response.status === 304) {
		console.log(new Date(), 'Cache miss, no updates');

		if (ifModifiedSinceHeader) {
			return { data: null, lastModified: null, status: 304 };
		}

		if (cache) {
			// Update expiration if new Cache-Control provided
			updateCacheExpiry(cache, response);
			return {
				data: await asEarthQuakeData(cache.response.clone()),
				lastModified: cache.lastModified,
				status: 200
			};
		}

		return { data: null, lastModified: null, status: 304 };
	}

	// 200 OK - cache the new response
	if (response.ok) {
		const clonedResponse = response.clone();
		const lastModified = response.headers.get('last-modified');
		const etag = response.headers.get('etag');
		const cacheControl = response.headers.get('cache-control');
		const expiresAt = calculateExpiry(cacheControl);

		console.log(
			new Date(),
			`Cache miss, new updates.${expiresAt ? ' Expiry: ' + new Date(expiresAt).toISOString() : ''}`
		);

		const data = await asEarthQuakeData(response);

		if (!ifModifiedSinceHeader) {
			cache = {
				response: clonedResponse,
				lastModified,
				etag,
				expiresAt,
				cachedAt: Date.now()
			};
		}

		return { data, lastModified, status: 200 };
	}

	// This will throw for non-ok responses if they are not valid json.
	const data = await asEarthQuakeData(response);
	return { data, lastModified: null, status: response.status };
}

function calculateExpiry(cacheControl: string | null) {
	if (!cacheControl) return null;

	const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
	if (maxAgeMatch) {
		return Date.now() + parseInt(maxAgeMatch[1]) * 1000;
	}

	return null;
}

function updateCacheExpiry(cached: NonNullable<typeof cache>, response: Response) {
	const cacheControl = response.headers.get('cache-control');
	if (cacheControl) {
		cached.expiresAt = calculateExpiry(cacheControl);
	}
}
