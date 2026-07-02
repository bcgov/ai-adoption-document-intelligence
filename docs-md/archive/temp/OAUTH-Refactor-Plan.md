Implement the following migration plan, follow phases at the bottom of the file. Check off each phase after completion. Update the tests, but don't run them.

# Authentication Architecture Improvement Recommendations

## Executive Summary

This document provides recommendations for improving the authentication and authorization setup of a NestJS + React SPA application using Keycloak as the identity provider. The current implementation is a working confidential OAuth 2.0 Authorization Code flow, but contains substantial custom code that can be replaced by well-known, battle-tested libraries. The primary issue — sessions expiring unexpectedly — is caused by the absence of proactive token refresh logic on the frontend.

***

## Problem Analysis: Why Sessions Keep Expiring

The current frontend `AuthContext` only refreshes the token in one scenario: **on app load, if the access token has already expired**. There is no mechanism to refresh tokens during an active session. This means:

1. User logs in → access token valid for N minutes (e.g., 15 min)
2. User uses the app for >15 minutes
3. Next API call fails with 401 — user appears "logged out"
4. No interceptor catches the 401 to attempt a refresh

The refresh token likely hasn't expired (Keycloak defaults to 30-minute idle / 10-hour max), but it's never used mid-session.

***

## Backend Recommendations

### 1. Replace Custom OIDC Logic with `openid-client` (v6.x)

