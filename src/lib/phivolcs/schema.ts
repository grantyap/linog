import type { EarthquakeData } from '$lib/usgs/schema';
import * as z from 'zod';

export const phivolcsListItemSchema = z.object({
	href: z.string(),
	date: z.codec(z.iso.datetime(), z.date(), {
		decode: (isoString) => new Date(isoString),
		encode: (date) => date.toISOString()
	}),
	latitudeN: z.number(),
	longitudeE: z.number(),
	depthKm: z.number(),
	magnitude: z.number(),
	location: z.string(),
	intensity: z.number().nullable()
});

export type PhivolcsListItem = z.infer<typeof phivolcsListItemSchema>;

export function phivolcsListToEarthquakeData(items: PhivolcsListItem[]): EarthquakeData {
	return {
		type: 'FeatureCollection',
		metadata: {
			generated: Date.now(),
			url: 'https://earthquake.phivolcs.dost.gov.ph',
			title: 'PHIVOLCS Latest Earthquake Information',
			status: 200,
			api: '1.0.0',
			count: items.length
		},
		features: items.map((item) => {
			return {
				type: 'Feature',
				properties: {
					mag: item.magnitude,
					place: item.location,
					time: item.date.getTime(),
					updated: null,
					tz: null,
					url: item.href,
					detail: null,
					felt: null,
					cdi: null,
					mmi: item.intensity,
					alert: null,
					status: null,
					tsunami: null,
					sig: null,
					net: null,
					code: null,
					ids: null,
					sources: ",phivolcs,",
					types: null,
					nst: null,
					dmin: null,
					rms: null,
					gap: null,
					magType: null,
					type: 'earthquake',
					title: item.location
				},
				geometry: {
					type: 'Point',
					coordinates: [item.longitudeE, item.latitudeN, item.depthKm]
				},
				id: item.href
			};
		})
	};
}
