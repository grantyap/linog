import { fetchEarthquakes } from '$lib/usgs/index.server';
import { earthquakeDataSchema } from '$lib/usgs/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	return {
		usgsPromise: fetchEarthquakes({ fetch }),
		phivolcsPromise: fetch('/api/earthquakes/phivolcs').then((response) =>
			response.json().then((data) => ({
				data: earthquakeDataSchema.parse(data),
				lastModified: response.headers.get('last-modified')
			}))
		)
	};
};
