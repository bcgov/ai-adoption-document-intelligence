# Frontend Auth Overview

The React auth folder contains the client-side glue that cooperates with the backend to complete the OAuth Authorization Code flow. The frontend never talks to Keycloak directly; it only:

1. Redirects the browser to `GET /api/auth/login`.
2. After Keycloak + backend redirect back to the SPA with `?auth_result=<id>`, calls `GET /api/auth/result?result=<id>` to obtain provider tokens.
3. Stores the returned tokens in `localStorage`, decodes light profile info, and injects the access token into API requests.
4. Calls `POST /api/auth/refresh` when tokens expire and `GET /api/auth/logout` to end the session.

## Key Pieces

| File | Responsibility |
| --- | --- |
| `AuthContext.tsx` | React context that owns token storage, refresh logic, auth result handling, and exposes hooks to the app. |
| `keycloak-config.ts` | (Legacy) Example OIDC client settings; kept for reference but unused in the current flow. |

## How `AuthContext` Works

- On mount it restores tokens from storage, attempts a refresh if expired, and checks the URL for `auth_result` or `auth_error`.
- When an `auth_result` parameter exists, it calls `/api/auth/result`, stores the returned tokens, and removes the query param.
- Whenever the stored user changes, it updates the shared `apiService` with the latest access token so API requests automatically include `Authorization: Bearer ...`.
- `login()` and `logout()` simply send the browser through the backend auth endpoints; the backend handles the rest.

## Developer Notes

- Tokens are stored in `localStorage` for persistence across reloads; switch to `sessionStorage` if shorter lifetime is preferred.
- The auth result id is handled with a `useRef` set to prevent React StrictMode double-invocation from reusing an already consumed result.
- When debugging, enable network logs to confirm the sequence: `/api/auth/login` → Keycloak → `/auth/callback` → SPA (`auth_result`) → `/api/auth/result`.