**Library:** `openid-client` — [npm](https://www.npmjs.com/package/openid-client)
- OpenID Certified RP implementation for Node.js
- 691+ dependent packages, maintained by Filip Skokan (also maintains `jose`)
- Supports: Authorization Code Flow, Refresh Token Grant, PKCE, Discovery, JWKS, Client Authentication
- Has a built-in Passport strategy (`openid-client/passport`)

**What it replaces in your code:**

| Current Custom Code | Replaced By `openid-client` |
|---|---|
| Manual Keycloak URL construction | `client.discovery()` auto-discovers all endpoints |
| `createStateToken()` with JWT signing | Built-in state + PKCE generation |
| `exchangeCodeForTokens()` with axios | `client.authorizationCodeGrant()` |
| `validateIdTokenNonce()` with jwks-rsa | Built-in ID token validation (signature, nonce, iss, aud) |
| `refreshAccessToken()` with axios | `client.refreshTokenGrant()` |
| `getLoginUrl()` URL building | `client.buildAuthorizationUrl()` |
| `getLogoutUrl()` URL building | Standard RP-Initiated Logout support |

**Installation:**
```bash
npm install openid-client
```

**Simplified AuthService (conceptual):**
```typescript
import * as client from 'openid-client';

@Injectable()
export class AuthService implements OnModuleInit {
  private config: client.Configuration;

  async onModuleInit() {
    // Auto-discovers all Keycloak endpoints from .well-known
    this.config = await client.discovery(
      new URL(this.configService.get('SSO_AUTH_SERVER_URL')),
      this.configService.get('SSO_CLIENT_ID'),
      this.configService.get('SSO_CLIENT_SECRET'),
    );
  }

  getLoginUrl(): { url: string; codeVerifier: string; state: string } {
    const code_verifier = client.randomPKCECodeVerifier();
    const code_challenge = await client.calculatePKCECodeChallenge(code_verifier);
    const state = client.randomState();
    
    const url = client.buildAuthorizationUrl(this.config, {
      redirect_uri: this.redirectUri,
      scope: 'openid profile email',
      code_challenge,
      code_challenge_method: 'S256',
      state,
    });

    return { url: url.href, codeVerifier: code_verifier, state };
  }

  async handleCallback(currentUrl: URL, expectedState: string, codeVerifier: string) {
    // Handles: code exchange, ID token validation, nonce check, signature verification
    const tokens = await client.authorizationCodeGrant(this.config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState,
    });
    return tokens;
  }

  async refreshToken(refreshToken: string) {
    return await client.refreshTokenGrant(this.config, refreshToken);
  }
}
```

**Note on state/PKCE storage:** You'll need to store `code_verifier` and `state` server-side between the login redirect and the callback. Your existing `AuthSessionStore` pattern (with a short TTL) works well for this — just store these values alongside the result ID.

### 2. Replace Custom Bearer Token Guard with `passport-jwt` + `jwks-rsa`

**Libraries:**
```bash
npm install @nestjs/passport passport passport-jwt jwks-rsa
npm install --save-dev @types/passport-jwt
```

**What it replaces:** Your entire custom `BCGovAuthGuard` including manual JWT decoding, JWKS key fetching, signature verification, and issuer/audience validation.

**Standard Implementation:**
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private configService: ConfigService) {
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${configService.get('SSO_AUTH_SERVER_URL')}/protocol/openid-connect/certs`,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer: configService.get('SSO_AUTH_SERVER_URL'),
      audience: configService.get('SSO_CLIENT_ID'),
      algorithms: ['RS256'],
    });
  }

  validate(payload: any) {
    // Normalize Keycloak roles (keep your existing logic here)
    const roles = this.extractRoles(payload);
    return { ...payload, roles };
  }

  private extractRoles(payload: any): string[] {
    const roleSet = new Set&lt;string&gt;();
    // ... your existing role normalization logic
    return Array.from(roleSet);
  }
}
```

**Global Guard (using NestJS standard pattern):**
```typescript
// auth.module.ts
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [
    KeycloakJwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,  // extends AuthGuard('jwt')
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyAuthGuard, // keep as-is
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // keep as-is
    },
  ],
})
```

The `JwtAuthGuard` extends `AuthGuard('jwt')` and adds your `@Public()` and `@ApiKeyAuth()` checks:

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride&lt;boolean&gt;(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Check ApiKeyAuth fallback
    const isApiKeyAuth = this.reflector.getAllAndOverride&lt;boolean&gt;(API_KEY_AUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest();
    if (isApiKeyAuth && request.headers['x-api-key']) return true;

    return super.canActivate(context);
  }
}
```

### 3. What to Keep As-Is

These parts of your current implementation are already standard and well-designed:

| Component | Reason to Keep |
|---|---|
| `AuthSessionStore` (in-memory) | Clean one-time-consumption pattern for passing tokens to SPA |
| `RolesGuard` + `@Roles()` decorator | Standard NestJS RBAC pattern |
| `@Public()` decorator | Standard NestJS pattern (documented in official docs) |
| `ApiKeyAuthGuard` + `@ApiKeyAuth()` | Clean dual-auth pattern |
| DTO validation with `class-validator` | Best practice for input validation |

**Scalability note:** If you ever need horizontal scaling, replace `AuthSessionStore` with Redis. For a single instance, in-memory is fine.

***

## Frontend Recommendations

### 1. Add Proactive Token Refresh Timer

Add a `useEffect` in `AuthProvider` that schedules a refresh before the token expires:

```typescript
useEffect(() => {
  if (!user?.expires_at) return;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = user.expires_at;
  const tokenLifetime = expiresAt - now;

  // Refresh at 75% of remaining lifetime (minimum 10 seconds before expiry)
  const refreshIn = Math.max((tokenLifetime * 0.75) * 1000, 10_000);

  const timerId = setTimeout(async () => {
    try {
      await refreshToken();
    } catch {
      // Refresh failed — token may be revoked
      // Don't immediately log out; the interceptor will handle it
    }
  }, refreshIn);

  return () => clearTimeout(timerId);
}, [user?.expires_at]);
```

### 2. Add Axios 401 Interceptor with Single-Flight Refresh

This is the critical missing piece. Add to your API service setup:

```typescript
let refreshPromise: Promise&lt;void&gt; | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Single-flight: reuse existing refresh promise if one is in-flight
      if (!refreshPromise) {
        refreshPromise = refreshToken().finally(() => {
          refreshPromise = null;
        });
      }

      try {
        await refreshPromise;
        // Update the Authorization header with the new token
        const newToken = getAccessToken();
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed — redirect to login
        logout();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);
```

**Key details:**
- `_retry` flag prevents infinite loops
- `refreshPromise` ensures only one refresh happens even if multiple requests fail simultaneously
- Failed refresh triggers logout

### 3. Add Visibility/Focus Listeners

Refresh when the user returns to the tab:

```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && user?.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      const buffer = 60; // refresh if less than 60 seconds remaining
      if (user.expires_at - now < buffer && user.refresh_token) {
        refreshToken().catch(() => {});
      }
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [user]);
```

### 4. Remove Unused Dependencies

Remove `oidc-client-ts` from your frontend `package.json` — it's listed as a dependency but not actively used.

***

## Migration Plan

[X] Phase 1: Fix the Logout Issue (Frontend Only)
1. Add the Axios 401 interceptor with single-flight refresh
2. Add the proactive refresh timer in `AuthProvider`
3. Add visibility change listener
4. Test: sessions should survive across the full Keycloak token lifetime

[X] Phase 2: Replace Backend Bearer Token Validation
1. Install `@nestjs/passport`, `passport-jwt`, `jwks-rsa`
2. Create `KeycloakJwtStrategy` (as shown above)
3. Replace `BCGovAuthGuard` with `JwtAuthGuard extends AuthGuard('jwt')`
4. Move role normalization into the strategy's `validate()` method
5. Remove direct `jsonwebtoken` + `jwks-rsa` usage from the guard

[X] Phase 3: Replace Backend OAuth Flow Logic
1. Install `openid-client` (v6.x)
2. Refactor `AuthService` to use `openid-client` for discovery, auth URL, code exchange, token refresh
3. Update state management to use PKCE (`code_verifier`) instead of custom JWT state tokens
4. Keep `AuthSessionStore` for the redirect-to-SPA pattern
5. Remove manual axios calls to Keycloak token endpoint

[X] Phase 4: Cleanup
1. Remove `oidc-client-ts` from frontend
2. Remove unused manual JWT signing code (state tokens)
3. Update environment variable names if needed
4. Update tests

***

## Library Summary

| Library | Status | Purpose |
|---|---|---|
| `openid-client` (v6.x) | ✅ Add | OIDC-certified client: discovery, auth flow, token exchange, refresh |
| `@nestjs/passport` | ✅ Add | Standard NestJS Passport integration |
| `passport-jwt` | ✅ Add | JWT bearer token validation strategy |
| `jwks-rsa` | ✅ Keep | JWKS key provider (used with passport-jwt) |
| `jsonwebtoken` | ⚠️ Reduce usage | Only needed if you keep custom state JWT signing |
| `axios` (backend) | ⚠️ Remove for auth | Replaced by openid-client for Keycloak calls |
| `oidc-client-ts` (frontend) | ❌ Remove | Unused |
| `nest-keycloak-connect` | ❌ Do not use | Depends on deprecated `keycloak-connect` |

***

## Security Notes

All existing security mechanisms are preserved or improved:
- **PKCE** replaces custom JWT state tokens (stronger CSRF protection, no shared secret needed)
- **JWKS verification** is now handled by `jwks-rsa` with built-in caching and rate limiting
- **ID token validation** is handled by `openid-client` (signature, nonce, iss, aud, exp)
- **Confidential client** is maintained — `client_secret` stays server-side
- **Role normalization** is preserved in the Passport strategy's `validate()` method
- **`localStorage` token storage** has been replaced by HttpOnly cookies (XSS immune)