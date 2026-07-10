#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const wikiDir = path.join(repoRoot, "docs-md", "wiki");
const maintenanceFiles = new Set([
	"README.md",
	"index.md",
	"sources.md",
	"log.md",
	"open-questions.md",
]);
const requiredFields = [
	"status",
	"updated",
	"canonical_sources",
	"do_not_duplicate",
];
const softLineLimit = 180;
const bannedHeadings = [
	/^#{1,6}\s+full runbook\s*$/i,
	/^#{1,6}\s+api reference\s*$/i,
	/^#{1,6}\s+database schema\s*$/i,
];
const logEntryPattern =
	/^## \[\d{4}-\d{2}-\d{2}\] (ingest|query|lint|maintenance) \| .+$/;
const legacyLogEntryPattern = /^## \d{4}-\d{2}-\d{2}$/;
const sourcePathPattern = /^[\w./-]+(\/)?$/;

const errors = [];
const warnings = [];

function addError(file, message) {
	errors.push(`${file}: ${message}`);
}

function addWarning(file, message) {
	warnings.push(`${file}: ${message}`);
}

function isExternalSource(value) {
	return /^https?:\/\//i.test(value);
}

function wikiRelativePath(fileName) {
	return path.join("docs-md", "wiki", fileName);
}

function parseFrontmatter(content) {
	if (!content.startsWith("---\n")) {
		return null;
	}

	const endIndex = content.indexOf("\n---", 4);
	if (endIndex === -1) {
		return null;
	}

	const body = content.slice(4, endIndex);
	const lines = body.split(/\r?\n/);
	const fields = {};
	let currentListKey = null;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
		if (keyMatch) {
			const [, key, value] = keyMatch;
			if (value === "") {
				fields[key] = [];
				currentListKey = key;
			} else {
				fields[key] = value.replace(/^["']|["']$/g, "");
				currentListKey = null;
			}
			continue;
		}

		const listMatch = line.match(/^\s*-\s+(.+)$/);
		if (listMatch && currentListKey) {
			fields[currentListKey].push(listMatch[1].replace(/^["']|["']$/g, ""));
		}
	}

	return fields;
}

function validateSourcePath(file, source) {
	if (isExternalSource(source)) {
		return;
	}

	const resolved = path.resolve(repoRoot, source);
	if (!resolved.startsWith(repoRoot + path.sep) && resolved !== repoRoot) {
		addError(file, `canonical source escapes repo root: ${source}`);
		return;
	}

	if (!fs.existsSync(resolved)) {
		addError(file, `canonical source does not exist: ${source}`);
	}
}

function extractMarkdownLinks(content) {
	const links = [];
	const regex = /\[([^\]]*)\]\(([^)]+)\)/g;
	let match = regex.exec(content);
	while (match) {
		links.push({ label: match[1], href: match[2] });
		match = regex.exec(content);
	}
	return links;
}

function extractBacktickPaths(content) {
	const paths = new Set();
	const regex = /`([^`]+)`/g;
	let match = regex.exec(content);
	while (match) {
		const value = match[1].trim();
		if (sourcePathPattern.test(value)) {
			paths.add(value);
		}
		match = regex.exec(content);
	}
	return [...paths];
}

function validateInternalLinks(fileName, content) {
	const relativePath = wikiRelativePath(fileName);

	for (const { href } of extractMarkdownLinks(content)) {
		if (
			isExternalSource(href) ||
			href.startsWith("#") ||
			href.startsWith("mailto:")
		) {
			continue;
		}

		if (!href.endsWith(".md")) {
			continue;
		}

		const target = path.resolve(wikiDir, href);
		if (!target.startsWith(wikiDir + path.sep)) {
			addError(relativePath, `wiki link escapes wiki directory: ${href}`);
			continue;
		}

		if (!fs.existsSync(target)) {
			addError(relativePath, `broken wiki link: ${href}`);
		}
	}
}

function validateTopicFile(fileName) {
	const relativePath = wikiRelativePath(fileName);
	const filePath = path.join(wikiDir, fileName);
	const content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
	const lines = content.split("\n");
	const frontmatter = parseFrontmatter(content);

	if (!frontmatter) {
		addError(relativePath, "missing frontmatter block");
		return;
	}

	for (const field of requiredFields) {
		if (!(field in frontmatter)) {
			addError(relativePath, `missing required frontmatter field: ${field}`);
		}
	}

	for (const field of ["canonical_sources", "do_not_duplicate"]) {
		if (!Array.isArray(frontmatter[field]) || frontmatter[field].length === 0) {
			addError(relativePath, `frontmatter field must be a non-empty list: ${field}`);
		}
	}

	if (Array.isArray(frontmatter.canonical_sources)) {
		for (const source of frontmatter.canonical_sources) {
			validateSourcePath(relativePath, source);
		}
	}

	if (lines.length > softLineLimit) {
		addWarning(relativePath, `page has ${lines.length} lines; soft limit is ${softLineLimit}`);
	}

	for (const line of lines) {
		if (bannedHeadings.some((pattern) => pattern.test(line.trim()))) {
			addError(relativePath, `banned duplicate-content heading: ${line.trim()}`);
		}
	}

	validateInternalLinks(fileName, content);
}

function validateIndexCoverage(indexContent, topicPages) {
	for (const topicPage of topicPages) {
		if (!indexContent.includes(`(${topicPage})`)) {
			addError(
				"docs-md/wiki/index.md",
				`active topic page not linked from index: ${topicPage}`,
			);
		}
	}
}

function validateInboundLinks(markdownFiles, topicPages) {
	const inboundLinks = new Map(topicPages.map((fileName) => [fileName, new Set()]));

	for (const fileName of markdownFiles) {
		const content = fs.readFileSync(path.join(wikiDir, fileName), "utf8");
		for (const { href } of extractMarkdownLinks(content)) {
			if (!href.endsWith(".md")) {
				continue;
			}

			const targetName = path.basename(href);
			if (inboundLinks.has(targetName) && fileName !== targetName) {
				inboundLinks.get(targetName).add(fileName);
			}
		}
	}

	for (const [topicPage, sources] of inboundLinks.entries()) {
		if (sources.size === 0) {
			addWarning(
				wikiRelativePath(topicPage),
				"topic page has no inbound wiki links besides index (orphan risk)",
			);
		}
	}
}

function validateSourcesFile() {
	const relativePath = "docs-md/wiki/sources.md";
	const content = fs.readFileSync(path.join(wikiDir, "sources.md"), "utf8");

	for (const source of extractBacktickPaths(content)) {
		validateSourcePath(relativePath, source);
	}

	validateInternalLinks("sources.md", content);
}

function validateLogFormat() {
	const relativePath = "docs-md/wiki/log.md";
	const content = fs.readFileSync(path.join(wikiDir, "log.md"), "utf8").replace(/\r\n/g, "\n");
	let sawEntry = false;

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("## ")) {
			continue;
		}

		if (legacyLogEntryPattern.test(trimmed)) {
			addError(
				relativePath,
				`log entry must use grep-friendly format: ## [YYYY-MM-DD] operation | Title (found: ${trimmed})`,
			);
			continue;
		}

		if (trimmed.startsWith("## [")) {
			sawEntry = true;
			if (!logEntryPattern.test(trimmed)) {
				addError(
					relativePath,
					`malformed log entry heading (expected ## [YYYY-MM-DD] ingest|query|lint|maintenance | Title): ${trimmed}`,
				);
			}
		}
	}

	if (!sawEntry) {
		addWarning(relativePath, "log has no grep-friendly entries yet");
	}
}

