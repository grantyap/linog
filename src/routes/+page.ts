import { earthquakeDataSchema } from '$lib/usgs/schema';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	return {
		usgsPromise: fetch('/api/earthquakes/usgs').then((response) =>
			response
				.json()
				.then((data) => ({
					data: earthquakeDataSchema.parse(data),
					lastModified: response.headers.get('last-modified')
				}))
				.catch(() => ({
					data: null,
					lastModified: null
				}))
		),
		phivolcsPromise: fetch('/api/earthquakes/phivolcs').then((response) =>
			response
				.json()
				.then((data) => ({
					data: earthquakeDataSchema.parse(data),
					lastModified: response.headers.get('last-modified')
				}))
				.catch(() => ({
					data: null,
					lastModified: null
				}))
		)
	};
};
