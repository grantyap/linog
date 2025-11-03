import * as z from 'zod';

export const geometrySchema = z.object({
	type: z.literal('Point'),
	coordinates: z.tuple([z.number(), z.number(), z.number()]) // [longitude, latitude, depth]
});

export const propertiesSchema = z.object({
	mag: z.number().nullable(),
	place: z.string(),
	time: z.number(),
	updated: z.number().nullable(),
	tz: z.number().nullable(),
	url: z.url(),
	detail: z.url().nullable(),
	felt: z.number().nullable(),
	cdi: z.number().nullable(),
	mmi: z.number().nullable(),
	alert: z.string().nullable(),
	status: z.string().nullable(),
	tsunami: z.number().nullable(),
	sig: z.number().nullable(),
	net: z.string().nullable(),
	code: z.string().nullable(),
	ids: z.string().nullable(),
	sources: z.string().nullable(),
	types: z.string().nullable(),
	nst: z.number().nullable(),
	dmin: z.number().nullable(),
	rms: z.number().nullable(),
	gap: z.number().nullable(),
	magType: z.string().nullable(),
	type: z.string(),
	title: z.string()
});

export const featureSchema = z.object({
	type: z.literal('Feature'),
	properties: propertiesSchema,
	geometry: geometrySchema,
	id: z.string()
});

export const metadataSchema = z.object({
	generated: z.number(),
	url: z.url(),
	title: z.string(),
	status: z.number(),
	api: z.string(),
	count: z.number()
});

export const earthquakeDataSchema = z.object({
	type: z.literal('FeatureCollection'),
	metadata: metadataSchema,
	features: z.array(featureSchema)
});

// Type inference
export type EarthquakeData = z.infer<typeof earthquakeDataSchema>;
