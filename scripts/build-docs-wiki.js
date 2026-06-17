#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const docsDir = path.join(repoRoot, "docs");
const wikiDir = path.join(repoRoot, "docs-md", "wiki");
const partialsDir = path.join(docsDir, "_partials");
const githubBase = "https://github.com/bcgov/ai-adoption-document-intelligence";
const currentYear = new Date().getFullYear().toString();

const pageOrder = [
	"index.md",
	"system-overview.md",
	"graph-workflows.md",
	"hitl.md",
	"auth-and-groups.md",
	"deployment-and-ops.md",
	"sources.md",
	"open-questions.md",
	"log.md",
];

function htmlFileForMarkdown(fileName) {
	if (fileName === "index.md") {
		return "wiki.html";
	}
	return `wiki-${path.basename(fileName, ".md").toLowerCase()}.html`;
}

function escapeHtml(value) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function titleFromFile(fileName, content) {
	const match = content.match(/^#\s+(.+)$/m);
	if (match) {
		return match[1].trim();
	}

	return path
		.basename(fileName, ".md")
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function splitFrontmatter(content) {
	if (!content.startsWith("---\n")) {
		return { frontmatter: null, markdown: content };
	}

	const end = content.indexOf("\n---", 4);
	if (end === -1) {
		return { frontmatter: null, markdown: content };
	}

	const frontmatterText = content.slice(4, end);
	const markdown = content.slice(end + 4).replace(/^\n/, "");
	const frontmatter = {};
	let currentKey = null;

	for (const rawLine of frontmatterText.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (keyMatch) {
			const [, key, value] = keyMatch;
			if (value === "") {
				frontmatter[key] = [];
				currentKey = key;
			} else {
				frontmatter[key] = value.replace(/^["']|["']$/g, "");
				currentKey = null;
			}
			continue;
		}

		const listMatch = line.match(/^\s*-\s+(.+)$/);
		if (listMatch && currentKey) {
			frontmatter[currentKey].push(listMatch[1].replace(/^["']|["']$/g, ""));
		}
	}

	return { frontmatter, markdown };
}

function repoUrlForSource(source) {
	if (/^https?:\/\//i.test(source)) {
		return source;
	}

	const resolved = path.resolve(repoRoot, source);
	const isDirectory = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
	const route = isDirectory ? "tree" : "blob";
	return `${githubBase}/${route}/main/${source.replace(/\\/g, "/")}`;
}

function inlineMarkdown(value) {
	let html = escapeHtml(value);
	const codeParts = [];
	html = html.replace(/`([^`]+)`/g, (_match, code) => {
		codeParts.push(`<code>${code}</code>`);
		return `\u0000CODE${codeParts.length - 1}\u0000`;
	});

	html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
		let target = href;
		if (href.endsWith(".md")) {
			target = htmlFileForMarkdown(path.basename(href));
		}
		return `<a href="${escapeHtml(target)}">${label}</a>`;
	});

	return html.replace(/\u0000CODE(\d+)\u0000/g, (_match, index) => codeParts[Number(index)]);
}

function renderFrontmatter(frontmatter) {
	if (!frontmatter) {
		return "";
	}

	const canonicalSources = Array.isArray(frontmatter.canonical_sources)
		? frontmatter.canonical_sources
		: [];
	const doNotDuplicate = Array.isArray(frontmatter.do_not_duplicate)
		? frontmatter.do_not_duplicate
		: [];

	if (canonicalSources.length === 0 && doNotDuplicate.length === 0) {
		return "";
	}

	const sourceItems = canonicalSources
		.map((source) => {
			const href = repoUrlForSource(source);
			return `<li><a href="${escapeHtml(href)}"><code>${escapeHtml(source)}</code></a></li>`;
		})
		.join("\n");
	const duplicateItems = doNotDuplicate
		.map((item) => `<li>${inlineMarkdown(item)}</li>`)
		.join("\n");

	return `
<div class="grid grid-2" style="margin: 1.5rem 0;">
    <div class="card">
        <h3 style="margin-top: 0;">Canonical Sources</h3>
        <ul>${sourceItems}</ul>
    </div>
    <div class="card card-gold">
        <h3 style="margin-top: 0;">Do Not Duplicate</h3>
        <ul>${duplicateItems}</ul>
    </div>
</div>`;
}

function renderMarkdown(markdown) {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const html = [];
	let listType = null;
	let paragraph = [];
	let inCodeBlock = false;
	let codeLines = [];

	function flushParagraph() {
		if (paragraph.length > 0) {
			html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
			paragraph = [];
		}
	}

	function closeList() {
		if (listType) {
			html.push(`</${listType}>`);
			listType = null;
		}
	}

	for (const line of lines) {
		if (line.trim().startsWith("```")) {
			if (inCodeBlock) {
				html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
				codeLines = [];
				inCodeBlock = false;
			} else {
				flushParagraph();
				closeList();
				inCodeBlock = true;
			}
			continue;
		}

		if (inCodeBlock) {
			codeLines.push(line);
			continue;
		}

		if (line.trim() === "") {
			flushParagraph();
			closeList();
			continue;
		}

		const heading = line.match(/^(#{1,4})\s+(.+)$/);
		if (heading) {
			flushParagraph();
			closeList();
			const level = heading[1].length;
			html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
			continue;
		}

		const unordered = line.match(/^\s*-\s+(.+)$/);
		if (unordered) {
			flushParagraph();
			if (listType !== "ul") {
				closeList();
				html.push("<ul>");
				listType = "ul";
			}
			html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
			continue;
		}

		const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
		if (ordered) {
			flushParagraph();
			if (listType !== "ol") {
				closeList();
				html.push("<ol>");
				listType = "ol";
			}
			html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
			continue;
		}

		paragraph.push(line.trim());
	}

	flushParagraph();
	closeList();
	return html.join("\n");
}

function renderWikiNav(pages, currentFile) {
	const links = pages
		.map(({ fileName, title }) => {
			const activeStyle = fileName === currentFile ? ' style="font-weight: 700;"' : "";
			return `<li><a href="${htmlFileForMarkdown(fileName)}"${activeStyle}>${escapeHtml(title)}</a></li>`;
		})
		.join("\n");

	return `
<div class="card card-gold">
    <h3 style="margin-top: 0;">Repo Wiki</h3>
    <p>This wiki routes readers to canonical docs and code. Use it as a map, not a replacement for implementation docs.</p>
    <ul>${links}</ul>
</div>`;
}

function wrapPage(title, navHtml, bodyHtml) {
	let header = fs.readFileSync(path.join(partialsDir, "header.html"), "utf8");
	let footer = fs.readFileSync(path.join(partialsDir, "footer.html"), "utf8");

	header = header.replace(/\{\{PAGE_TITLE\}\}/g, title);
	header = header.replace(/\{\{NAV_WIKI\}\}/g, "active");
	header = header.replace(/\{\{NAV_[A-Z0-9_]+\}\}/g, "");
	footer = footer.replace(/\{\{YEAR\}\}/g, currentYear);

	return `${header}
${navHtml}
${bodyHtml}
${footer}`;
}

function main() {
	if (!fs.existsSync(wikiDir)) {
		console.log("Skipping wiki pages: docs-md/wiki does not exist.");
		return;
	}

	const pages = pageOrder
		.filter((fileName) => fs.existsSync(path.join(wikiDir, fileName)))
		.map((fileName) => {
			const content = fs.readFileSync(path.join(wikiDir, fileName), "utf8");
			const { markdown } = splitFrontmatter(content);
			return { fileName, title: titleFromFile(fileName, markdown), content };
		});

	for (const page of pages) {
		const { frontmatter, markdown } = splitFrontmatter(page.content);
		const navHtml = renderWikiNav(pages, page.fileName);
		const bodyHtml = `${renderFrontmatter(frontmatter)}
${renderMarkdown(markdown)}`;
		const html = wrapPage(page.title, navHtml, bodyHtml);
		const outputPath = path.join(docsDir, htmlFileForMarkdown(page.fileName));
		fs.writeFileSync(outputPath, html);
		console.log(`  Building wiki page: ${path.basename(outputPath)}`);
	}
}

main();
