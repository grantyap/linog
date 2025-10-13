import * as z from 'zod';

const geometrySchema = z.object({
	type: z.literal('Point'),
	coordinates: z.tuple([z.number(), z.number(), z.number()]) // [longitude, latitude, depth]
});

const propertiesSchema = z.object({
	mag: z.number(),
	place: z.string(),
	time: z.number(),
	updated: z.number(),
	tz: z.number().nullable(),
	url: z.url(),
	detail: z.url(),
	felt: z.number().nullable(),
	cdi: z.number().nullable(),
	mmi: z.number().nullable(),
	alert: z.string().nullable(),
	status: z.string(),
	tsunami: z.number(),
	sig: z.number(),
	net: z.string(),
	code: z.string(),
	ids: z.string(),
	sources: z.string(),
	types: z.string(),
	nst: z.number().nullable(),
	dmin: z.number().nullable(),
	rms: z.number(),
	gap: z.number().nullable(),
	magType: z.string(),
	type: z.literal('earthquake'),
	title: z.string()
});

const featureSchema = z.object({
	type: z.literal('Feature'),
	properties: propertiesSchema,
	geometry: geometrySchema,
	id: z.string()
});

const metadataSchema = z.object({
	generated: z.number(),
	url: z.url(),
	title: z.string(),
	status: z.number(),
	api: z.string(),
	count: z.number()
});

const earthquakeDataSchema = z.object({
	type: z.literal('FeatureCollection'),
	metadata: metadataSchema,
	features: z.array(featureSchema)
});

// Type inference
type EarthquakeData = z.infer<typeof earthquakeDataSchema>;

// Export schemas
export {
	earthquakeDataSchema as EarthquakeDataSchema,
	featureSchema as FeatureSchema,
	propertiesSchema as PropertiesSchema,
	geometrySchema as GeometrySchema,
	metadataSchema as MetadataSchema,
	type EarthquakeData
};

let cache: {
	response: Response;
	lastModified: string | null;
	etag: string | null;
	expiresAt: number | null;
	cachedAt: number | null;
} | null = null;

export async function fetchEarthquakes({ fetch = globalThis.fetch }) {
	const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson';
	const asEarthQuakeData = async (response: Response) => {
		return earthquakeDataSchema.parse(await response.json());
	};

	const headers: Record<string, string> = {};
	if (cache) {
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
			return asEarthQuakeData(response);
		}
	}

	// Make request with conditional headers
	const response = await fetch(url, { headers });

	// 304 Not Modified - return cached response
	if (response.status === 304 && cache) {
		console.log(new Date(), 'Cache miss, no updates');

		// Update expiration if new Cache-Control provided
		updateCacheExpiry(cache, response);
		return asEarthQuakeData(cache.response.clone());
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

		cache = {
			response: clonedResponse,
			lastModified,
			etag,
			expiresAt,
			cachedAt: Date.now()
		};
	}

	return asEarthQuakeData(response);
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
