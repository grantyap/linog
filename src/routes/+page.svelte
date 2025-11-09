<script lang="ts">
	import linogLogo from '$lib/assets/Linog.ph logo.svg';
	import * as Accordion from '$lib/components/ui/accordion';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import * as Select from '$lib/components/ui/select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDateWithTimezone, timeAgo } from '$lib/datetime';
	import { earthquakeDataSchema, type EarthquakeData } from '$lib/usgs/schema';
	import { cn } from '$lib/utils';
	import { EarthIcon, ExternalLinkIcon, LocateIcon, SearchIcon } from '@lucide/svelte';
	import { formatHex, oklch, parse, type Color, type Oklch } from 'culori';
	import { mode } from 'mode-watcher';
	import { onMount, tick } from 'svelte';
	import { CircleLayer, GeoJSON, MapLibre } from 'svelte-maplibre';
	import type { PageProps } from './$types';

	const CENTER = [121.774, 12.8797] satisfies [number, number];
	const REFRESH_INTERVAL_MS = 60 * 1000;

	const { data }: PageProps = $props();
	type Feature = EarthquakeData['features'][number];

	let now = $state(new Date());

	const timeFilterOptions = [
		{
			value: 'pastHour',
			label: 'Past hour',
			check: (date: Date) => date.getTime() > now.getTime() - 1000 * 60 * 60
		},
		{
			value: 'past6Hours',
			label: 'Past 6 hours',
			check: (date: Date) => date.getTime() > now.getTime() - 1000 * 60 * 60 * 6
		},
		{
			value: 'past24Hours',
			label: 'Past 24 hours',
			check: (date: Date) => date.getTime() > now.getTime() - 1000 * 60 * 60 * 24
		},
		{
			value: 'past3Days',
			label: 'Past 3 days',
			check: (date: Date) => date.getTime() > now.getTime() - 1000 * 60 * 60 * 24 * 3
		},
		{
			value: 'past7Days',
			label: 'Past 7 days',
			check: (date: Date) => date.getTime() > now.getTime() - 1000 * 60 * 60 * 24 * 7
		},
		{
			value: 'past2Weeks',
			label: 'Past 2 weeks',
			check: (date: Date) => date.getTime() > now.getTime() - 1000 * 60 * 60 * 24 * 14
		},
		{
			value: 'pastMonth',
			label: 'Past month',
			check: (date: Date) => date.getTime() > now.getTime() - 1000 * 60 * 60 * 24 * 30
		}
	] as const;

	// TODO: Keep this state in the URL.
	let timeFilter = $state<(typeof timeFilterOptions)[number]['value']>('past24Hours');
	let timeFilterTriggerContent = $derived(
		timeFilterOptions.find((f) => f.value === timeFilter)?.label ?? ''
	);

	const magnitudeFilterOptions = [
		{
			value: 'all',
			label: 'M1.0+',
			check: (_magnitude: number) => true
		},
		{
			value: 'M2.5+',
			label: 'M2.5+',
			check: (magnitude: number) => magnitude >= 2.5
		},
		{
			value: 'M4.5+',
			label: 'M4.5+',
			check: (magnitude: number) => magnitude >= 4.5
		},
		{
			value: 'M6.5+',
			label: 'M6.5+',
			check: (magnitude: number) => magnitude >= 6.5
		}
	] as const;

	let magnitudeFilter = $state<(typeof magnitudeFilterOptions)[number]['value']>('M2.5+');
	let magnitudeFilterTriggerContent = $derived(
		magnitudeFilterOptions.find((option) => option.value === magnitudeFilter)?.label ?? ''
	);

	const sortOptions = [
		{
			value: 'newest',
			label: 'Newest',
			sort: (a: Feature, b: Feature) => {
				return b.properties.time - a.properties.time;
			}
		},
		{
			value: 'largestMagnitude',
			label: 'Largest magnitude',
			sort: (a: Feature, b: Feature) => {
				return (b.properties.mag ?? 0) - (a.properties.mag ?? 0);
			}
		}
	] as const;

	// TODO: Keep this state in the URL.
	let sort = $state<(typeof sortOptions)[number]['value']>('newest');
	let sortTriggerContent = $derived(sortOptions.find((f) => f.value === sort)?.label ?? '');

	let usgsIsRefreshing = $state(true);
	let phivolcsIsRefreshing = $state(true);
	const isRefreshing = $derived(usgsIsRefreshing || phivolcsIsRefreshing);

	let usgsEarthquakes = $state<EarthquakeData | null>(null);
	let usgsLastModified = $state<string | null>(null);
	onMount(() => {
		data.usgsPromise
			.then(({ data, lastModified }) => {
				usgsEarthquakes = data;
				usgsLastModified = lastModified;
			})
			.finally(() => {
				usgsIsRefreshing = false;
			});
	});

	let phivolcsEarthquakes = $state<EarthquakeData | null>(null);
	let phivolcsLastModified = $state<string | null>(null);
	onMount(() => {
		data.phivolcsPromise
			.then(({ data, lastModified }) => {
				phivolcsEarthquakes = data;
				phivolcsLastModified = lastModified;
			})
			.finally(() => {
				phivolcsIsRefreshing = false;
			});
	});

	const lastModified = $derived(
		[usgsLastModified, phivolcsLastModified]
			.filter((l: string | null): l is string => !!l)
			.toSorted((a, b) => {
				if (a < b) {
					return -1;
				}
				if (a > b) {
					return 1;
				}
				return 0;
			})
			.at(0)
	);

	$effect(() => {
		const controller = new AbortController();
		const id = setInterval(async () => {
			usgsIsRefreshing = true;
			phivolcsIsRefreshing = true;

			fetch('/api/earthquakes/usgs', {
				headers: {
					'if-modified-since': usgsLastModified ?? ''
				},
				signal: controller.signal
			})
				.then((response) => {
					if (response.status === 304) {
						return;
					}

					if (response.ok) {
						response.json().then((data) => {
							const newEarthquakes = earthquakeDataSchema.parse(data);
							usgsLastModified = response.headers.get('last-modified');

							if (newEarthquakes) {
								usgsEarthquakes = newEarthquakes;
							}
						});
					}
				})
				.catch((err) => {
					if (!(err instanceof Error) && err.name !== 'AbortError') {
						throw err;
					}
				})
				.finally(() => {
					usgsIsRefreshing = false;
				});

			fetch('/api/earthquakes/phivolcs', {
				headers: {
					'if-modified-since': phivolcsLastModified ?? ''
				},
				signal: controller.signal
			})
				.then((response) => {
					if (response.status === 304) {
						return;
					}

					if (response.ok) {
						phivolcsLastModified = response.headers.get('last-modified');
						response.json().then((data) => {
							phivolcsEarthquakes = earthquakeDataSchema.parse(data);
						});
					}
				})
				.catch((err) => {
					if (!(err instanceof Error) && err.name !== 'AbortError') {
						throw err;
					}
				})
				.finally(() => {
					phivolcsIsRefreshing = false;
				});
		}, REFRESH_INTERVAL_MS);

		return () => {
			controller.abort();
			clearInterval(id);
		};
	});

	const filteredEarthquakes = $derived.by(() => {
		return [...(usgsEarthquakes?.features ?? []), ...(phivolcsEarthquakes?.features ?? [])]
			.filter((f) => {
				const isInPhilippines =
					f.properties.place.toLowerCase().includes('philippines') ||
					f.properties.sources?.includes('phivolcs');
				if (!isInPhilippines) {
					return false;
				}

				const timeFilterOption = timeFilterOptions.find((o) => o.value === timeFilter);
				if (!timeFilterOption) return false;
				const passesTimeFilter = timeFilterOption.check(new Date(f.properties.time));

				const magnitudeFilterOption = magnitudeFilterOptions.find(
					(o) => o.value === magnitudeFilter
				);
				if (!magnitudeFilterOption) return false;
				const passesMagnitudeFilter = magnitudeFilterOption.check(f.properties.mag ?? 0);

				return passesTimeFilter && passesMagnitudeFilter;
			})
			.toSorted((a, b) => {
				const option = sortOptions.find((o) => o.value === sort);
				if (!option) return 0;
				return option.sort(a, b);
			})
			.map((f) => {
				const selected = selectedFeature === f.properties.url;
				const normalizedMagnitude = normalizeMagnitude(f.properties.mag ?? 0);
				return {
					...f,
					properties: {
						...f.properties,
						selected,
						normalizedMagnitude,
						color: calculateColorForFeature(f, selected)
					}
				};
			});
	});
	const filteredFeatureCollection: GeoJSON.FeatureCollection = $derived({
		type: 'FeatureCollection',
		features: filteredEarthquakes
	});

	function getMagnitudeColor(mag: number) {
		const asClassValue = ({
			foregroundLight,
			foregroundDark,
			backgroundLight,
			backgroundDark
		}: {
			foregroundLight: string;
			foregroundDark: string;
			backgroundLight: string;
			backgroundDark: string;
		}) => {
			return [
				`--magnitude-fg-color: var(${foregroundLight})`,
				`--magnitude-fg-color-dark: var(${foregroundDark})`,
				`--magnitude-bg-color: var(${backgroundLight})`,
				`--magnitude-bg-color-dark: var(${backgroundDark})`
			].join('; ');
		};

		if (mag < 2) {
			return asClassValue({
				foregroundLight: '--color-green-600',
				foregroundDark: '--color-green-200',
				backgroundLight: '--color-green-200',
				backgroundDark: '--color-green-800'
			});
		}
		if (mag < 4) {
			return asClassValue({
				foregroundLight: '--color-yellow-600',
				foregroundDark: '--color-yellow-200',
				backgroundLight: '--color-yellow-200',
				backgroundDark: '--color-yellow-800'
			});
		}
		if (mag < 6) {
			return asClassValue({
				foregroundLight: '--color-orange-600',
				foregroundDark: '--color-orange-200',
				backgroundLight: '--color-orange-200',
				backgroundDark: '--color-orange-800'
			});
		}
		if (mag < 8) {
			return asClassValue({
				foregroundLight: '--color-red-600',
				foregroundDark: '--color-red-200',
				backgroundLight: '--color-red-200',
				backgroundDark: '--color-red-800'
			});
		}
		return asClassValue({
			foregroundLight: '--color-purple-600',
			foregroundDark: '--color-purple-200',
			backgroundLight: '--color-purple-200',
			backgroundDark: '--color-purple-800'
		});
	}

	function asIntensity(value: number) {
		if (value >= 10) {
			return 'X';
		}
		if (value >= 9) {
			return 'IX';
		}
		if (value >= 8) {
			return 'VIII';
		}
		if (value >= 7) {
			return 'VII';
		}
		if (value >= 6) {
			return 'VI';
		}
		if (value >= 5) {
			return 'V';
		}
		if (value >= 4) {
			return 'IV';
		}
		if (value >= 3) {
			return 'III';
		}
		if (value >= 2) {
			return 'II';
		}
		return 'I';
	}

	// TODO: Investigate why this causes jank every 1,000 ms.
	$effect(() => {
		const id = setInterval(() => {
			now = new Date();
		}, 1000);

		return () => {
			clearInterval(id);
		};
	});

	let selectedFeature = $state<string>();
	let accordionRef = $state<HTMLElement | null>(null);
	async function scrollToFeature(id: string) {
		if (!accordionRef) {
			return;
		}

		const feature = accordionRef.querySelector(`[data-id="${id}"]`);
		if (!feature) {
			return;
		}

		await tick();
		feature.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest'
		});
	}

	function normalizeMagnitude(magnitude: number) {
		return (magnitude - 1) / (9 - 1);
	}

	const colors = (() => {
		// Cache colors to avoid asking the document for them every time.
		let unselectedColor: Oklch | null = null;
		let selectedColor: Oklch | null = null;

		const getAndParseColor = (cssVariable: string) => {
			const styles = getComputedStyle(document.documentElement);
			const colorString = styles.getPropertyValue(cssVariable);
			const color = parse(colorString);

			const isOklch = (color: Color): color is Oklch => {
				return color.mode === 'oklch';
			};

			if (!color || !isOklch(color)) {
				throw new Error(`Error parsing color: ${colorString}`);
			}

			return color;
		};

		return {
			get unselectedColor() {
				unselectedColor ??= getAndParseColor('--color-orange-500');
				return unselectedColor;
			},
			get selectedColor() {
				selectedColor ??= getAndParseColor('--color-blue-500');
				return selectedColor;
			}
		};
	})();

	function calculateColorForFeature(feature: Feature, selected: boolean) {
		const normalizedMagnitude = normalizeMagnitude(feature.properties.mag ?? 0);
		const maxLightness = 1.5;
		const minLightness = 0;
		const invertedLightness =
			(maxLightness - minLightness) * (1 - normalizedMagnitude + minLightness);

		const color = selected
			? colors.selectedColor
			: oklch({
					mode: 'oklch',
					l: invertedLightness,
					c: colors.unselectedColor?.c ?? 0,
					h: colors.unselectedColor?.h ?? 0
				});
		const colorHex = formatHex(color);

		return colorHex;
	}

	const clientDateFormatter = new Intl.DateTimeFormat();
	const localDateFormatter = new Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Manila' });

	let map = $state<maplibregl.Map>();
