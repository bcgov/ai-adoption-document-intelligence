<script setup lang="ts">
import { useData } from "vitepress";
import { onMounted, ref, watch } from "vue";

// The Markdown renderer passes the diagram source URI-encoded, so any character survives the attribute.
const props = defineProps<{ code: string }>();

const { isDark } = useData();
const container = ref<HTMLElement | null>(null);
const svgMarkup = ref("");
const error = ref("");
const instanceId = Math.random().toString(36).slice(2, 10);
let renderCount = 0;

/** Draws the diagram in the browser, fitted to the column, in the reader's colour scheme. */
async function renderDiagram(): Promise<void> {
	const element = container.value;
	if (!element) {
		return;
	}
	const { default: mermaid } = await import("mermaid");
	mermaid.initialize({
		startOnLoad: false,
		securityLevel: "strict",
		theme: isDark.value ? "dark" : "default",
	});
	renderCount += 1;
	try {
		const { svg } = await mermaid.render(`mermaid-${instanceId}-${renderCount}`, decodeURIComponent(props.code));
		element.innerHTML = svg;
		svgMarkup.value = svg;
		error.value = "";
	} catch (cause) {
		svgMarkup.value = "";
		error.value = cause instanceof Error ? cause.message : "The diagram could not be drawn.";
	}
}

/** Opens the diagram in a new tab at its natural size, where the browser's zoom and scrolling apply. */
function openFullSize(): void {
	const naturalWidth = svgMarkup.value.match(/max-width:\s*([\d.]+)px/)?.[1];
	const markup = naturalWidth ? svgMarkup.value.replace('width="100%"', `width="${naturalWidth}"`) : svgMarkup.value;
	const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
	window.open(url, "_blank", "noopener");
	window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

onMounted(renderDiagram);
watch(isDark, renderDiagram);
</script>

<template>
	<div class="mermaid-diagram">
		<div v-show="!error" ref="container" class="mermaid-diagram__svg" />
		<button v-if="svgMarkup" type="button" class="mermaid-diagram__open" @click="openFullSize">Open full size ↗</button>
		<p v-if="error" class="mermaid-diagram__error">{{ error }}</p>
	</div>
</template>

<style scoped>
.mermaid-diagram {
	margin: 16px 0;
}

.mermaid-diagram__svg {
	text-align: center;
}

.mermaid-diagram__open {
	display: block;
	margin: 8px 0 0 auto;
	padding: 0;
	border: 0;
	background: none;
	color: var(--vp-c-brand-1);
	font-size: 14px;
	cursor: pointer;
}

.mermaid-diagram__open:hover {
	text-decoration: underline;
}

.mermaid-diagram__error {
	color: var(--vp-c-danger-1);
}
</style>
