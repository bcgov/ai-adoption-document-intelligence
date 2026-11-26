# AI-Assisted BC Design System Implementation in SDPR

## A Case Study on Approach, Maintenance, and Lessons Learned

**Audience:** Designers, Developers, Product Teams, Leadership  
**Technical Reference:** [AI_BCDS_IMPLEMENTATION_GUIDE.md](./AI_BCDS_IMPLEMENTATION_GUIDE.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Context](#2-context)
3. [How AI Was Used](#3-how-ai-was-used)
4. [What Was Delivered](#4-what-was-delivered)
5. [How We Maintain It Today](#5-how-we-maintain-it-today)
6. [What We Learned](#6-what-we-learned)
7. [How Manual Steps Could Be Simplified](#7-how-manual-steps-could-be-simplified)
8. [How Other Teams Could Build on This](#8-how-other-teams-could-build-on-this)
9. [Recommendations for BC Gov](#9-recommendations-for-bc-gov)

---

## 1. Executive Summary

The SDPR AI Document Intelligence application was originally built using a third-party component library and was not fully aligned with the BC Design System (BCDS).

The team set out to align the application with BC Government design standards, including BC Sans typography, government branding, BCDS components, and WCAG 2.1 AA accessibility patterns. AI was central to this effort from the start, used across planning, design interpretation, implementation, and validation.

Beyond delivering a BCDS-aligned product, the team developed practical patterns for combining AI, Figma, and design system guidance to accelerate implementation while maintaining quality and accessibility.

This document captures what was done, how it is maintained, what was learned, and how those lessons may help other BC Government teams undertaking similar work.

---

## 2. Context

The SDPR AI Document Intelligence application is a functional pilot application, but not deployed at full production scale. At the time alignment work began, it comprised approximately 30 screens built on a third-party component toolkit that did not align with BCDS.

The application's existing component toolkit was woven deeply into every screen: buttons, forms, tables, modals, and navigation. Replacing it without a clear plan risked breaking things across the entire product simultaneously.

Rather than updating everything at once, the team adopted an incremental approach, replacing components screen by screen using a shared component layer.

---

## 3. How AI Was Used

AI was built into the implementation from the start, not added as an afterthought. It supported planning (structuring work, writing user stories, identifying dependencies), design interpretation (reading Figma directly so design intent was not lost in translation), implementation (applying established patterns at scale across dozens of screens), and validation (surfacing accessibility gaps and inconsistencies). The team found AI most effective when given clear acceptance criteria, existing examples, and direct design references. Human review was essential throughout. AI accelerated the work but did not replace design judgement or accessibility expertise.

For design work specifically, a Figma integration (the Figma MCP server) let the AI read the design file's layout, spacing, and colour tokens directly and translate them into code, rather than a developer visually interpreting the design and guessing at values. This meant the numbers used in the build came from the design itself. A design-system assistant configured for the team automatically enforced BC Design System tokens (colours, spacing, corner radius, and typography) whenever AI worked from a Figma file, so design intent was preserved by default. The team also built one screen first as a reference implementation, using it as the source of truth for component choices and layout before applying the same pattern across the remaining screens.

---

## 4. What Was Delivered

### Scope

| What was done | Result |
|--------------|--------|
| Screens updated to BC Design System | ~30 of 31 |
| Types of UI components updated | 20+ (buttons, forms, modals, menus, tables, and more) |
| Screens with known remaining gaps | 1 (added after the main implementation; tagged for follow-up) |
| Accessibility standard | WCAG 2.1 AA |
| Disruptions to the application | None |

### BCDS Alignment

The application now incorporates BC Design System standards throughout: BC Sans typography, BC Government colour palette, standard header and footer, accessible keyboard navigation, screen reader labels on every interactive element, and consistent component behaviour aligned with BCDS patterns.

### BCDS Compliance Made Structural

A critical design decision was to encode BCDS implementation choices once, in a shared component layer (`apps/frontend/src/ui/`), rather than relying on each developer to re-derive them independently for every screen.

This is different from simply having shared components for code hygiene reasons. The layer *is* the compliance mechanism: it maps product UI needs to the correct BCDS component, handles cases where BCDS coverage does not yet exist, and ensures accessibility requirements are met by default. Any new feature built using this layer is automatically BCDS-compliant without the developer needing to consult the design system documentation at every step.

### Reusable Implementation Patterns

The process produced documented patterns for: how to classify each component against BCDS, how to handle coverage gaps, and how to connect Figma designs to code via AI. These patterns reduced decision overhead as the implementation progressed and now guide all new feature development.

### Remaining Gaps

Two items remain open: one screen added after the main implementation has not yet been migrated to the shared component layer, and Figma Code Connect, which would surface accurate code examples inside Figma's Dev Mode, was planned but not completed.

---

## 5. How We Maintain It Today

BCDS alignment is maintained primarily through the shared component layer. Because components encode BCDS decisions by default, new screens are compliant without requiring additional design system review on every pull request.

The preferred workflow for new features:

1. Designer works in Figma using BCDS components from the official library
2. AI reads the Figma design directly and implements using the shared component layer
3. Developer and designer review for quality, accessibility, and BCDS alignment
4. Release

**For designers:** For the Figma-to-AI connection to work accurately, designs must use official BCDS components from the Figma library rather than custom elements. When custom elements are used, the AI cannot read design intent accurately. Applying BCDS spacing and colour tokens (rather than hardcoded values) is equally important. The AI reads these directly from Figma and uses them in code.

As BCDS evolves and new components are published, the shared layer can be updated in one place rather than screen by screen.

---

## 6. What We Learned

### What Worked Well

**AI was highly effective for repetitive, pattern-based work.** Once patterns were established for the first few components, AI applied them reliably across the remaining screens. What might have taken months was completed in weeks.

**BCDS compliance became structural, not behavioural.** Rather than each developer independently making BCDS decisions, the team made them once in the shared component layer. This eliminated a category of inconsistency that would otherwise accumulate over time.

**Clear requirements significantly improved AI output.** AI produced the best results when the team had already defined acceptance criteria, had a Figma reference, and had existing examples to point to. Vague instructions produced results requiring more correction.

**Planning with AI before coding saved time.** Using AI to structure work upfront (sequencing dependencies, drafting acceptance criteria) meant less scope creep and less rework during implementation.

**The Figma-to-code connection removed a chronic source of rework.** By having AI read Figma directly, the team eliminated most of the interpretation error that typically accumulates between design and delivery.

### What Was Harder Than Expected

**BCDS coverage gaps required more workarounds than anticipated.** Not every UI pattern had a direct BCDS equivalent. Each gap required a deliberate decision: build a custom component using BCDS tokens, or accept a temporary workaround until BCDS coverage improves.

**Keeping Figma and code in sync requires ongoing discipline.** The Figma-to-AI connection works well when Figma is kept current. When developers make changes without updating Figma (or vice versa), the connection breaks down. Treating Figma updates as part of the definition of done for any visual change is necessary to maintain this.

**AI-generated output still needed correction.** AI was reliable at reproducing an established pattern, but less reliable on BCDS-specific details: because BCDS is relatively new and less well-represented in AI training data, generated implementations occasionally referenced component properties that do not exist. The pattern was consistent; the API details were not, so every change required verification against BCDS documentation before shipping.

**AI is only as good as the design it reads.** The Figma-to-code workflow depends on designers using official BCDS components and design tokens in Figma. When designs used custom elements or hardcoded values instead, the AI could not read design intent accurately and output quality dropped. Design-file hygiene became a direct input to implementation quality, not just a design-team nicety.

### What We Would Do Differently

- Set up automated compliance checks from day one. Two files (an un-migrated screen and an error page) slipped through without using the shared component layer because no automated check existed to catch it
- Complete Figma Code Connect earlier to close the design-to-code loop
- Formalize accessibility validation per screen at every delivery milestone, not only during final review

---

## 7. How Manual Steps Could Be Simplified

As the implementation matured, several tasks recurred on every screen or pull request that a person had to do by hand. Each is a candidate for automation: a script or an automated check doing the work instead of a person.

| Manual step today | How it could be simplified |
|-------------------|----------------------------|
| Checking that screens do not use the old component library directly | An automated rule that fails the build the moment it happens |
| Keeping the screen-by-screen migration status list current | A script that scans the code and regenerates the list |
| Confirming the running application still matches the Figma design | Automated screenshot comparison that flags visual drift |
| Creating each new adapter one at a time (AI-assisted, but still prompted and reviewed per component) | Scaffolding the adapter automatically from the BCDS component's published prop definitions |
| Checking that every interactive element is accessible | An automated accessibility scan built into the test suite |

The highest-value item is the first: a single automated rule preventing direct use of the old component library would have caught the two files that slipped through without using the shared component layer.

---

## 8. How Other Teams Could Build on This

The SDPR experience points to several practices that appear transferable, though every application will have different requirements.

**Establishing shared components early seems to matter most.** Teams that build a shared component layer before migrating individual screens have a consistent reference point for both developers and AI. Without it, implementation decisions get re-derived on every screen, and inconsistencies accumulate.

**AI performs best with direction, not just intent.** The most successful use of AI involved clear acceptance criteria, concrete examples, and established patterns to follow. AI given only a general goal required more correction than AI given a specific template to work from.

**A direct Figma-to-code connection appears to reduce interpretation errors substantially.** Connecting Figma to the AI assistant, rather than relying on developers to manually interpret designs, reduced the gap between what was designed and what was built.

**Making compliance structural appears more durable than relying on conventions.** Documenting BCDS rules and expecting developers to follow them individually did not hold up over time. Encoding the rules in tooling and shared components proved more reliable.

**Incremental implementation was lower risk than expected.** The concern that screen-by-screen migration would be slow or disruptive was not borne out. Working incrementally allowed course correction early and kept the application stable throughout.

---

## 9. Recommendations for BC Gov

**Share the implementation patterns.** The shared component layer, AI conventions, and Figma-to-code workflow developed in SDPR could reduce setup time significantly for other teams. Packaging and publishing them centrally is the highest-impact action BC Gov could take to accelerate BCDS adoption.

**Make BCDS guidance AI-consumable.** AI tools work best with clear, structured examples. The BCDS team could invest in publishing component usage guidance, accessibility requirements, and worked examples in formats that AI assistants can use directly as references.

**Strengthen Figma-to-code workflows.** The combination of Figma, shared components, and AI-assisted implementation was the most effective part of this process. Standardizing this workflow for BC Gov teams would reduce interpretation errors and improve design-to-delivery consistency.

**Invest in automated validation.** Manual review of design system compliance and accessibility does not scale. Automated checks that flag violations as part of normal development would maintain quality without increasing review burden.

---

## Conclusion

The team set out to align an existing application with BC Government design standards and used AI as a core part of that effort throughout.

The outcome is not just a more consistent, accessible product: it is a set of practical patterns for combining AI, Figma, shared components, and design system guidance in a way other teams can adopt.

The strongest lesson is that BCDS compliance is most durable when it is structural, encoded in the tools and components developers use by default, rather than depending on individual knowledge and effort. AI accelerates that work significantly, but the patterns and foundations the team established are what make the results maintainable over time.

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [AI_BCDS_IMPLEMENTATION_GUIDE.md](./AI_BCDS_IMPLEMENTATION_GUIDE.md) | Full technical detail for developers |
| [BC_DS_SCREEN_MIGRATION_STATUS.md](./BC_DS_SCREEN_MIGRATION_STATUS.md) | Per-screen migration status |
| [B.C. Design System](https://www2.gov.bc.ca/gov/content/digital/design-system) | Official BCDS documentation |
| [BC Gov Design System components](https://designsystem.gov.bc.ca/react-components/) | Component reference documentation |

