import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import MermaidDiagram from "./MermaidDiagram.vue";
import RedocViewer from "./RedocViewer.vue";
import SuggestWalkthrough from "./SuggestWalkthrough.vue";

const theme: Theme = {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("MermaidDiagram", MermaidDiagram);
		app.component("RedocViewer", RedocViewer);
		app.component("SuggestWalkthrough", SuggestWalkthrough);
	},
};

export default theme;
