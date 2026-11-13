import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import MermaidDiagram from "./MermaidDiagram.vue";
import RedocViewer from "./RedocViewer.vue";

const theme: Theme = {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("MermaidDiagram", MermaidDiagram);
		app.component("RedocViewer", RedocViewer);
	},
};

export default theme;