</script>

<svelte:head>
	<title>Linog - Live Earthquake Map</title>
</svelte:head>

<div class="flex h-[100dvh] w-full flex-col-reverse overflow-auto md:flex-row">
	<div class="@container/panel flex min-h-0 flex-1 flex-col">
		<div class="p-4">
			<div
				class="flex flex-col-reverse items-start justify-between gap-x-6 gap-y-2 @md/panel:flex-row"
			>
				<div class="grow">
					<h1 class="text-xs font-medium text-muted-foreground">
						PHIVOLCS and USGS All Earthquakes, Past Month
					</h1>
					<p class="text-xs text-muted-foreground">
						<span class="mr-1">
							{#if lastModified}
								Last updated {clientDateFormatter.format(new Date(lastModified))}
							{:else}
								Updating&hellip;
							{/if}
						</span>
						{#if isRefreshing}
							<Spinner class="inline h-[1lh] align-text-bottom" aria-hidden="true" />
						{/if}
					</p>
				</div>
				<img src={linogLogo} alt="Linog logo" class="h-4 shrink @md/panel:h-8 dark:invert" />
			</div>
			<p class="my-2 text-sm">
				<span class="font-bold">
					{(
						(usgsEarthquakes?.metadata.count ?? 0) + (phivolcsEarthquakes?.metadata.count ?? 0)
					).toLocaleString()}
				</span>
				in the past month
			</p>
			<div class="flex flex-col flex-wrap gap-2 @xs/panel:flex-row">
				<Select.Root type="single" bind:value={timeFilter}>
					<Select.Trigger
						class={cn('w-full flex-1', !timeFilterTriggerContent && 'text-muted-foreground')}
					>
						{timeFilterTriggerContent}
					</Select.Trigger>
					<Select.Content>
						{#each timeFilterOptions as option (option.value)}
							<Select.Item value={option.value}>{option.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				<Select.Root type="single" bind:value={magnitudeFilter}>
					<Select.Trigger
						class={cn('w-full flex-1', !magnitudeFilterTriggerContent && 'text-muted-foreground')}
					>
						{magnitudeFilterTriggerContent}
					</Select.Trigger>
					<Select.Content>
						{#each magnitudeFilterOptions as option (option.value)}
							<Select.Item value={option.value}>{option.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
				<Select.Root type="single" bind:value={sort}>
					<Select.Trigger
						class={cn('w-full flex-1', !sortTriggerContent && 'text-muted-foreground')}
					>
						{sortTriggerContent}
					</Select.Trigger>
					<Select.Content>
						{#each sortOptions as option (option.value)}
							<Select.Item value={option.value}>{option.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
		</div>
		{#if (usgsEarthquakes?.features.length ?? 0) + (phivolcsEarthquakes?.features.length ?? 0) === 0}
			{#if isRefreshing}
				<div class="flex flex-col gap-1 overflow-y-auto px-4">
					{#each Array(4).fill(0)}
						<Skeleton class="h-17 w-full shrink-0" />
					{/each}
				</div>
			{:else}
				<Empty.Root class="select-none">
					<Empty.Header>
						<Empty.Media variant="icon">
							<EarthIcon />
						</Empty.Media>
						<Empty.Title>No data</Empty.Title>
						<Empty.Description>
							There is no earthquake data available at this time.
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		{:else if filteredEarthquakes.length === 0}
			<Empty.Root class="select-none">
				<Empty.Header>
					<Empty.Media variant="icon">
						<SearchIcon />
					</Empty.Media>
					<Empty.Title>No data</Empty.Title>
					<Empty.Description>No data matches the filters.</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			<Accordion.Root
				bind:ref={accordionRef}
				type="single"
				bind:value={selectedFeature}
				onValueChange={(e) => {
					if (!e) {
						return;
					}

					const feature = filteredEarthquakes.find((f) => f.properties.url === e);
					if (!feature) {
						return;
					}

					map?.flyTo({
						center: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
						zoom: 8
					});
				}}
				class="flex-1 overflow-auto px-4 pb-4 [&>li]:not-first:mt-2"
			>
				{#each filteredEarthquakes as feature (feature.properties.url)}
					{@const time = new Date(feature.properties.time)}
					<Accordion.Item value={feature.properties.url} data-id={feature.properties.url}>
						<Accordion.Trigger class="group flex items-center gap-4 !no-underline">
							<div class="relative">
								<div
									class="rounded-md bg-(--magnitude-bg-color) px-1.5 py-0.5 text-2xl font-medium tracking-tight text-(--magnitude-fg-color) dark:bg-(--magnitude-bg-color-dark) dark:text-(--magnitude-fg-color-dark)"
									style={getMagnitudeColor(feature.properties.mag ?? 0)}
									aria-label="Magnitude {(feature.properties.mag ?? 0).toFixed(1)} -"
								>
									{(feature.properties.mag ?? 0).toFixed(1)}
								</div>
								{#if feature.properties.mmi}
									<div
										class="absolute -right-2 -bottom-3 rounded border border-(--magnitude-fg-color)/50 bg-(--magnitude-bg-color) px-0.5 text-xs font-bold text-(--magnitude-fg-color) shadow-md dark:bg-(--magnitude-bg-color-dark) dark:text-(--magnitude-fg-color-dark)"
										style={getMagnitudeColor(feature.properties.mmi ?? 0)}
										aria-label="Intensity - {asIntensity(feature.properties.mmi)}"
									>
										{asIntensity(feature.properties.mmi)}
									</div>
								{/if}
							</div>
							<div class="flex-1">
								<div class="font-medium group-hover:underline">
									{feature.properties.place}
								</div>
								<div class="text-xs font-normal text-muted-foreground">
									{formatDateWithTimezone(time, clientDateFormatter)}
								</div>
							</div>
						</Accordion.Trigger>
						<Accordion.Content class="space-y-2">
							<dl
								class="[&_dt]:text-xs [&_dt]:font-medium [&_dt]:text-muted-foreground [&_dt]:not-first:mt-2 [&dd]:text-sm"
							>
								<dt>Local time</dt>
								<dd>
									<div>
										{localDateFormatter.format(time)} (UTC+08:00)
									</div>
									<div>
										{timeAgo(time, now)}
									</div>
								</dd>
								<dt>Location</dt>
								<dd class="tabular-nums">
									{feature.geometry.coordinates[1].toFixed(3)}&deg;N
									{feature.geometry.coordinates[0].toFixed(3)}&deg;W
								</dd>
								<dt>Depth</dt>
								<dd>{feature.geometry.coordinates[2].toFixed(1)} km</dd>
							</dl>
							<div class="flex flex-wrap items-center gap-2">
								<Button
									onclick={() => {
										map?.flyTo({
											center: [
												feature.geometry.coordinates[0],
												feature.geometry.coordinates[1]
											] satisfies [number, number],
											zoom: 8
										});
									}}
								>
									<LocateIcon />
									Locate
								</Button>
								<Button href={feature.properties.url} target="_blank" variant="link">
									More details
									<ExternalLinkIcon aria-hidden="true" />
								</Button>
							</div>
						</Accordion.Content>
					</Accordion.Item>
				{/each}
				{#if isRefreshing}
					<div class="relative h-17 w-full shrink-0">
						<Spinner class="absolute top-1/2 left-1/2 -translate-1/2 animate-spin" />
					</div>
				{/if}
			</Accordion.Root>
		{/if}
		<p class="mx-2 my-1 text-center text-xs text-muted-foreground">
			<a href="https://grantyap.com" target="_blank" class="underline">
				Grant Yap <ExternalLinkIcon class="inline-block size-3 align-baseline" aria-hidden="true" />
			</a>
			&middot; Data from
			<a href="https://earthquake.phivolcs.dost.gov.ph/" target="_blank" class="underline">
				PHIVOLCS
				<ExternalLinkIcon class="inline-block size-3 align-baseline" aria-hidden="true" />
			</a>
			and
			<a href="https://earthquake.usgs.gov/earthquakes/map/" target="_blank" class="underline">
				U.S. Geological Survey
				<ExternalLinkIcon class="inline-block size-3 align-baseline" aria-hidden="true" />
			</a>
		</p>
	</div>
	<div style="--min-lightness: 0%; --max-lightness: 150%" class="md:flex-2">
		<MapLibre
			bind:map
			center={CENTER}
			zoom={5}
			class="h-[40svh] md:h-full"
			standardControls
			style={mode.current === 'light'
				? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
				: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'}
		>
			<GeoJSON data={filteredFeatureCollection}>
				<CircleLayer
					paint={{
						'circle-color': ['get', 'color'],
						'circle-radius': ['*', ['get', 'normalizedMagnitude'], 20],
						'circle-opacity': 0.8
					}}
					onclick={async (e) => {
						let id = e.features[0].properties?.url;
						if (!id) {
							return;
						}
						if (typeof id === 'number') {
							id = id.toString();
						}
						if (typeof id !== 'string') {
							return;
						}

						await scrollToFeature(id);
						selectedFeature = id;
					}}
				/>
			</GeoJSON>
		</MapLibre>
	</div>
</div>
