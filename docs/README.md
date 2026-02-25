# Documentation System

This folder contains the documentation site for the Document Intelligence Platform, built with a **zero-dependency template engine** using Bash.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Directory Structure](#directory-structure)
- [How the Template Engine Works](#how-the-template-engine-works)
- [Adding New Pages](#adding-new-pages)
- [The Build Process](#the-build-process)
- [SVG Viewer Explained](#svg-viewer-explained)
- [OpenAPI Spec Generator](#openapi-spec-generator)
- [GitHub Actions Deployment](#github-actions-deployment)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Documentation Build                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   _partials/              _pages/                Output              │
│  ┌──────────┐           ┌──────────┐           ┌──────────┐        │
│  │header.html│    +     │index.html│     =     │index.html│        │
│  │          │           │(content) │           │(complete)│        │
│  │ - CSS    │           │          │           │          │        │
│  │ - Nav    │           │          │           │          │        │
│  │ - Header │           │          │           │          │        │
│  └──────────┘           └──────────┘           └──────────┘        │
│       +                                                             │
│  ┌──────────┐                                                       │
│  │footer.html│                                                       │
│  │          │    build.sh runs:                                     │
│  │ - Footer │    1. Read partials                                   │
│  │ - Scripts│    2. Extract page metadata                           │
│  │          │    3. Replace {{variables}}                           │
│  └──────────┘    4. Concatenate: header + content + footer          │
│                  5. Write to output                                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Bash Instead of Jekyll/Hugo/etc?

1. **Zero Dependencies** - No Ruby, Node.js, or Go required
2. **Runs Everywhere** - Works on any system with Bash (Linux, Mac, WSL, GitHub Actions)
3. **Easy to Understand** - ~60 lines of readable shell script
4. **Fast** - Builds in milliseconds
5. **GitHub Pages Compatible** - No build plugins needed

---

## Directory Structure

```
docs/
├── _partials/                 # Reusable template parts (not published)
│   ├── header.html            # <!DOCTYPE>, <head>, CSS, navigation
│   └── footer.html            # Footer, closing tags
│
├── _pages/                    # Source content files (not published)
│   ├── _template.html         # Template for new pages
│   ├── index.html             # Homepage content
│   ├── api-reference.html     # API reference (Redoc)
│   ├── authentication.html    # Authentication guide
│   ├── diagrams.html          # Interactive SVG viewer
│   └── integrations.html      # Integrations guide
│
├── _diagrams/                 # Mermaid diagram sources
│   ├── mermaid.config.json
│   ├── system-overview.mmd
│   ├── document-ingestion.mmd
│   ├── deployment.mmd
│   └── authentication-flow.mmd
│
├── assets/                    # Static assets (published)
│   ├── bc_citz_logo.jpg       # BC Government logo
│   ├── favicon.svg            # Browser favicon
│   ├── openapi.json           # Generated OpenAPI spec
│   ├── system-overview.svg    # Built Mermaid diagrams
│   ├── document-ingestion.svg
│   ├── deployment.svg
│   └── authentication-flow.svg
│
├── build.sh                   # Template engine script
├── generate-openapi.ts        # OpenAPI spec generator
├── README.md                  # This file
│
└── [generated HTML files]     # Output (published to GitHub Pages)
    ├── index.html
    ├── api-reference.html
    ├── authentication.html
    ├── diagrams.html
    └── integrations.html
```

---

## How the Template Engine Works

### Step 1: Page Metadata

Each page in `_pages/` starts with HTML comment metadata:

```html
<!-- TITLE: My Page Title -->
<!-- NAV: pagename -->

<h1>Page Content Starts Here</h1>
...
```

| Metadata | Purpose |
|----------|---------|
| `TITLE`  | Sets `<title>` tag and browser tab text |
| `NAV`    | Marks which nav item should be "active" |

### Step 2: Template Variables

The header partial contains placeholder variables:

```html
<title>{{PAGE_TITLE}} | BC Gov Document Intelligence</title>
...
<a href="index.html" class="{{NAV_INDEX}}">Home</a>
<a href="api-reference.html" class="{{NAV_API}}">API Reference</a>
```

### Step 3: Variable Replacement

The build script replaces these variables:

```bash
# Replace page title
header="${header//\{\{PAGE_TITLE\}\}/$page_title}"

# Set active nav item (e.g., if NAV: api)
header="${header//\{\{NAV_API\}\}/active}"
```

### Step 4: Concatenation

The final page is assembled:

```bash
echo "$header" > "$OUTPUT"      # Write header
echo "$content" >> "$OUTPUT"    # Append page content
echo "$footer" >> "$OUTPUT"     # Append footer
```

### The Build Script Explained

```bash
#!/bin/bash
# build.sh - Zero-dependency static site generator

# Get current year for footer copyright
CURRENT_YEAR=$(date +%Y)

# Process each page in _pages/
for page in "$PAGES_DIR"/*.html; do
    filename=$(basename "$page")

    # Extract metadata from HTML comments
    # grep -oP uses Perl regex to capture the value after "TITLE: "
    page_title=$(grep -oP '<!--\s*TITLE:\s*\K[^-]+' "$page")
    nav_active=$(grep -oP '<!--\s*NAV:\s*\K\w+' "$page")

    # Read template parts
    header=$(cat "$PARTIALS_DIR/header.html")
    footer=$(cat "$PARTIALS_DIR/footer.html")

    # Remove metadata comments from content
    content=$(sed '/^<!--.*-->$/d' "$page")

    # Replace variables using Bash parameter expansion
    # ${var//pattern/replacement} replaces ALL occurrences
    header="${header//\{\{PAGE_TITLE\}\}/$page_title}"
    header="${header//\{\{NAV_${nav_active^^}\}\}/active}"
    footer="${footer//\{\{YEAR\}\}/$CURRENT_YEAR}"

    # Write assembled page
    echo "$header" > "$filename"
    echo "$content" >> "$filename"
    echo "$footer" >> "$filename"
done
```

---

## Adding New Pages

### 1. Create the Page File

Create `_pages/my-new-page.html`:

```html
<!-- TITLE: My New Page -->
<!-- NAV: mynewpage -->

<h1>My New Page</h1>

<p>Your content here. You can use any HTML.</p>

<div class="card">
    <h3>Using Built-in CSS Classes</h3>
    <p>The header includes all CSS styles, so you can use classes like:</p>
    <ul>
        <li><code>.card</code> - Styled content boxes</li>
        <li><code>.alert .alert-info</code> - Info callouts</li>
        <li><code>.grid .grid-2</code> - Two-column layouts</li>
        <li><code>pre</code> - Code blocks</li>
    </ul>
</div>
```

### 2. Add Navigation Link

Edit `_partials/header.html` to add the nav link:

```html
<nav class="bc-nav">
    <a href="index.html" class="{{NAV_INDEX}}">Home</a>
    ...
    <a href="my-new-page.html" class="{{NAV_MYNEWPAGE}}">My New Page</a>
</nav>
```

### 3. Update Build Script

Add the new variable to `build.sh`:

```bash
# Set active nav item
header="${header//\{\{NAV_INDEX\}\}/}"
header="${header//\{\{NAV_API\}\}/}"
...
header="${header//\{\{NAV_MYNEWPAGE\}\}/}"  # Add this line
```

### 4. Build and Test

```bash
./build.sh
# Open index.html in browser to test
```

---

## The Build Process

### Local Development

```bash
cd docs

# Build all pages
./build.sh

# Open in browser
open index.html  # Mac
xdg-open index.html  # Linux
```

### GitHub Actions

The workflow (`.github/workflows/pages.yml`) runs automatically on push:

```yaml
- name: Build documentation
  run: |
    cd docs
    chmod +x build.sh
    ./build.sh
```

---

## SVG Viewer Explained

The diagrams page includes an interactive SVG viewer written in **pure ES6 JavaScript** (no libraries). Here's how each part works:

### State Variables

```javascript
// Current zoom level as a percentage (100 = actual size)
let currentZoom = 100;

// Zoom boundaries
const minZoom = 25;   // 25% - can't zoom out past this
const maxZoom = 400;  // 400% - can't zoom in past this
const zoomStep = 25;  // Each click zooms by 25%
```

### Diagram Loading

```javascript
// Object mapping diagram IDs to their data
const diagrams = {
    'oidc-complete': {
        title: 'OIDC Complete Guide',
        src: 'assets/azure-oidc-complete-guide.svg'
    },
    // ... more diagrams
};

function loadDiagram(id, element) {
    // 1. Get diagram data from our object
    const diagram = diagrams[id];

    // 2. Update the gallery cards - remove 'active' from all
    document.querySelectorAll('.diagram-card')
        .forEach(card => card.classList.remove('active'));

    // 3. Add 'active' to the clicked card
    element.classList.add('active');

    // 4. Update the viewer with new diagram
    document.getElementById('currentDiagram').src = diagram.src;
    document.getElementById('currentDiagramTitle').textContent = diagram.title;

    // 5. Reset zoom to 100% for new diagram
    resetZoom();
}
```

### Zoom Controls

```javascript
function updateZoom() {
    // CSS transform: scale(1.5) makes element 150% size
    // We divide by 100 to convert percentage to decimal
    const wrapper = document.getElementById('svgWrapper');
    wrapper.style.transform = `scale(${currentZoom / 100})`;

    // Update the display text
    document.getElementById('zoomLevel').textContent = currentZoom + '%';
}

function zoomIn() {
    // Only zoom in if we're below maximum
    if (currentZoom < maxZoom) {
        // Math.min ensures we never exceed maxZoom
        currentZoom = Math.min(currentZoom + zoomStep, maxZoom);
        updateZoom();
    }
}

function zoomOut() {
    // Only zoom out if we're above minimum
    if (currentZoom > minZoom) {
        // Math.max ensures we never go below minZoom
        currentZoom = Math.max(currentZoom - zoomStep, minZoom);
        updateZoom();
    }
}

function resetZoom() {
    currentZoom = 100;  // Back to actual size
    updateZoom();
    // Also scroll container back to top-left
    document.getElementById('diagramContainer').scrollTo(0, 0);
}
```

### Fit to Width

```javascript
function fitToWidth() {
    const container = document.getElementById('diagramContainer');
    const img = document.getElementById('currentDiagram');

    // Calculate what zoom level would make the image fit the container width
    // container.clientWidth = visible width of container
    // img.naturalWidth = actual width of the image
    const containerWidth = container.clientWidth - 40; // minus padding
    const imgWidth = img.naturalWidth || 1600;

    // Formula: zoom = (containerWidth / imgWidth) * 100
    // Example: 800px container / 1600px image = 0.5 * 100 = 50%
    currentZoom = Math.round((containerWidth / imgWidth) * 100);

    // Clamp to our min/max bounds
    currentZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom));

    updateZoom();
}
```

### Fullscreen Mode

```javascript
function toggleFullscreen() {
    const viewer = document.getElementById('diagramViewer');
    const btn = document.getElementById('fullscreenBtn');

    // Check if already fullscreen
    if (viewer.classList.contains('fullscreen')) {
        // Exit fullscreen
        viewer.classList.remove('fullscreen');
        btn.innerHTML = '⛶ Fullscreen';
        document.body.style.overflow = '';  // Re-enable page scrolling
    } else {
        // Enter fullscreen
        viewer.classList.add('fullscreen');
        btn.innerHTML = '✕ Exit';
        document.body.style.overflow = 'hidden';  // Disable page scrolling
    }
}

// The CSS does the heavy lifting:
// .diagram-viewer.fullscreen {
//     position: fixed;     /* Cover entire viewport */
//     top: 0; left: 0;
//     right: 0; bottom: 0;
//     z-index: 9999;       /* Appear above everything */
// }
```

### Keyboard Shortcuts

```javascript
document.addEventListener('keydown', function(e) {
    // Don't trigger if user is typing in a form field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // switch statement checks which key was pressed
    switch(e.key) {
        case '+':
        case '=':  // = key is + without shift
            e.preventDefault();  // Stop default browser behavior
            zoomIn();
            break;
        case '-':
            e.preventDefault();
            zoomOut();
            break;
        case '0':
            e.preventDefault();
            resetZoom();
            break;
        case 'w':
        case 'W':
            e.preventDefault();
            fitToWidth();
            break;
        case 'f':
        case 'F':
            e.preventDefault();
            toggleFullscreen();
            break;
        case 'Escape':
            // Only exit fullscreen if we're in fullscreen
            if (document.getElementById('diagramViewer').classList.contains('fullscreen')) {
                toggleFullscreen();
            }
            break;
    }
});
```

### Mouse Wheel Zoom

```javascript
// Listen for wheel events on the diagram container
document.getElementById('diagramContainer').addEventListener('wheel', function(e) {
    // Only zoom if Ctrl key is held (like Google Maps)
    if (e.ctrlKey) {
        e.preventDefault();  // Stop page from scrolling

        // deltaY is negative when scrolling up (zoom in)
        // deltaY is positive when scrolling down (zoom out)
        if (e.deltaY < 0) {
            zoomIn();
        } else {
            zoomOut();
        }
    }
});
```

### CSS Transform Origin

```css
.diagram-svg-wrapper {
    /* This is crucial! transform-origin determines the point
       from which scaling happens. 'top left' means the SVG
       stays anchored at its top-left corner when zooming */
    transform-origin: top left;

    /* Smooth animation when zoom changes */
    transition: transform 0.3s ease;
}
```

---

## OpenAPI Spec Generator

The `generate-openapi.ts` script bootstraps the NestJS backend application and exports a fully-resolved OpenAPI (Swagger) JSON file to `docs/assets/openapi.json`. This file is consumed by the `api-reference.html` page to render the interactive API documentation.

### How It Works

1. **Bootstraps** the NestJS `AppModule` with dummy environment variables so no real services are required
2. **Builds** the OpenAPI document using `@nestjs/swagger`'s `DocumentBuilder`
3. **Writes** the resulting JSON to `docs/assets/openapi.json`
4. **Shuts down** the application immediately after generation

### Usage

Run from the repository root:

```bash
npm run generate:openapi
```

The script sets all required environment variables automatically (using safe dummy values), so no `.env` file is needed for generation.

To override any environment variable (e.g. to point at a real server):

```bash
DATABASE_URL=postgresql://real:real@host:5432/db npm run generate:openapi
```

### Output

The generated file is written to:

```
docs/assets/openapi.json
```

After running the script, rebuild the docs site to pick up any changes:

```bash
cd docs
./build.sh
```

### When to Regenerate

Regenerate the spec whenever backend API endpoints, request/response shapes, or Swagger decorators change:

```bash
# From the repo root
npm run generate:openapi
cd docs && ./build.sh
```

---

## GitHub Actions Deployment

The documentation deploys automatically via GitHub Actions:

```yaml
# .github/workflows/pages.yml

name: Deploy GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - '.github/workflows/pages.yml'
  workflow_dispatch:  # Manual trigger

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build documentation
        run: |
          cd docs
          chmod +x build.sh
          ./build.sh

      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
    steps:
      - uses: actions/deploy-pages@v4
```

### Enable GitHub Pages

1. Go to repository **Settings** > **Pages**
2. Under "Build and deployment", select **GitHub Actions**
3. Push to main to trigger deployment

---

## Available CSS Classes

The `header.html` includes a complete CSS framework. Here are the main classes:

### Layout

| Class | Description |
|-------|-------------|
| `.grid` | Enables CSS grid |
| `.grid-2` | Two-column grid |
| `.grid-3` | Three-column grid |
| `.grid-4` | Four-column grid |

### Components

| Class | Description |
|-------|-------------|
| `.card` | Styled content box with border |
| `.card-gold` | Card with gold border |
| `.alert .alert-info` | Blue info callout |
| `.alert .alert-warning` | Yellow warning callout |
| `.alert .alert-success` | Green success callout |
| `.badge .badge-gold` | Gold pill badge |
| `.badge .badge-blue` | Blue pill badge |

### Typography

| Element/Class | Description |
|---------------|-------------|
| `h1` | Page title with gold underline |
| `h2` | Section heading with gold accent bar |
| `h3` | Subsection heading |
| `code` | Inline code |
| `pre` | Code block |
| `table` | Styled table |

### Interactive

| Class | Description |
|-------|-------------|
| `.card-link` | Wraps card to make it clickable |
| `.card-arrow` | "View →" text that animates on hover |
| `.feature-icon` | Colored icon container |
| `.hero` | Full-width gradient banner |

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes in `_pages/` or `_partials/`
4. Run `./build.sh` to test locally
5. Submit a pull request

---

## License

This documentation system is part of the Document Intelligence Platform project, licensed under Apache 2.0.
