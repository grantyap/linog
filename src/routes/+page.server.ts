import { fetchEarthquakes } from '$lib/server/usgs';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	const earthquakes = await fetchEarthquakes({ fetch });
	return {
		earthquakes
	};
};
