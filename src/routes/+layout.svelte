<script lang="ts">
	import appleTouchIcon from '$lib/assets/apple-touch-icon.png';
	import favicon96x96 from '$lib/assets/favicon-96x96.png';
	import faviconIco from '$lib/assets/favicon.ico';
	import webManifest from '$lib/assets/site.webmanifest';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/png" href={favicon96x96} sizes="96x96" />
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<link rel="shortcut icon" href={faviconIco} />
	<link rel="apple-touch-icon" sizes="180x180" href={appleTouchIcon} />
	<meta name="apple-mobile-web-app-title" content="Linog" />
	<link rel="manifest" href={webManifest} />
</svelte:head>

<Toaster />
<ModeWatcher />
{@render children?.()}