if (!fs.existsSync(wikiDir)) {
	console.error("docs-md/wiki does not exist");
	process.exit(1);
}

const markdownFiles = fs
	.readdirSync(wikiDir)
	.filter((fileName) => fileName.endsWith(".md"))
	.sort();

const topicPages = markdownFiles.filter((fileName) => !maintenanceFiles.has(fileName));

for (const fileName of topicPages) {
	validateTopicFile(fileName);
}

for (const fileName of maintenanceFiles) {
	if (!markdownFiles.includes(fileName)) {
		continue;
	}

	if (fileName === "sources.md") {
		validateSourcesFile();
		continue;
	}

	if (fileName === "log.md") {
		validateLogFormat();
	}

	if (fileName === "index.md") {
		const indexContent = fs.readFileSync(path.join(wikiDir, "index.md"), "utf8");
		validateIndexCoverage(indexContent, topicPages);
		validateInternalLinks("index.md", indexContent);
		continue;
	}

	if (fileName === "open-questions.md") {
		validateInternalLinks("open-questions.md", fs.readFileSync(path.join(wikiDir, "open-questions.md"), "utf8"));
	}
}

validateInboundLinks(markdownFiles, topicPages);

for (const warning of warnings) {
	console.warn(`warning: ${warning}`);
}

if (errors.length > 0) {
	for (const error of errors) {
		console.error(`error: ${error}`);
	}
	process.exit(1);
}

console.log(`Wiki validation passed for ${markdownFiles.length} Markdown files.`);
