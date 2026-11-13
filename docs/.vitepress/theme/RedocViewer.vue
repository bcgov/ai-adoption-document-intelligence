<script setup lang="ts">
import { withBase } from "vitepress";
import { onMounted, ref } from "vue";

// Pinned so the page changes only when this line does. Redoc 3's standalone bundle uses
// import.meta and does not load as a classic script, so this stays on the last 2.x release.
const REDOC_BUNDLE = "https://cdn.redoc.ly/redoc/v2.5.4/bundles/redoc.standalone.js";

interface RedocStandalone {
	init(specUrl: string, options: Record<string, unknown>, element: HTMLElement): void;
}

type WindowWithRedoc = Window & { Redoc?: RedocStandalone };

const container = ref<HTMLElement | null>(null);
const error = ref("");

/** Loads the Redoc bundle once and returns its global. */
function loadRedoc(): Promise<RedocStandalone> {
	const host = window as WindowWithRedoc;
	if (host.Redoc) {
		return Promise.resolve(host.Redoc);
	}
	return new Promise((resolveRedoc, rejectRedoc) => {
		const script = document.createElement("script");
		script.src = REDOC_BUNDLE;
		script.async = true;
		script.onload = () => (host.Redoc ? resolveRedoc(host.Redoc) : rejectRedoc(new Error("Redoc did not load.")));
		script.onerror = () => rejectRedoc(new Error("Redoc did not load."));
		document.head.appendChild(script);
	});
}

onMounted(async () => {
	const element = container.value;
	if (!element) {
		return;
	}
	try {
		const redoc = await loadRedoc();
		redoc.init(
			withBase("/openapi.json"),
			{
				scrollYOffset: 64,
				hideDownloadButton: false,
				theme: {
					colors: {
						primary: { main: "#003366" },
						success: { main: "#2E8540" },
						warning: { main: "#FCBA19" },
					},
					typography: {
						fontSize: "16px",
						fontFamily: '"BC Sans", "Noto Sans", Verdana, Arial, sans-serif',
						headings: { fontFamily: '"BC Sans", "Noto Sans", Verdana, Arial, sans-serif' },
					},
					sidebar: { backgroundColor: "#f8f9fa", textColor: "#003366" },
				},
			},
			element,
		);
	} catch {
		error.value = "The API reference could not be loaded. The OpenAPI file is available at /openapi.json.";
	}
});
</script>

<template>
	<div class="redoc-viewer">
		<div ref="container" />
		<p v-if="error" class="redoc-viewer__error">{{ error }}</p>
	</div>
</template>

<style scoped>
/* Redoc draws its own light-themed layout, so it keeps a light background in dark mode. */
.redoc-viewer {
	background: #ffffff;
	color: #333333;
}

.redoc-viewer__error {
	padding: 24px;
	color: var(--vp-c-danger-1);
}
</style>
