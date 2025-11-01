import { fetchEarthquakes } from '$lib/usgs/index.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	const { data, lastModified } = await fetchEarthquakes({ fetch });

	return {
		earthquakes: data,
		lastModified
	};
};
