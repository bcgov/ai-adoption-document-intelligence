# Playwright MCP Setup Guide

This guide walks through setting up the Playwright Model Context Protocol (MCP) server for use with Claude Code.

## Prerequisites

Ensure that `npm install` has already been run in the project root to install base dependencies.

## Installation Steps

### 1. Install Playwright Browsers (Recommended)

Install the necessary browser binaries with debug logging enabled:

```bash
DEBUG=pw:api npx playwright install
```

This ensures Playwright can run reliably with the latest browser versions.

### 2. Install Chrome Browser

Chromium is installed by default, but you can also install Chrome:

```bash
npx playwright install chrome
```

### 3. Fix Missing System Dependencies

Run this command to automatically install all required system libraries:

```bash
npx playwright install-deps
```

This is particularly important on Linux systems where browser dependencies may not be pre-installed.

### 4. Add Playwright MCP Server to Claude Code

Run this command to register Playwright as an MCP server:

```bash
claude mcp add playwright npx @playwright/mcp@latest
```

This configures Claude Code to use the Playwright MCP server for browser automation tasks.

## Verification

### Verify MCP Server Registration

After adding the server, verify it's properly configured by running:

```bash
claude
```

Then in the Claude Code interface, run:

```bash
/mcp
```

You should see the Playwright MCP server listed among your available MCP servers.

### Test Basic Functionality

Test the integration by asking Claude to perform a simple browser task:

```
Navigate to google.com and take a screenshot
```

If everything is set up correctly, Claude will use the Playwright MCP server to open a browser, navigate to the URL, and capture a screenshot.

## Troubleshooting

- **Missing system dependencies**: If you encounter errors about missing libraries, re-run `npx playwright install-deps`
- **Browser binary not found**: Re-run `npx playwright install` to ensure all browser binaries are properly installed
- **MCP server not found**: Verify the server was added correctly by checking your Claude Code MCP configuration

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright MCP Server](https://github.com/microsoft/playwright-mcp)
- [Claude Code MCP Documentation](https://docs.claude.com/mcp)
