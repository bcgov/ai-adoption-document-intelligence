import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type DefaultTheme, defineConfig } from "vitepress";

const repoUrl = "https://github.com/bcgov/ai-adoption-document-intelligence";
const wikiSourceDir = fileURLToPath(new URL("../../docs-md/wiki/", import.meta.url));

// Reading order of the repo wiki in the sidebar. Pages not listed here follow alphabetically.
const wikiOrder = [
	"index.md",
	"system-overview.md",
	"graph-workflows.md",
	"extraction.md",
	"workflow-builder.md",
	"tables-and-extensions.md",
	"blob-storage.md",
	"hitl.md",
	"auth-and-groups.md",
	"deployment-and-ops.md",
	"billing.md",
	"sources.md",
	"open-questions.md",
	"log.md",
];

/** Returns the first level-one heading of a wiki page, or its file name. */
function wikiPageTitle(fileName: string): string {
	const content = readFileSync(`${wikiSourceDir}${fileName}`, "utf8");
	return content.match(/^#\s+(.+)$/m)?.[1].trim() ?? fileName.replace(/\.md$/, "");
}

/** Builds the Repo Wiki sidebar from docs-md/wiki, the wiki's source of truth. */
function wikiSidebar(): DefaultTheme.SidebarItem[] {
	if (!existsSync(wikiSourceDir)) {
		return [];
	}
	const files = readdirSync(wikiSourceDir).filter((name) => name.endsWith(".md") && name !== "README.md");
	const ordered = [
		...wikiOrder.filter((name) => files.includes(name)),
		...files.filter((name) => !wikiOrder.includes(name)).sort(),
	];
	return ordered.map((name) => ({
		text: wikiPageTitle(name),
		link: name === "index.md" ? "/wiki/" : `/wiki/${name.replace(/\.md$/, "")}`,
	}));
}

const guides: DefaultTheme.NavItemWithLink[] = [
	{ text: "Integrations Guide", link: "/integrations" },
	{ text: "From Zero to Integration", link: "/integration-tutorial" },
	{ text: "Benchmarking Guide", link: "/benchmarking-guide" },
];

const technical: DefaultTheme.NavItemWithLink[] = [
	{ text: "Authentication", link: "/authentication" },
	{ text: "Benchmarking Architecture", link: "/benchmarking-technical" },
];

export default defineConfig({
	title: "Document Intelligence Platform",
	description: "Documentation for the BC Government Document Intelligence Platform",
	base: "/ai-adoption-document-intelligence/",
	cleanUrls: true,
	srcExclude: ["README.md", "superpowers/**", "_diagrams/**"],
	markdown: {
		/** Renders fenced `mermaid` blocks with the MermaidDiagram component instead of as code. */
		config(md) {
			const defaultFence = md.renderer.rules.fence;
			md.renderer.rules.fence = (tokens, index, options, env, self) => {
				const token = tokens[index];
				if (token.info.trim() === "mermaid") {
					return `<MermaidDiagram code="${encodeURIComponent(token.content)}" />`;
				}
				return defaultFence ? defaultFence(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
			};
		},
	},
	themeConfig: {
		nav: [
			{ text: "Home", link: "/" },
			{ text: "Guides", items: guides },
			{ text: "Technical Documentation", items: technical },
			{ text: "API Reference", link: "/api-reference" },
			{ text: "Diagrams", link: "/diagrams" },
			{ text: "Repo Wiki", link: "/wiki/" },
		],
		sidebar: [
			{ text: "Guides", items: guides },
			{
				text: "Technical Documentation",
				items: [...technical, { text: "API Reference", link: "/api-reference" }, { text: "Diagrams", link: "/diagrams" }],
			},
			{ text: "Repo Wiki", collapsed: true, items: wikiSidebar() },
			{ text: "Contributing", items: [{ text: "Contributing to the docs", link: "/contributing" }] },
		],
		outline: { level: [2, 3] },
		search: { provider: "local" },
		socialLinks: [{ icon: "github", link: repoUrl }],
		footer: {
			message: `Enterprise document processing platform for BC Government · <a href="${repoUrl}">GitHub repository</a> · <a href="https://www2.gov.bc.ca">gov.bc.ca</a> · <a href="https://digital.gov.bc.ca">Digital Office</a>`,
			copyright: `© ${new Date().getFullYear()} Province of British Columbia`,
		},
	},
});
