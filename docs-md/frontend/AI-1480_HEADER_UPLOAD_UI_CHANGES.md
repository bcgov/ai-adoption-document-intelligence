# AI-1480: Header and Upload UI Simplification

## Summary

This change simplifies top-level UI chrome to reduce noise and improve focus:

- Removed the "Live OCR" badge from the app header.
- Replaced always-visible user name/email + logout button with a compact avatar menu.
- Avatar now uses initials derived from user name (fallback: email local part).
- User menu shows identity context and exposes logout as a menu action.
- Removed the non-functional date badge from the Upload page header.

## Updated Files

- `apps/frontend/src/layouts/RootLayout.tsx`
- `apps/frontend/src/pages/UploadPage.tsx`
- `apps/frontend/src/App.css`

## Notes

- This is a UI-only change and does not alter authentication behavior.
- Logout remains available via `data-testid="logout-btn"` in the avatar menu.
