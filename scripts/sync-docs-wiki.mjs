#!/usr/bin/env node
// Copies the repo wiki (docs-md/wiki) into the documentation site (docs/wiki) before VitePress
// runs. docs-md/wiki stays the only place the wiki is edited; docs/wiki is generated and git-ignored.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wikiDir = path.join(repoRoot, "docs-md", "wiki");
const outDir = path.join(repoRoot, "docs", "wiki");
const githubBase = "https://github.com/bcgov/ai-adoption-document-intelligence";

/** Splits a page into its frontmatter text (without the --- fences) and its Markdown body. */
function splitFrontmatter(content) {
	if (!content.startsWith("---\n")) {
		return { frontmatter: "", body: content };
	}
	const end = content.indexOf("\n---", 4);
	if (end === -1) {
		return { frontmatter: "", body: content };
	}
	return { frontmatter: content.slice(4, end), body: content.slice(end + 4).replace(/^\n/, "") };
}

/** Reads a YAML list field written as `key:` followed by `  - item` lines. */
function readList(frontmatter, key) {
	const items = [];
	let inList = false;
	for (const line of frontmatter.split(/\r?\n/)) {
		if (new RegExp(`^${key}:\\s*$`).test(line)) {
			inList = true;
			continue;
		}
		const item = line.match(/^\s+-\s+(.+)$/);
		if (inList && item) {
			items.push(item[1].trim().replace(/^["']|["']$/g, ""));
		} else if (inList && !/^\s*$/.test(line)) {
			inList = false;
		}
	}
	return items;
}

/** Returns the GitHub URL for a repository-relative path, or the URL itself when already absolute. */
function githubUrl(repoPath) {
	if (/^https?:\/\//i.test(repoPath)) {
		return repoPath;
	}
	const clean = repoPath.replace(/\\/g, "/").replace(/\/$/, "");
	const absolute = path.join(repoRoot, clean);
	const route = existsSync(absolute) && statSync(absolute).isDirectory() ? "tree" : "blob";
	return `${githubBase}/${route}/main/${clean}`;
}

/** Points links that leave the wiki at GitHub, since only the wiki itself is published. */
function rewriteOutboundLinks(markdown) {
	return markdown.replace(/\]\(([^)\s]+)\)/g, (link, target) => {
		if (/^(https?:|mailto:|#)/i.test(target)) {
			return link;
		}
		const [file, hash] = target.split("#");
		const absolute = path.resolve(wikiDir, file);
		if (absolute.startsWith(`${wikiDir}${path.sep}`)) {
			return link;
		}
		const repoPath = path.relative(repoRoot, absolute);
		if (repoPath.startsWith("..") || !existsSync(absolute)) {
			return link;
		}
		return `](${githubUrl(repoPath)}${hash ? `#${hash}` : ""})`;
	});
}

/** Rewrites links outside fenced code blocks only. */
function rewriteOutsideCode(markdown) {
	return markdown
		.split(/(^```[\s\S]*?^```)/m)
		.map((part) => (part.startsWith("```") ? part : rewriteOutboundLinks(part)))
		.join("");
}

/** Renders the canonical_sources and do_not_duplicate fields as callouts under the page title. */
function sourceCallouts(frontmatter) {
	const sources = readList(frontmatter, "canonical_sources");
	const doNotDuplicate = readList(frontmatter, "do_not_duplicate");
	const blocks = [];
	if (sources.length > 0) {
		const lines = sources.map((source) => `- [\`${source}\`](${githubUrl(source)})`);
		blocks.push(`::: info Canonical sources\n${lines.join("\n")}\n:::`);
	}
	if (doNotDuplicate.length > 0) {
		blocks.push(`::: warning Do not duplicate\n${doNotDuplicate.map((item) => `- ${item}`).join("\n")}\n:::`);
	}
	return blocks.join("\n\n");
}

function syncPage(fileName) {
	const source = readFileSync(path.join(wikiDir, fileName), "utf8");
	const { frontmatter, body } = splitFrontmatter(source);
	let page = rewriteOutsideCode(body);
	const callouts = sourceCallouts(frontmatter);
	if (callouts) {
		page = /^#\s+.+$/m.test(page) ? page.replace(/^(#\s+.+)$/m, `$1\n\n${callouts}`) : `${callouts}\n\n${page}`;
	}
	const notice = `<!-- Generated from docs-md/wiki/${fileName} by scripts/sync-docs-wiki.mjs. Edit the source file. -->`;
	const header = frontmatter ? `---\n${frontmatter}\n---\n\n` : "";
	writeFileSync(path.join(outDir, fileName), `${header}${notice}\n\n${page}`);
}

if (!existsSync(wikiDir)) {
	console.error(`Wiki source not found: ${path.relative(repoRoot, wikiDir)}`);
	process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const pages = readdirSync(wikiDir).filter((name) => name.endsWith(".md") && name !== "README.md");
for (const fileName of pages) {
	syncPage(fileName);
}
console.log(`Synced ${pages.length} wiki pages into ${path.relative(repoRoot, outDir)}`);
