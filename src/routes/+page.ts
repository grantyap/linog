import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data }) => {
	const lastUpdated = new Date();
	return {
		...data,
		lastUpdated
	};
};
