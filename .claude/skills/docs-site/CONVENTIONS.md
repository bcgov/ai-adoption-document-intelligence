# Documentation Site Conventions

## Page Structure

Every page in `docs/_pages/` is an **HTML fragment** — no doctype, html, head, or body tags.

```html
<!-- TITLE: My Page Title -->
<!-- NAV: mypagename -->

<h1>My Page Title</h1>
<p>Introductory paragraph.</p>

<!-- Section content below -->
```

## CSS Classes Reference

### Alerts (callouts)
```html
<div class="alert alert-info">...</div>     <!-- Blue — tips, info -->
<div class="alert alert-warning">...</div>  <!-- Yellow — cautions -->
<div class="alert alert-success">...</div>  <!-- Green — confirmations -->
```

Alert inner structure:
```html
<div class="alert alert-info">
    <div class="alert-icon">
        <svg ...>...</svg>
    </div>
    <div>
        <strong>Title</strong><br>
        Body text here.
    </div>
</div>
```

### Cards
```html
<div class="card">...</div>              <!-- Default (blue left border) -->
<div class="card card-gold">...</div>    <!-- Gold left border -->
```

Custom border: `<div class="card" style="border-left-color: #22c55e;">`

### Clickable Cards
```html
<a href="page.html" class="card-link">
    <div class="card">
        <h3>Title</h3>
        <p>Description</p>
        <div class="card-arrow">Learn More →</div>
    </div>
</a>
```

### Grid Layouts
```html
<div class="grid grid-2">...</div>  <!-- 2 columns -->
<div class="grid grid-3">...</div>  <!-- 3 columns -->
<div class="grid grid-4">...</div>  <!-- 4 columns -->
```

All grids collapse to single column on mobile (≤768px).

### Feature Icons
```html
<div class="feature-icon gold">...</div>
<div class="feature-icon blue">...</div>
<div class="feature-icon green">...</div>
<div class="feature-icon purple">...</div>
```

### Badges
```html
<span class="badge badge-gold">Gold</span>
<span class="badge badge-blue">Blue</span>
```

### Hero Section
```html
<div class="hero">
    <span class="badge badge-gold">Featured</span>
    <h1>Hero Title</h1>
    <p>Subtitle text.</p>
</div>
```

### Stats
```html
<div class="card" style="text-align: center; border-left: none; border-top: 4px solid var(--bc-gold);">
    <div class="stat-number">42</div>
    <div class="stat-label">Total Items</div>
</div>
```

### Collapsible Sections
```html
<details>
    <summary style="cursor: pointer; color: var(--bc-blue-light); font-weight: 600;">
        Click to expand
    </summary>
    <div style="margin-top: 1rem;">
        Content here.
    </div>
</details>
```

### Code
- Inline: `<code>some code</code>`
- Block: `<pre>multi-line code</pre>`

### Tables
```html
<table>
    <tr><th>Header</th><th>Header</th></tr>
    <tr><td>Cell</td><td>Cell</td></tr>
</table>
```

### Images
```html
<div class="img-container">
    <img src="assets/image.svg" alt="Description">
    <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">Caption</p>
</div>
```

## Design System Colors

| Variable | Hex | Usage |
|----------|-----|-------|
| `--bc-blue` | `#003366` | Primary, nav, headings |
| `--bc-gold` | `#fcba19` | Accents, highlights |
| `--bc-blue-light` | `#1a5a96` | Links, interactive |
| `--bc-blue-dark` | `#002244` | Dark backgrounds |
| `--text-primary` | `#313132` | Body text |
| `--text-secondary` | `#606060` | Secondary text |

Additional colors used inline: `#22c55e` (green), `#8b5cf6` (purple), `#0ea5e9` (sky blue), `#ef4444` (red).

## Rules

1. **No framework tags** — pure HTML only, no JSX, no web components
2. **No external CSS/JS imports in pages** — all styles come from `_partials/header.html`
3. **Use semantic HTML** — `h1`→`h2`→`h3` hierarchy, `<table>`, `<ul>`/`<ol>`
4. **One `<h1>` per page** — matching the TITLE metadata
5. **SVG icons inline** — use Lucide-style SVGs (24x24 viewBox, stroke-based)
6. **Links between pages** — use relative paths: `href="authentication.html"`
7. **Assets** — place in `docs/assets/`, reference as `assets/filename.ext`
