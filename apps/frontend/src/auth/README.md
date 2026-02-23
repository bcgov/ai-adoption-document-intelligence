# Frontend Auth Overview

The React auth folder contains the client-side glue that cooperates with the backend to complete the OAuth Authorization Code flow. The frontend never talks to Keycloak directly; it only:

1. Redirects the browser to `GET /api/auth/login` to initiate login.
2. After Keycloak + backend redirect back to the SPA (clean URL, no query params), on mount calls `GET /api/auth/me` to load the user profile.
3. Calls `POST /api/auth/refresh` when tokens expire and navigates to `/api/auth/logout` to end the session.

## Cookie-Based Authentication

Tokens are stored in **HttpOnly cookies** by the backend — the frontend never handles raw tokens. The browser automatically attaches cookies to all same-origin requests when `credentials: "include"` (fetch) or `withCredentials: true` (axios) is used.

### CSRF Protection

Since the app uses cookie-based auth, CSRF protection is required for state-changing requests. The backend sets a **non-HttpOnly** `csrf_token` cookie that the frontend reads and echoes as the `X-CSRF-Token` header on POST, PUT, and DELETE requests.

## Key Pieces

| File | Responsibility |
| --- | --- |
| `AuthContext.tsx` | React context that manages authentication state, profile loading, token refresh, and exposes hooks to the app. |

## How `AuthContext` Works

- On mount, calls `GET /api/auth/me` (with credentials) to determine if the user is authenticated. If the call succeeds, user profile and `expires_in` are populated. If it returns 401, the user is shown the login page.
- `refreshToken()` calls `POST /api/auth/refresh` — the backend reads the `refresh_token` from its HttpOnly cookie, refreshes with Keycloak, and sets updated cookies in the response. The SPA receives `{ expires_in }` in the body.
- `login()` navigates the browser to `/api/auth/login`; the backend orchestrates the full PKCE flow.
- `logout()` navigates the browser to `/api/auth/logout`; the backend clears cookies and redirects to Keycloak's logout endpoint.
- The `apiService` (axios) is configured with `withCredentials: true` globally and uses a request interceptor to attach the `X-CSRF-Token` header from the `csrf_token` cookie.

## Developer Notes

- No tokens are stored in `localStorage` or `sessionStorage` — all token storage is handled via HttpOnly cookies.
- The `getAccessToken` function no longer exists — components that make direct `fetch()` calls should use `credentials: "include"` instead of manually setting `Authorization` headers.
- When debugging, enable network logs to confirm the sequence: `/api/auth/login` → Keycloak → `/api/auth/callback` (sets cookies) → SPA mount → `GET /api/auth/me`.
- The CSRF token cookie is the only auth-related cookie readable by JavaScript (by design, for the double-submit pattern).
