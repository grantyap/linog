<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Accordion from '$lib/components/ui/accordion';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDateWithTimezone, timeAgo } from '$lib/datetime';
	import { cn } from '$lib/utils';
	import { EarthIcon, ExternalLinkIcon, LocateIcon } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { MapLibre, Marker } from 'svelte-maplibre';
	import { MediaQuery } from 'svelte/reactivity';
	import type { PageProps } from './$types';
	import linogLogo from '$lib/assets/Linog.ph logo.svg';

	const CENTER = [121.774, 12.8797] satisfies [number, number];
	const REFRESH_INTERVAL_MS = 15_000;

	const { data }: PageProps = $props();
	type Feature = (typeof data.earthquakes.features)[number];

	let now = $state(new Date());
	const filterOptions = [
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

	let filter = $state<(typeof filterOptions)[number]['value']>('past24Hours');
	let filterTriggerContent = $derived(filterOptions.find((f) => f.value === filter)?.label ?? '');

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
				return b.properties.mag - a.properties.mag;
			}
		}
	] as const;

	let sort = $state<(typeof sortOptions)[number]['value']>('newest');
	let sortTriggerContent = $derived(sortOptions.find((f) => f.value === sort)?.label ?? '');

	const earthquakes = $derived.by(() => {
		return {
			...data.earthquakes,
			features: data.earthquakes.features
				.filter((f) => {
					if (!f.properties.place.toLowerCase().includes('philippines')) {
						return false;
					}

					const option = filterOptions.find((o) => o.value === filter);
					if (!option) return false;
					return option.check(new Date(f.properties.time));
				})
				.toSorted((a, b) => {
					const option = sortOptions.find((o) => o.value === sort);
					if (!option) return 0;
					return option.sort(a, b);
				})
		};
	});

	function getMagnitudeColor(mag: number) {
		if (mag < 2) return 'bg-green-200 text-green-600 dark:bg-green-800 dark:text-green-200';
		if (mag < 4) return 'bg-yellow-200 text-yellow-600 dark:bg-yellow-800 dark:text-yellow-200';
		if (mag < 6) return 'bg-orange-200 text-orange-600 dark:bg-orange-800 dark:text-orange-200';
		if (mag < 8) return 'bg-red-200 text-red-600 dark:bg-red-800 dark:text-red-200';
		return 'bg-purple-200 text-purple-600 dark:bg-purple-800 dark:text-purple-200';
	}

	let isRefreshing = $state(false);
	$effect(() => {
		const id = setInterval(() => {
			isRefreshing = true;
			invalidateAll().finally(() => {
				isRefreshing = false;
			});
		}, REFRESH_INTERVAL_MS);

		return () => {
			clearInterval(id);
		};
	});

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
		feature.scrollIntoView({ behavior: 'smooth' });
	}

	let map = $state<maplibregl.Map>();

	const isDesktop = new MediaQuery('width >= 48rem');

	function normalizeMagnitude(magnitude: number) {
		return (magnitude - 1) / (9 - 1);
	}
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
					<h1 class="text-xs font-medium text-muted-foreground">{earthquakes.metadata.title}</h1>
					<p class="text-xs text-muted-foreground">
						Last updated {data.lastUpdated.toLocaleString()}
						{#if isRefreshing}
							<Spinner class="ml-1 inline h-[1lh] align-text-bottom" aria-hidden="true" />
						{/if}
					</p>
				</div>
				<img src={linogLogo} alt="Linog logo" class="h-4 shrink @md/panel:h-8" />
			</div>
			<p class="my-2 text-sm">
				<span class="font-bold">{earthquakes.metadata.count.toLocaleString()}</span>
				in the past month
			</p>
			<div class="flex flex-col gap-2 @xs/panel:flex-row">
				<Select.Root type="single" bind:value={filter}>
					<Select.Trigger
						class={cn('w-full flex-1', !filterTriggerContent && 'text-muted-foreground')}
					>
						{filterTriggerContent}
					</Select.Trigger>
					<Select.Content>
						{#each filterOptions as option (option.value)}
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
		{#if earthquakes.features.length === 0}
			<Empty.Root>
				<Empty.Header>
					<Empty.Media variant="icon">
						<EarthIcon />
					</Empty.Media>
					<Empty.Title>No data</Empty.Title>
					<Empty.Description>There is no earthquake data available at this time.</Empty.Description>
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

					const feature = earthquakes.features.find((f) => f.id === e);
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
				{#each earthquakes.features as feature (feature.id)}
					{@const time = new Date(feature.properties.time)}
					<Accordion.Item value={feature.id} data-id={feature.id}>
						<Accordion.Trigger class="group flex items-center gap-2 !no-underline">
							<div
								class={cn(
									'rounded-md px-1.5 py-0.5 text-2xl font-medium tracking-tight',
									getMagnitudeColor(feature.properties.mag)
								)}
								aria-label="Magnitude {feature.properties.mag.toFixed(1)} -"
							>
								{feature.properties.mag.toFixed(1)}
							</div>
							<div class="flex-1">
								<div class="font-medium group-hover:underline">
									{feature.properties.place}
								</div>
								<div class="font-normal text-muted-foreground">{formatDateWithTimezone(time)}</div>
							</div>
						</Accordion.Trigger>
						<Accordion.Content class="space-y-2">
							<dl
								class="[&_dt]:text-xs [&_dt]:font-medium [&_dt]:text-muted-foreground [&_dt]:not-first:mt-2 [&dd]:text-sm"
							>
								<dt>Local time</dt>
								<dd>
									<div>
										{time.toLocaleString(undefined, { timeZone: 'Asia/Manila' })} (UTC+08:00)
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
			</Accordion.Root>
		{/if}
		<p class="my-1 text-center text-xs text-muted-foreground">
			Created by <a href="https://grantyap.com" target="_blank" class="underline"
				>Grant Yap <ExternalLinkIcon
					class="inline-block size-3 align-baseline"
					aria-hidden="true"
				/></a
			>
			&middot; Data from
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
			style="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
		>
			{#each earthquakes.features as feature (feature.id)}
				{@const lngLat = [
					feature.geometry.coordinates[0],
					feature.geometry.coordinates[1]
				] satisfies [number, number]}
				{@const normalizedMagnitude = normalizeMagnitude(feature.properties.mag)}
				<Marker
					{lngLat}
					onclick={async () => {
						await scrollToFeature(feature.id);
						selectedFeature = feature.id;
					}}
				>
					<div
						style={[
							`--magnitude: ${feature.properties.mag}`,
							`--normalized-magnitude: ${normalizedMagnitude}`,
							`--lightness: calc((var(--max-lightness) - var(--min-lightness)) * var(--normalized-magnitude) + var(--min-lightness))`,
							`--inverted-lightness: calc((var(--max-lightness) - var(--min-lightness)) * (1 - var(--normalized-magnitude)) + var(--min-lightness))`,
							`--color: oklch(from var(--chart-1) var(--inverted-lightness) c h)`,
							`--size: calc(var(--normalized-magnitude) * var(--spacing) * 10)`
						].join('; ')}
						class={cn(
							'size-(--size) rounded-full bg-(--color) opacity-80',
							selectedFeature === feature.id && 'bg-blue-500 opacity-100'
						)}
					></div>
				</Marker>
			{/each}
		</MapLibre>
	</div>
</div>
