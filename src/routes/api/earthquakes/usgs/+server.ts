import { fetchEarthquakes } from '$lib/usgs/index.server';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, fetch }) => {
	const ifModifiedSince = request.headers.get('if-modified-since');
	const { data, lastModified, status } = await fetchEarthquakes({ fetch, ifModifiedSince });

	if (status === 304) {
		return new Response(null, { status: 304 });
	}

	if (data) {
		const headers: Record<string, string> = {};
		if (lastModified) {
			headers['last-modified'] = lastModified;
		}
		return json(data, { headers });
	}

	return new Response('Internal Server Error', { status: 500 });
};
