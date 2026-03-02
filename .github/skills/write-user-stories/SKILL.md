---
name: write-user-stories
description: Convert a refined requirements document into one user story file per story in a user_stories subfolder using the strict template, plus a README.md with phase breakdown.
argument-hint: refined-requirements-file
context: fork
agent: user-story-writer
disable-model-invocation: true
---
Generate user stories from: $ARGUMENTS

Requirements:
- Decompose into atomic, independent user stories.
- Write each story using the strict template you have access to.
- Create user_stories subfolder in the same directory as the requirements file.
- Use filename format `US-{number}-{short-description}.md`.
- Generate a README.md in the user_stories folder with all stories organized by phases with checkboxes.