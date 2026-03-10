#!/bin/bash
# Build script for documentation pages
# Combines header + page content + footer into final HTML files
# Also compiles Mermaid .mmd diagrams to SVG in assets/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARTIALS_DIR="$SCRIPT_DIR/_partials"
PAGES_DIR="$SCRIPT_DIR/_pages"
DIAGRAMS_DIR="$SCRIPT_DIR/_diagrams"
MERMAID_CONFIG="$DIAGRAMS_DIR/mermaid.config.json"
ASSETS_DIR="$SCRIPT_DIR/assets"

# Get current date/time dynamically from system
CURRENT_YEAR=$(date +%Y)
CURRENT_MONTH=$(date +%Y-%m)
CURRENT_DATE=$(date +%Y-%m-%d)

echo "Building documentation pages..."
echo "  Date: $CURRENT_DATE"

# ── Build Mermaid diagrams → SVG ────────────────────────────────────────────
if [ -d "$DIAGRAMS_DIR" ]; then
    MMD_FILES=("$DIAGRAMS_DIR"/*.mmd)
    if [ -f "${MMD_FILES[0]}" ]; then
        echo ""
        echo "Building Mermaid diagrams..."
        mkdir -p "$ASSETS_DIR"
        for mmd_file in "${MMD_FILES[@]}"; do
            diagram_name=$(basename "$mmd_file" .mmd)
            output_svg="$ASSETS_DIR/${diagram_name}.svg"
            echo "  Compiling: ${diagram_name}.mmd → assets/${diagram_name}.svg"
            npx --yes @mermaid-js/mermaid-cli -i "$mmd_file" -o "$output_svg" -c "$MERMAID_CONFIG" --quiet
        done
        echo "Diagrams built successfully."
    fi
fi
echo ""

# Process each page in _pages directory
for page in "$PAGES_DIR"/*.html; do
    if [ -f "$page" ]; then
        filename=$(basename "$page")

        # Skip files starting with underscore (templates, partials)
        if [[ "$filename" == _* ]]; then
            echo "  Skipping template: $filename"
            continue
        fi
        pagename="${filename%.html}"

        echo "  Building: $filename"

        # Extract page metadata from comments at top of file
        # Format: <!-- TITLE: Page Title -->
        # Format: <!-- NAV: index -->
        page_title=$(grep -oP '<!--\s*TITLE:\s*\K[^-]+' "$page" | tr -d ' ' || echo "Documentation")
        nav_active=$(grep -oP '<!--\s*NAV:\s*\K\w+' "$page" || echo "")

        # Read partials
        header=$(cat "$PARTIALS_DIR/header.html")
        footer=$(cat "$PARTIALS_DIR/footer.html")

        # Read page content (skip metadata comments)
        content=$(sed '/^<!--.*-->$/d' "$page")

        # Replace template variables in header
        header="${header//\{\{PAGE_TITLE\}\}/$page_title}"

        # Set active nav item first, then clear all others
        if [ -n "$nav_active" ]; then
            header="${header//\{\{NAV_${nav_active^^}\}\}/active}"
        fi
        
        header="${header//\{\{NAV_INDEX\}\}/}"
        header="${header//\{\{NAV_API\}\}/}"
        header="${header//\{\{NAV_DIAGRAMS\}\}/}"
        header="${header//\{\{NAV_INTEGRATIONS\}\}/}"
        header="${header//\{\{NAV_AUTHENTICATION\}\}/}"
        header="${header//\{\{NAV_BENCHMARKINGGUIDE\}\}/}"
        header="${header//\{\{NAV_BENCHMARKINGTECHNICAL\}\}/}"

        # Replace date variables in footer
        footer="${footer//\{\{YEAR\}\}/$CURRENT_YEAR}"

        # Replace date variables in content (for pages that need dynamic dates)
        content="${content//\{\{YEAR\}\}/$CURRENT_YEAR}"
        content="${content//\{\{CURRENT_MONTH\}\}/$CURRENT_MONTH}"
        content="${content//\{\{CURRENT_DATE\}\}/$CURRENT_DATE}"

        # Combine and write output
        echo "$header" > "$SCRIPT_DIR/$filename"
        echo "$content" >> "$SCRIPT_DIR/$filename"
        echo "$footer" >> "$SCRIPT_DIR/$filename"
    fi
done

echo "Build complete! Generated files:"
ls -la "$SCRIPT_DIR"/*.html 2>/dev/null || echo "  No HTML files generated"
