# Authentication & Authorization Architecture

## Table of Contents
- [Overview](#overview)
- [OAuth 2.0 Flow Type](#oauth-20-flow-type)
- [Architecture Diagram](#architecture-diagram)
- [Technology Stack](#technology-stack)
- [Backend Implementation](#backend-implementation)
  - [Module Structure](#module-structure)
  - [Core Components](#core-components)
  - [Security Mechanisms](#security-mechanisms)
- [Frontend Implementation](#frontend-implementation)
  - [AuthContext Architecture](#authcontext-architecture)
  - [Token Management](#token-management)
  - [User Session Lifecycle](#user-session-lifecycle)
- [Authentication Flow](#authentication-flow)
  - [Login Sequence](#login-sequence)
  - [Token Refresh Flow](#token-refresh-flow)
  - [Logout Sequence](#logout-sequence)
- [Authorization & RBAC](#authorization--rbac)
- [API Key Authentication](#api-key-authentication)
- [Configuration](#configuration)
- [Security Considerations](#security-considerations)
- [Development Guide](#development-guide)

---

## Overview

This application implements a **confidential OAuth 2.0 Authorization Code flow** with **Keycloak** as the identity provider. The architecture is designed with the following principles:

- **Backend-Driven OAuth**: The backend acts as the confidential OAuth client, keeping client secrets server-side
- **Cookie-Based Sessions**: Tokens are stored in HttpOnly cookies, never exposed to JavaScript
- **Zero Token Exposure**: The frontend receives no raw tokens; authentication state is determined via a `/api/auth/me` endpoint
- **Defense-in-Depth**: Multiple security layers including PKCE, nonce validation, CSRF double-submit cookies, JWKS verification, RBAC, rate limiting, and HTTP security headers (helmet)

---

## OAuth 2.0 Flow Type

### Authorization Code Flow with PKCE

The implementation uses the **OAuth 2.0 Authorization Code Flow with PKCE (Proof Key for Code Exchange)**, which is the most secure flow for web applications with a backend:

**Flow Characteristics:**
- **Confidential Client**: Backend holds the `client_secret` and exchanges authorization codes server-to-server
- **PKCE**: Active PKCE (code_verifier / code_challenge) protects the authorization code exchange against interception
- **Nonce Validation**: ID token nonce is validated via `openid-client` to ensure response freshness
- **Token Storage**: Provider tokens stored in HttpOnly cookies, inaccessible to JavaScript
- **CSRF Protection**: Double-submit cookie pattern protects state-changing endpoints
- **Refresh Token Rotation**: Supports refresh token grant for extending sessions without re-authentication

**Why This Flow?**
- Prevents token leakage in browser history (tokens never in URL, never in JavaScript)
- Client secret never exposed to browser
- HttpOnly cookies prevent XSS-based token theft
- Supports long-lived sessions via refresh tokens
- Compatible with Keycloak's security model

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                          REACT SPA                                    │  │
│  │                                                                        │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │             AuthContext (AuthProvider)                        │   │  │
│  │  │  - Cookie-based auth (HttpOnly cookies)                       │   │  │
│  │  │  - Automatic Refresh Logic                                    │   │  │
│  │  │  - Profile from /api/auth/me endpoint                         │   │  │
│  │  └──────────────────────────────────────────────────────────────┘   │  │
│  │                              │                                         │  │
│  │                              ▼                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │             API Service (axios)                               │   │  │
│  │  │  - Sends credentials via cookies + CSRF header                │   │  │
│  │  └──────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────┬─────────────────────────────────────┘  │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │    HTTP Requests (HTTPS)      │
                    └───────────────┬───────────────┘
                                    │
┌───────────────────────────────────▼─────────────────────────────────────────┐
│                          NESTJS BACKEND                                      │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      Auth Module                                    │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │            Auth Controller (Routes)                         │   │    │
│  │  │  - GET  /api/auth/login                                     │   │    │
│  │  │  - GET  /api/auth/callback                                  │   │    │
│  │  │  - POST /api/auth/refresh                                   │   │    │
│  │  │  - GET  /api/auth/logout                                    │   │    │
│  │  │  - GET  /api/auth/me                                        │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  │                              │                                      │    │
│  │                              ▼                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │            Auth Service                                     │   │    │
│  │  │  - OIDC Discovery (openid-client)                           │   │    │
│  │  │  - PKCE Code Verifier / Challenge                           │   │    │
│  │  │  - Code → Token Exchange                                    │   │    │
│  │  │  - Cookie Management (HttpOnly)                             │   │    │
│  │  │  - Refresh Token Proxying                                   │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                  Global Guards (APP_GUARD)                          │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │        JwtAuthGuard (Cookie-first JWT Validation)           │   │    │
│  │  │  - Skips @Public routes                                     │   │    │
│  │  │  - Extracts JWT from access_token cookie first              │   │    │
│  │  │  - Falls back to Authorization: Bearer header               │   │    │
│  │  │  - Validates token via JWKS (RS256)                         │   │    │
│  │  │  - Verifies issuer & audience                               │   │    │
│  │  │  - Normalizes Keycloak roles into request.user              │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  │                              │                                      │    │
│  │                              ▼                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │        CsrfGuard (CSRF Protection)                          │   │    │
│  │  │  - Validates CSRF double-submit cookie pattern              │   │    │
│  │  │  - Compares X-CSRF-Token header to csrf_token cookie        │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  │                              │                                      │    │
│  │                              ▼                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │        ApiKeyAuthGuard (Optional Fallback)                  │   │    │
│  │  │  - Validates X-API-Key header for @ApiKeyAuth routes        │   │    │
│  │  │  - Provides alternative machine-to-machine auth             │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  │                              │                                      │    │
│  │                              ▼                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │        RolesGuard (RBAC Enforcement)                        │   │    │
│  │  │  - Reads @Roles decorator metadata                          │   │    │
│  │  │  - Validates request.user.roles against required roles      │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │
                   ┌───────────────┴───────────────┐
                   │      HTTPS (Token Exchange)   │
                   └───────────────┬───────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────────────┐
│                         KEYCLOAK (Identity Provider)                          │
│                                                                               │
│  - Authorization Endpoint: /protocol/openid-connect/auth                     │
│  - Token Endpoint:         /protocol/openid-connect/token                    │
│  - JWKS Endpoint:          /protocol/openid-connect/certs                    │
│  - Logout Endpoint:        /protocol/openid-connect/logout                   │
│                                                                               │
│  Provides:                                                                    │
│  - User authentication UI                                                     │
│  - Access tokens (JWT)                                                        │
│  - Refresh tokens                                                             │
│  - ID tokens (with user profile claims)                                      │
│  - Public keys for token verification (JWKS)                                 │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `@nestjs/common` | 11.1.12 | Core NestJS framework |
| `@nestjs/config` | 4.0.2 | Configuration management |
| `@nestjs/passport` | 11.x | Passport integration for NestJS |
| `passport-jwt` | 4.x | JWT extraction and validation strategy |
| `openid-client` | 6.8.2 | OIDC discovery, PKCE, token exchange, refresh, and ID token validation |
| `cookie-parser` | 1.4.7 | Parse HTTP cookies on incoming requests |
| `@nestjs/throttler` | 6.5.0 | Global and per-route rate limiting to prevent brute-force and DoS |
| `helmet` | 8.x | HTTP security headers (HSTS, CSP, X-Frame-Options, etc.) |
| `class-validator` | 0.14.3 | DTO validation for all auth routes |
| `class-transformer` | 0.5.1 | DTO transformation |

**Key Backend Libraries Explained:**

- **`openid-client`**: Handles OIDC discovery, PKCE code challenge/verifier generation, authorization code exchange, refresh grants, and ID token signature verification — replaces manual `jsonwebtoken`/`jwks-rsa`/`axios` usage
- **`passport-jwt`**: Extracts JWTs from cookies (primary) or Authorization header (fallback) and validates them via JWKS
- **`cookie-parser`**: Parses cookies so controllers and guards can read auth tokens from `req.cookies`
- **`@nestjs/throttler`**: Provides global rate limiting (100 requests/minute default) and per-route overrides on sensitive auth endpoints (5–10 requests/minute)
- **`helmet`**: Sets HTTP security headers on all responses — HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Content-Security-Policy, and removes X-Powered-By
- **`class-validator`**: Ensures all incoming OAuth callback parameters and request bodies are well-formed

### Frontend Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `react` | 19.2.0 | UI framework |
| `react-router-dom` | 7.9.6 | Client-side routing |
| `axios` | 1.13.2 | HTTP client for backend API calls |

**Frontend Implementation Notes:**

- **No OIDC client library used**: The frontend relies entirely on the backend to handle all OAuth interactions
- **No token access**: The frontend never sees raw tokens; they are stored in HttpOnly cookies managed by the backend
- **Profile data**: User profile information is fetched from the `/api/auth/me` endpoint

---

## Backend Implementation

### Module Structure

```
apps/backend-services/src/auth/
├── auth.module.ts              # Module definition with global guards
├── auth.controller.ts          # Public HTTP endpoints for OAuth flow
├── auth.service.ts             # Core OAuth orchestration logic
├── cookie-auth.utils.ts        # Centralized cookie configuration (names, options, helpers)
├── csrf.guard.ts               # CSRF double-submit cookie protection guard
├── keycloak-jwt.strategy.ts    # Passport JWT strategy (cookie-first extraction)
├── jwt-auth.guard.ts           # Passport-based auth guard wrapping the JWT strategy
├── api-key-auth.guard.ts       # API key validation guard
├── roles.guard.ts              # RBAC enforcement guard
├── public.decorator.ts         # @Public() metadata
├── roles.decorator.ts          # @Roles(...) metadata
├── types.ts                    # User interface and Express augmentation
└── dto/
    ├── index.ts                      # Barrel export
    ├── token-response.dto.ts         # Keycloak token response structure
    ├── refresh-token.dto.ts          # Refresh response DTO
    ├── oauth-callback-query.dto.ts   # Callback query parameters
    └── me-response.dto.ts            # Profile endpoint response DTO
```

### Core Components

#### 1. **AuthService** (`auth.service.ts`)

The central orchestrator for the OAuth flow. Key responsibilities:

**Initialization:**
```typescript
constructor(private configService: ConfigService)
```

- Performs OIDC discovery via `openid-client` on module init
- Constructs Keycloak endpoint URLs from environment variables
- Validates required configuration on startup

**Key Methods:**

| Method | Purpose |
|--------|---------|
| `getLoginUrl()` | Async — returns `Promise<LoginUrlResult>` with authorization URL, PKCE state, code verifier, and nonce |
| `handleCallback(code, state, codeVerifier, nonce, iss?)` | Exchanges authorization code for tokens with PKCE validation; returns `TokenResponseDto` directly |
| `refreshAccessToken(refreshToken)` | Proxies refresh token grant to Keycloak via openid-client |
| `getLogoutUrl(idTokenHint?)` | Constructs Keycloak logout URL with `client_id` and `post_logout_redirect_uri` |
| `getFrontendUrl()` | Returns the configured frontend URL for redirects |
| `buildErrorRedirect(error)` | Produces a frontend redirect URL for auth failures |

**PKCE Security:**

PKCE (Proof Key for Code Exchange) is handled using `openid-client` functions:

```typescript
const codeVerifier = client.randomPKCECodeVerifier();
const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
const state = client.randomState();
const nonce = client.randomNonce();
```

- Code verifier and nonce are stored in an HttpOnly cookie on the browser (scoped to `/api/auth/callback`)
- The code challenge is sent to Keycloak in the authorization URL
- On callback, the code verifier is read from the cookie and sent to Keycloak with the authorization code
- `openid-client` validates the ID token (signature, nonce, issuer, audience) automatically

#### 2. **AuthController** (`auth.controller.ts`)

Thin HTTP layer exposing OAuth entrypoints. Auth flow routes are marked `@Public()`. The `/me` endpoint requires authentication.

**Routes:**

```typescript
// 1. Login Initiation
@Public()
@Get("login")
async getLoginUrl(@Res() res: Response) {
  const { url, state, codeVerifier, nonce } = await this.authService.getLoginUrl();
  // Stores PKCE data in an HttpOnly cookie scoped to the callback path
  const pkceData: PkceCookieData = { state, codeVerifier, nonce };
  res.cookie(AUTH_COOKIE_NAMES.PKCE_VERIFIER, JSON.stringify(pkceData), COOKIE_OPTIONS.pkceVerifier());
  res.redirect(url);  // 302 redirect to Keycloak
}

// 2. OAuth Callback Handler
@Public()
@Get("callback")
async oauthCallback(
  @Query() query: OAuthCallbackQueryDto,  // { code, state, iss?, session_state? }
  @Req() req: Request,
  @Res() res: Response,
) {
  const pkceData: PkceCookieData = JSON.parse(req.cookies[AUTH_COOKIE_NAMES.PKCE_VERIFIER]);
  res.clearCookie(AUTH_COOKIE_NAMES.PKCE_VERIFIER, { path: "/api/auth/callback" });
  const tokens = await this.authService.handleCallback(
    query.code, query.state, pkceData.codeVerifier, pkceData.nonce, query.iss,
  );
  // Sets HttpOnly auth cookies + CSRF token
  const csrfToken = generateCsrfToken();
  setAuthCookies(res, tokens, csrfToken);
  res.redirect(this.authService.getFrontendUrl());
}

// 3. Token Refresh
@Public()
@Post("refresh")
async refreshToken(
  @Req() req: Request,
  @Res({ passthrough: true }) res: Response,
): Promise<RefreshReturnDto> {
  const refreshTokenValue = req.cookies?.[AUTH_COOKIE_NAMES.REFRESH_TOKEN];
  const tokens = await this.authService.refreshAccessToken(refreshTokenValue);
  const csrfToken = generateCsrfToken();
  setAuthCookies(res, tokens, csrfToken);
  return { expires_in: tokens.expires_in };
}

// 4. Logout
@Public()
@Get("logout")
async logout(@Req() req: Request, @Res() res: Response) {
  const idTokenHint = req.cookies?.[AUTH_COOKIE_NAMES.ID_TOKEN];
  clearAuthCookies(res);
  const logoutUrl = this.authService.getLogoutUrl(idTokenHint);
  res.redirect(logoutUrl);  // 302 redirect to Keycloak logout
}

// 5. User Profile (protected — NOT @Public)
@Get("me")
async getMe(@Req() req: Request): Promise<MeResponseDto> {
  const user = req.user as User;
  const now = Math.floor(Date.now() / 1000);
  const exp = (user.exp as number) || now;
  return {
    sub: user.sub || "",
    name: (user.name as string) || (user.display_name as string),
    preferred_username: (user.preferred_username as string) || (user.idir_username as string),
    email: user.email,
    roles: user.roles || [],
    expires_in: Math.max(exp - now, 0),
  };
}
```

**DTO Validation:**
Every route uses validated DTOs to ensure data integrity:

```typescript
// Example: oauth-callback-query.dto.ts
export class OAuthCallbackQueryDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  state!: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  iss?: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  session_state?: string;
}
```

#### 3. **Cookie Auth Utilities** (`cookie-auth.utils.ts`)

Centralized cookie configuration for all auth-related cookies. Provides consistent cookie settings and helper functions.

```typescript
// Cookie names
export const AUTH_COOKIE_NAMES = {
  PKCE_VERIFIER: 'pkce_verifier',
  ACCESS_TOKEN: 'access_token',
  REFRESH_TOKEN: 'refresh_token',
  ID_TOKEN: 'id_token',
  CSRF_TOKEN: 'csrf_token',
} as const;

export const CSRF_HEADER_NAME = 'x-csrf-token';

// Determines if cookies should set the `secure` flag
function isSecure(): boolean {
  const env = process.env.NODE_ENV;
  return env !== 'development' && env !== 'test';
}

// Base options shared by all HttpOnly auth cookies
function baseHttpOnlyOptions(): CookieOptions {
  return { httpOnly: true, secure: isSecure(), sameSite: 'lax' };
}

// Cookie option presets
export const COOKIE_OPTIONS = {
  pkceVerifier: (): CookieOptions => ({
    ...baseHttpOnlyOptions(), maxAge: 2 * 60 * 1000, path: '/api/auth/callback',
  }),
  accessToken: (expiresInSeconds: number): CookieOptions => ({
    ...baseHttpOnlyOptions(), maxAge: expiresInSeconds * 1000, path: '/',
  }),
  refreshToken: (): CookieOptions => ({
    ...baseHttpOnlyOptions(), maxAge: 30 * 24 * 60 * 60 * 1000, path: '/api/auth/refresh',
  }),
  idToken: (expiresInSeconds: number): CookieOptions => ({
    ...baseHttpOnlyOptions(), maxAge: expiresInSeconds * 1000, path: '/api/auth',
  }),
  csrfToken: (expiresInSeconds: number): CookieOptions => ({
    httpOnly: false, secure: isSecure(), sameSite: 'strict', path: '/',
    maxAge: expiresInSeconds * 1000,
  }),
} as const;

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function setAuthCookies(res: Response, tokens: TokenResponseDto, csrfToken: string): void {
  // Sets access_token, refresh_token, id_token as HttpOnly cookies
  // Sets csrf_token as a non-HttpOnly cookie (readable by JavaScript for CSRF header)
}

export function clearAuthCookies(res: Response): void {
  // Clears all auth cookies
}
```

**Cookie Security Properties:**
- `httpOnly: true` — Prevents JavaScript access (XSS protection)
- `secure: true` (production) — Sent only over HTTPS
- `sameSite: 'lax'` — Allows OAuth redirects while blocking cross-site POST requests
- `csrf_token` cookie is intentionally NOT HttpOnly so frontend JavaScript can read it and send it as a header

#### 4. **CsrfGuard** (`csrf.guard.ts`)

Implements the double-submit cookie pattern for CSRF protection on state-changing endpoints:

```typescript
@Injectable()
export class CsrfGuard implements CanActivate {
  private static readonly SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Safe (read-only) methods are never CSRF-vulnerable
    if (CsrfGuard.SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    // Requests with explicit Authorization header (Bearer token) are not CSRF-vulnerable
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return true;
    }

    // Requests with API key header are not CSRF-vulnerable
    if (request.headers['x-api-key']) {
      return true;
    }

    // If no auth cookie is present, this isn't a cookie-authenticated request — skip CSRF
    const accessTokenCookie = request.cookies?.[AUTH_COOKIE_NAMES.ACCESS_TOKEN];
    if (!accessTokenCookie) {
      return true;
    }

    // Cookie-authenticated state-changing request: enforce CSRF double-submit
    const csrfCookie = request.cookies?.[AUTH_COOKIE_NAMES.CSRF_TOKEN];
    const csrfHeader = request.headers[CSRF_HEADER_NAME];

    if (!csrfCookie || !csrfHeader || typeof csrfHeader !== 'string' || csrfCookie !== csrfHeader) {
      throw new ForbiddenException('CSRF token validation failed');
    }

    return true;
  }
}
```

**How It Works:**
- On login and refresh, a `csrf_token` cookie is set (readable by JavaScript, NOT HttpOnly)
- Frontend reads this cookie and sends its value as an `X-CSRF-Token` header on state-changing requests
- The guard compares the header value to the cookie value
- A cross-origin attacker cannot read the cookie to set the header, preventing CSRF
- Requests using Bearer tokens or API keys are exempt (not CSRF-vulnerable)
- If no `access_token` cookie is present, CSRF check is skipped (not a cookie-authenticated request)

#### 5. **JwtAuthGuard / KeycloakJwtStrategy** (`jwt-auth.guard.ts` / `keycloak-jwt.strategy.ts`)

Global guard that validates JWTs on all routes except those marked `@Public()`. Uses Passport's JWT strategy with cookie-first extraction and Bearer header fallback.

**Flow:**

1. Check if route is `@Public()` → skip validation
2. Check if route allows `@ApiKeyAuth()` and API key present → skip (ApiKeyAuthGuard handles it)
3. Extract JWT from `access_token` cookie first; if absent, fall back to `Authorization: Bearer {token}` header
4. Validate token via Passport JWT strategy (JWKS RS256 signature verification)
5. Validate `issuer` and `audience` claims
6. Normalize Keycloak role claims into `request.user.roles[]`
7. Attach `user` object to request for downstream use

**Passport JWT Strategy (cookie-first extraction):**

```typescript
// Cookie-first extraction with Bearer header fallback
function cookieOrBearerExtractor(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAMES.ACCESS_TOKEN];
  if (cookieToken) return cookieToken;
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class KeycloakJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly clientId: string;

  constructor(private configService: ConfigService) {
    // ... construct jwksUri and expectedIssuer from SSO_AUTH_SERVER_URL + SSO_REALM
    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri,
      }),
      jwtFromRequest: cookieOrBearerExtractor,
      issuer: expectedIssuer,
      audience: clientId,
      algorithms: ['RS256'],
    });
    this.clientId = clientId;
  }

  validate(payload: any): User {
    const normalizedRoles = this.extractRoles(payload);
    return {
      sub: payload.sub,
      idir_username: payload.idir_username,
      display_name: payload.display_name,
      email: payload.email,
      roles: normalizedRoles,
      ...payload,
    };
  }
}
```

**Role Normalization:**

Keycloak can embed roles in multiple JWT claims:
- `roles[]` (top-level)
- `realm_access.roles[]` (realm-level roles)
- `resource_access.<client-id>.roles[]` (client-specific roles)

The strategy normalizes all of these into a single `user.roles[]` array:

```typescript
private extractRoles(payload: JwtPayload): string[] {
  const roleSet = new Set<string>();
  
  // Collect from all potential sources
  pushRoles(payload.roles);
  pushRoles(payload.realm_access?.roles);
  
  const resourceRoles = payload.resource_access ?? {};
  Object.values(resourceRoles).forEach((access) => pushRoles(access.roles));
  pushRoles(resourceRoles[this.clientId]?.roles);
  
  return Array.from(roleSet);
}
```

#### 5. **RolesGuard** (`roles.guard.ts`)

RBAC enforcement guard that runs after `JwtAuthGuard`. It checks the `@Roles()` decorator and ensures `request.user.roles` contains at least one required role.

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from @Roles decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;  // No roles required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.roles) {
      throw new ForbiddenException("User has no roles");
    }

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }
}
```

**Usage Example:**

```typescript
@Controller("admin")
export class AdminController {
  @Get("users")
  @Roles("admin", "user-manager")  // Requires at least one of these roles
  async listUsers() {
    // Only accessible to users with "admin" OR "user-manager" role
  }
}
```

#### 6. **Module Wiring** (`auth.module.ts`)

Global guards are registered via `APP_GUARD` provider token, which applies them to all routes automatically.

**Rate limiting** is configured globally in the `AppModule` via `ThrottlerModule` and `ThrottlerGuard`:

```typescript
// app.module.ts — Global rate limiting
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: 60_000,    // 1 minute window
          limit: 100,     // 100 requests per minute per IP
        },
      ],
    }),
    // ... other modules
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,  // Enforces rate limits globally
    },
  ],
})
export class AppModule {}
```

**Auth-specific guards** are registered in the `AuthModule`:

```typescript
// auth.module.ts — Authentication guards
@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: 'jwt' }), ApiKeyModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    KeycloakJwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,  // Validates JWT (cookie-first) on all routes
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyAuthGuard,  // Handles API key auth
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,  // Enforces @Roles decorator
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,  // CSRF double-submit cookie protection
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
```

**Guard Execution Order:**
1. `ThrottlerGuard` → Enforces per-IP rate limits (global default or per-route override)
2. `JwtAuthGuard` → Extracts JWT from cookie/header → Validates via Passport → Sets `request.user`
3. `ApiKeyAuthGuard` → Validates API key (if applicable) → Sets `request.user`
4. `RolesGuard` → Checks `@Roles()` decorator → Validates `request.user.roles`
5. `CsrfGuard` → Validates CSRF double-submit cookie on state-changing requests

### Security Mechanisms

#### CSRF Protection (Double-Submit Cookie Pattern)

State-changing requests (POST, PUT, DELETE) are protected by the double-submit cookie pattern:
- A `csrf_token` cookie (readable by JavaScript) is set during login and refresh
- The frontend reads this cookie and sends its value as an `X-CSRF-Token` header
- The `CsrfGuard` compares the header to the cookie value
- Cross-origin attackers cannot read the cookie to forge the header

#### PKCE Protection

The authorization code exchange is protected by PKCE:
- A `code_verifier` is generated and stored in an HttpOnly cookie during login (2-minute TTL)
- The corresponding `code_challenge` is sent to Keycloak
- On callback, the `code_verifier` is included in the token exchange
- This prevents authorization code interception attacks

#### Nonce Validation

The nonce is validated automatically by `openid-client` during token exchange:
- A cryptographic nonce is generated and sent in the authorization request
- `openid-client` verifies the nonce in the returned ID token matches
- This binds the ID token to the specific authorization request, preventing replay

#### Token Signature Verification (JWKS)

All access tokens are verified using Keycloak's public keys:
- Keys fetched from `/protocol/openid-connect/certs` (JWKS endpoint)
- Cached with rate limiting (5 requests per minute)
- RS256 asymmetric signature verification
- Validates `issuer` and `audience` claims

#### Rate Limiting

All endpoints are protected by `@nestjs/throttler` with a default global rate limit. Auth endpoints have stricter per-route limits:

| Endpoint | Method | Rate Limit | Window |
|----------|--------|-----------|--------|
| All endpoints (default) | Any | 100 requests | 1 minute |
| `/api/auth/refresh` | POST | 5 requests | 1 minute |
| `/api/auth/login` | GET | 10 requests | 1 minute |
| `/api/auth/callback` | GET | 10 requests | 1 minute |
| `/api/auth/logout` | GET | 10 requests | 1 minute |
| `/api/auth/me` | GET | 100 requests (global default) | 1 minute |

**Why strict limits on auth endpoints?**
- `/api/auth/refresh` is the most sensitive — it can generate unlimited CSRF tokens and probe for valid refresh tokens. Limited to 5/minute.
- `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout` are rate-limited to 10/minute to prevent login flood attacks and authorization code brute-forcing.
- API key validation involves bcrypt comparison, making it a CPU-exhaustion vector under high request volume. The global default rate limit (100/minute) protects against this.

**Response headers** on rate-limited endpoints:
- `X-RateLimit-Limit`: Maximum number of requests allowed in the window
- `X-RateLimit-Remaining`: Number of requests remaining in the current window
- `Retry-After`: Seconds until the rate limit resets (only on 429 responses)

When a rate limit is exceeded, the server responds with HTTP `429 Too Many Requests`.

#### Security Headers (Helmet)

The backend uses the `helmet` middleware (v8.x) to set HTTP security headers on all responses. Helmet is registered in `main.ts` before routes are mounted, ensuring every response includes protective headers.

**Headers applied:**

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces HTTPS-only connections for 1 year |
| `X-Frame-Options` | `DENY` | Prevents clickjacking by disallowing framing |
| `X-Content-Type-Options` | `nosniff` | Prevents browser MIME type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer information leakage |
| `Content-Security-Policy` | `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https://validator.swagger.io` | Controls resource loading origins |
| `X-Powered-By` | *(removed)* | Helmet removes this header to prevent technology fingerprinting |

**CSP Configuration Notes:**
- `'unsafe-inline'` is required for `style-src` and `script-src` to allow Swagger UI to function at `/api`
- `https://validator.swagger.io` is whitelisted in `img-src` for the Swagger badge
- `data:` URIs allowed in `img-src` for inline Swagger UI images

**Frontend nginx** also sets equivalent security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`) in `nginx-default.conf`.

#### HttpOnly Cookie Security

Tokens stored in HttpOnly cookies provide:
- **XSS Protection**: JavaScript cannot access HttpOnly cookies, preventing token theft via XSS
- **Automatic Transmission**: Browser automatically sends cookies with same-origin requests
- **Secure Flag**: Cookies only sent over HTTPS in production
- **SameSite=Lax**: Prevents CSRF while allowing OAuth redirect flows

---

## Frontend Implementation

### AuthContext Architecture

The frontend authentication is encapsulated in a single React context: `AuthContext.tsx`. This provides a clean separation of concerns and exposes a simple API to the rest of the application.

**File Structure:**
```
apps/frontend/src/auth/
├── AuthContext.tsx    # Complete auth implementation
└── README.md          # Documentation
```

### Key Interfaces

```typescript
interface AuthUser {
  sub: string;
  expires_at: number;
  profile: {
    name?: string;
    preferred_username?: string;
    email?: string;
    [key: string]: unknown;
  };
  roles: string[];
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => void;
  refreshToken: () => Promise<void>;
}
```

### AuthProvider Component

The `AuthProvider` wraps the entire application and manages authentication state:

**Initialization Flow:**

```typescript
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initAuth = async () => {
      try {
        cleanAuthErrorFromUrl();
        const userData = await fetchMe();  // Call /api/auth/me to check if authenticated
        setUser(userData);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [fetchMe]);

  // ... context value and return
};
```

**Key Behaviors:**
- Runs once on mount (guarded by `useRef` to prevent double-init in React Strict Mode)
- Cleans up `auth_error` query params from failed login attempts
- Calls `/api/auth/me` to check if user has valid auth cookies
- If cookies are valid, the backend returns user profile data
- If cookies are expired/missing, user is set to `null`
- Sets `isLoading = false` when complete

### Token Management

#### Cookie-Based Authentication

Tokens are stored in HttpOnly cookies managed entirely by the backend. The frontend never sees or handles raw tokens.

**How It Works:**
- After successful OAuth callback, the backend sets HttpOnly cookies (`access_token`, `refresh_token`, `id_token`)
- The browser automatically sends these cookies with every same-origin request
- A `csrf_token` cookie (NOT HttpOnly) is also set for CSRF protection
- The frontend reads only the `csrf_token` cookie to include it as an `X-CSRF-Token` header

**Why HttpOnly Cookies?**
- Immune to XSS attacks (JavaScript cannot access HttpOnly cookies)
- Automatic browser handling (no manual token management)
- Persistent across browser sessions
- Simplifies frontend code (no localStorage management)

#### Auth Status Check

On app load, the provider calls `/api/auth/me` to determine authentication state:

```typescript
const fetchMe = useCallback(async (): Promise<AuthUser | null> => {
  try {
    const response = await axios.get<MeResponse>(
      `${apiBaseUrl}/auth/me`,
      { withCredentials: true },
    );
    return meResponseToUser(response.data);
  } catch {
    return null;
  }
}, [apiBaseUrl, meResponseToUser]);
```

**How It Works:**
1. Browser automatically sends auth cookies with the request
2. Backend's `JwtAuthGuard` validates the `access_token` cookie
3. If valid, returns `MeResponseDto` with user profile and `expires_in`
4. `meResponseToUser()` computes `expires_at` from `expires_in` and builds the `AuthUser` object
5. If invalid/missing, returns 401 and frontend shows logged-out state

### User Session Lifecycle

#### Authentication Flow

The frontend uses simple redirects for all authentication operations:

```typescript
const login = () => {
  const loginUrl = `${apiBaseUrl}/auth/login`;
  window.location.href = loginUrl;  // Full page navigation
};
```

**Why Full Page Navigation?**
- OAuth redirect flow requires full page navigation to Keycloak
- Simplifies state management (no need to track partial auth states)
- Browser handles redirect sequence automatically

#### Post-Login Redirect

After OAuth callback, the backend sets auth cookies and redirects the user to the frontend. On mount, the `AuthProvider` calls `fetchMe()` which hits `/api/auth/me` — this succeeds because the cookies are now present.

No URL parameters, localStorage, or token handling needed on the frontend.

#### Token Refresh

The refresh function calls the backend, which reads the refresh_token cookie and returns new cookies:

```typescript
const refreshToken = useCallback(async (): Promise<void> => {
  try {
    const csrfToken = getCookie('csrf_token');
    const response = await axios.post<RefreshResponse>(
      `${apiBaseUrl}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
      },
    );

    // Backend has already set new auth cookies in the response
    // Update local expires_at without re-fetching /me
    const expiresAt = Math.floor(Date.now() / 1000) + response.data.expires_in;
    setUser((prev) => prev ? { ...prev, expires_at: expiresAt } : prev);
  } catch {
    setUser(null);
  }
}, [apiBaseUrl]);
```

**When is Refresh Triggered?**
- **Proactively** by a timer at 75% of the access token's lifetime (minimum 10 seconds)
- **On tab focus** via a `visibilitychange` listener when less than 60 seconds remain
- **Reactively** by the `apiService` 401 response interceptor (single-flight pattern)
- After refresh failure, the 401 interceptor triggers logout

#### Logout

The logout function navigates to the backend logout endpoint, which clears cookies and redirects to Keycloak:

```typescript
const logout = () => {
  setUser(null);
  window.location.href = `${apiBaseUrl}/auth/logout`;
};
```

**How It Works:**
- Backend reads `id_token` from cookie to pass as `id_token_hint` to Keycloak
- Backend clears all auth cookies
- Backend redirects to Keycloak's logout endpoint
- Keycloak invalidates the session and redirects back to `SSO_POST_LOGOUT_REDIRECT_URI`
- No query parameters needed from the frontend

### API Integration

All API requests go through a centralized `ApiService` class with `withCredentials: true` so the browser automatically sends auth cookies. The CSRF token is included as a header:

```typescript
// api.service.ts
class ApiService {
  private axiosInstance: AxiosInstance;
  private refreshCallback: (() => Promise<void>) | null = null;
  private refreshPromise: Promise<void> | null = null;
  private logoutCallback: (() => void) | null = null;

  constructor(baseURL: string) {
    this.axiosInstance = axios.create({
      baseURL,
      withCredentials: true,  // Sends cookies automatically
    });

    // Add CSRF header to state-changing requests
    this.axiosInstance.interceptors.request.use((config) => {
      const method = config.method?.toUpperCase();
      if (method && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const csrfToken = getCsrfToken();
        if (csrfToken && config.headers) {
          config.headers['X-CSRF-Token'] = csrfToken;
        }
      }
      return config;
    });

    // 401 interceptor with single-flight refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          if (!this.refreshPromise && this.refreshCallback) {
            this.refreshPromise = this.refreshCallback()
              .finally(() => { this.refreshPromise = null; });
          }
          if (this.refreshPromise) {
            try {
              await this.refreshPromise;
              return this.axiosInstance(originalRequest);
            } catch {
              this.logoutCallback?.();
              return Promise.reject(error);
            }
          }
        }
        return Promise.reject(error);
      },
    );
  }

  setRefreshCallback(callback: () => Promise<void>) { this.refreshCallback = callback; }
  setLogoutCallback(callback: () => void) { this.logoutCallback = callback; }
}

// Helper to read csrf_token cookie
function getCsrfToken(): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf_token='));
  return match?.split('=')[1];
}
```

The `AuthContext` registers its `refreshToken` and `logout` callbacks with `apiService`, enabling automatic token refresh on 401 responses without manual token management in components.

### Using the Auth Context

Components access auth state via the `useAuth` hook:

```typescript
import { useAuth } from "@/auth/AuthContext";

function MyComponent() {
  const { isAuthenticated, isLoading, user, login, logout } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div>
        <p>Please log in to continue</p>
        <button onClick={login}>Log In</button>
      </div>
    );
  }

  return (
    <div>
      <p>Welcome, {user.profile?.name || user.profile?.preferred_username}!</p>
      <button onClick={logout}>Log Out</button>
    </div>
  );
}
```

**Available Properties:**
- `isAuthenticated`: Boolean indicating if user is logged in
- `isLoading`: Boolean indicating if auth state is still initializing
- `user`: Current user object with profile data from `/api/auth/me`
- `login()`: Initiates login flow
- `logout()`: Navigates to backend logout endpoint (clears cookies, redirects to Keycloak)
- `refreshToken()`: Manually triggers token refresh via cookies

---

## Authentication Flow

### Login Sequence

```
┌────────┐                 ┌─────────┐                ┌──────────┐                ┌──────────┐
│  User  │                 │   SPA   │                │  Backend │                │ Keycloak │
└───┬────┘                 └────┬────┘                └────┬─────┘                └────┬─────┘
    │                           │                          │                           │
    │  1. Click "Login"         │                          │                           │
    ├──────────────────────────>│                          │                           │
    │                           │                          │                           │
    │                           │  2. Navigate to          │                           │
    │                           │     /api/auth/login      │                           │
    │                           ├─────────────────────────>│                           │
    │                           │                          │                           │
    │                           │                          │  3. Generate PKCE        │
    │                           │                          │     code_verifier +      │
    │                           │                          │     code_challenge       │
    │                           │                          │     Generate nonce       │
    │                           │                          │     Set pkce_verifier    │
    │                           │                          │     cookie (HttpOnly)    │
    │                           │                          │                           │
    │                           │  4. 302 Redirect to      │                           │
    │                           │     Keycloak auth URL    │                           │
    │                           │     with code_challenge, │                           │
    │                           │     state, nonce         │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  5. GET /auth?           │                           │
    │                           │     client_id=X&         │                           │
    │                           │     redirect_uri=Y&      │                           │
    │                           │     code_challenge=Z&    │                           │
    │                           │     nonce=ABC            │                           │
    │                           ├──────────────────────────┴──────────────────────────>│
    │                           │                                                      │
    │                           │  6. User sees Keycloak login page                   │
    │                           │     (username/password, 2FA, etc.)                  │
    │  7. Enter credentials     │                                                      │
    ├──────────────────────────┴──────────────────────────────────────────────────────>│
    │                                                                                  │
    │                                                  8. User authenticated           │
    │                                                     Server generates auth code   │
    │                                                                                  │
    │                           │  9. 302 Redirect to                                 │
    │                           │     backend callback                                │
    │                           │     with code & state                               │
    │                           │<─────────────────────────────────────────────────────┤
    │                           │                          │                           │
    │                           │  10. GET /api/auth/      │                           │
    │                           │      callback?code=XYZ&  │                           │
    │                           │      state=STATE         │                           │
    │                           ├─────────────────────────>│                           │
    │                           │                          │                           │
    │                           │                          │  11. Read pkce_verifier  │
    │                           │                          │      cookie, extract     │
    │                           │                          │      code_verifier       │
    │                           │                          │                           │
    │                           │                          │  12. POST /token         │
    │                           │                          │      grant_type:         │
    │                           │                          │        authorization_code │
    │                           │                          │      code: XYZ           │
    │                           │                          │      code_verifier: ***  │
    │                           │                          │      client_id: X        │
    │                           │                          │      client_secret: ***  │
    │                           │                          ├──────────────────────────>│
    │                           │                          │                           │
    │                           │                          │  13. Returns tokens:     │
    │                           │                          │      - access_token      │
    │                           │                          │      - refresh_token     │
    │                           │                          │      - id_token          │
    │                           │                          │<──────────────────────────┤
    │                           │                          │                           │
    │                           │                          │  14. openid-client       │
    │                           │                          │      validates id_token  │
    │                           │                          │      (signature, nonce)  │
    │                           │                          │                           │
    │                           │                          │  15. Set HttpOnly cookies│
    │                           │                          │      access_token        │
    │                           │                          │      refresh_token       │
    │                           │                          │      id_token            │
    │                           │                          │      csrf_token          │
    │                           │                          │                           │
    │                           │  16. 302 Redirect to     │                           │
    │                           │      frontend URL        │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  17. SPA mounts,         │                           │
    │                           │      calls /api/auth/me  │                           │
    │                           │      (cookies sent       │                           │
    │                           │       automatically)     │                           │
    │                           ├─────────────────────────>│                           │
    │                           │                          │                           │
    │                           │                          │  18. Validate            │
    │                           │                          │      access_token cookie │
    │                           │                          │      via JwtAuthGuard    │
    │                           │                          │                           │
    │                           │  19. Returns user        │                           │
    │                           │      profile data        │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  20. Update React state  │                           │
    │                           │      with user profile   │                           │
    │                           │                          │                           │
    │  21. Application loaded   │                          │                           │
    │     with user logged in   │                          │                           │
    │<──────────────────────────┤                          │                           │
    │                           │                          │                           │
```

**Key Steps Explained:**

- **Steps 1-5**: User clicks login, SPA navigates to backend `/auth/login`, backend generates PKCE code_verifier/challenge, stores verifier in HttpOnly cookie, redirects to Keycloak
- **Steps 6-8**: Keycloak authenticates user (login page, 2FA, etc.) and generates authorization code
- **Steps 9-14**: Keycloak redirects back to backend callback, backend reads PKCE cookie, exchanges code for tokens with code_verifier, `openid-client` validates ID token
- **Steps 15-20**: Backend sets HttpOnly auth cookies, redirects to frontend, SPA calls `/api/auth/me` to get user profile
- **Step 21**: User is authenticated, SPA can make API calls (cookies sent automatically)

### Token Refresh Flow

```
┌────────┐                 ┌─────────┐                ┌──────────┐                ┌──────────┐
│  User  │                 │   SPA   │                │  Backend │                │ Keycloak │
└───┬────┘                 └────┬────┘                └────┬─────┘                └────┬─────┘
    │                           │                          │                           │
    │                           │  1. Access token         │                           │
    │                           │     expired or about to  │                           │
    │                           │                          │                           │
    │                           │  2. POST /api/auth/      │                           │
    │                           │     refresh              │                           │
    │                           │     (refresh_token sent  │                           │
    │                           │      via HttpOnly cookie)│                           │
    │                           ├─────────────────────────>│                           │
    │                           │                          │                           │
    │                           │                          │  3. Read refresh_token   │
    │                           │                          │     from cookie          │
    │                           │                          │                           │
    │                           │                          │  4. POST /token          │
    │                           │                          │     grant_type:          │
    │                           │                          │       refresh_token      │
    │                           │                          │     refresh_token: ***   │
    │                           │                          │     client_id: X         │
    │                           │                          │     client_secret: ***   │
    │                           │                          ├──────────────────────────>│
    │                           │                          │                           │
    │                           │                          │  5. Validates refresh    │
    │                           │                          │     token, issues new    │
    │                           │                          │     access_token and     │
    │                           │                          │     (optionally) new     │
    │                           │                          │     refresh_token        │
    │                           │                          │<──────────────────────────┤
    │                           │                          │                           │
    │                           │                          │  6. Set new HttpOnly     │
    │                           │                          │     auth cookies         │
    │                           │                          │                           │
    │                           │  7. Returns { expires_in }                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  8. Update expires_at    │                           │
    │                           │     from expires_in,     │                           │
    │                           │     reset refresh timer  │                           │
    │                           │                          │                           │
    │  9. Continue using app    │                          │                           │
    │     with refreshed token  │                          │                           │
    │<──────────────────────────┤                          │                           │
    │                           │                          │                           │
```

**Refresh Triggers:**
- Proactive timer at 75% of token lifetime
- Visibility change listener when tab regains focus and token is near expiry
- 401 response interceptor in `apiService` (single-flight pattern)

**Note:** Keycloak may optionally rotate the refresh token on each refresh operation, which is a security best practice.

### Logout Sequence

```
┌────────┐                 ┌─────────┐                ┌──────────┐                ┌──────────┐
│  User  │                 │   SPA   │                │  Backend │                │ Keycloak │
└───┬────┘                 └────┬────┘                └────┬─────┘                └────┬─────┘
    │                           │                          │                           │
    │  1. Click "Logout"        │                          │                           │
    ├──────────────────────────>│                          │                           │
    │                           │                          │                           │
    │                           │  2. Clear user state     │                           │
    │                           │                          │                           │
    │                           │  3. Navigate to          │                           │
    │                           │     /api/auth/logout     │                           │
    │                           ├─────────────────────────>│                           │
    │                           │                          │                           │
    │                           │                          │  4. Read id_token        │
    │                           │                          │     from HttpOnly cookie │
    │                           │                          │     Clear all auth       │
    │                           │                          │     cookies              │
    │                           │                          │                           │
    │                           │  5. 302 Redirect to      │                           │
    │                           │     Keycloak logout      │                           │
    │                           │     with id_token_hint   │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  5. GET /logout?         │                           │
    │                           │     client_id=X&         │                           │
    │                           │     id_token_hint=JWT&   │                           │
    │                           │     post_logout_         │                           │
    │                           │     redirect_uri=SPA_URL │                           │
    │                           ├──────────────────────────┴──────────────────────────>│
    │                           │                                                      │
    │                           │  6. Keycloak invalidates session                    │
    │                           │                                                      │
    │                           │  7. 302 Redirect to post_logout_redirect_uri        │
    │                           │<─────────────────────────────────────────────────────┤
    │                           │                          │                           │
    │  8. User back at SPA      │                          │                           │
    │     in logged-out state   │                          │                           │
    │<──────────────────────────┤                          │                           │
    │                           │                          │                           │
```

**Important:** Even if the user closes the browser without logging out, the Keycloak session may remain active. Re-visiting the app and clicking "Login" may immediately authenticate without prompting for credentials (SSO behavior). To prevent this, always initiate the logout flow through Keycloak.

---

## Authorization & RBAC

### Role-Based Access Control

The system supports RBAC through Keycloak role claims embedded in access tokens. Roles can be enforced at multiple levels:

#### 1. Route-Level Protection

Using the `@Roles()` decorator:

```typescript
@Controller("documents")
export class DocumentController {
  @Get()
  @Roles("user", "viewer")  // Requires at least one of these roles
  async listDocuments() {
    // Only accessible to users with "user" OR "viewer" role
  }

  @Post()
  @Roles("admin", "editor")  // Requires at least one of these roles
  async createDocument() {
    // Only accessible to users with "admin" OR "editor" role
  }

  @Delete(":id")
  @Roles("admin")  // Requires specific role
  async deleteDocument() {
    // Only accessible to users with "admin" role
  }
}
```

#### 2. Service-Level Authorization

Access `request.user.roles` in service layers for fine-grained control:

```typescript
@Injectable()
export class DocumentService {
  async updateDocument(documentId: string, user: User) {
    const document = await this.findDocument(documentId);
    
    // Check if user owns the document or is admin
    if (document.ownerId !== user.sub && !user.roles.includes("admin")) {
      throw new ForbiddenException("You can only edit your own documents");
    }
    
    // Proceed with update
  }
}
```

#### 3. Keycloak Role Configuration

Roles are configured in Keycloak and can be:

**Realm Roles:**
- Global roles applicable across all clients
- Example: `admin`, `user`, `guest`

**Client Roles:**
- Specific to your OAuth client
- Example: `document-editor`, `workflow-viewer`

**Role Mapping:**
- Assigned to users or groups
- Can be static or dynamic (e.g., based on group membership)

**Token Structure:**
```json
{
  "sub": "user-uuid",
  "preferred_username": "john.doe",
  "email": "john.doe@example.com",
  "realm_access": {
    "roles": ["user", "offline_access"]
  },
  "resource_access": {
    "ai-ocr-client": {
      "roles": ["document-editor", "workflow-viewer"]
    }
  }
}
```

The `KeycloakJwtStrategy` normalizes these into `request.user.roles`:
```typescript
user.roles = ["user", "offline_access", "document-editor", "workflow-viewer"]
```

---

## API Key Authentication

In addition to OAuth, the system supports API key authentication for machine-to-machine communication.

### How It Works

Routes can be decorated with `@ApiKeyAuth()` to accept API keys:

```typescript
@Controller("webhooks")
export class WebhookController {
  @Post("process")
  @ApiKeyAuth()  // Allow API key auth for this route
  async handleWebhook() {
    // Accessible with API key or bearer token
  }
}
```

**Execution Flow:**

1. `JwtAuthGuard` checks if route has `@ApiKeyAuth()` and `X-API-Key` header present
2. If yes, skips JWT validation (delegates to `ApiKeyAuthGuard`)
3. `ApiKeyAuthGuard` validates the API key against database
4. Sets `request.user` with user info and roles from the API key record
5. `RolesGuard` can enforce roles — API keys inherit the creating user's roles at generation time

**Role Inheritance:**

When a user generates an API key, the key captures the user's current Keycloak roles (from their JWT). These roles are stored in the `api_keys` table and populated on `request.user.roles` during API key authentication. This means:

- API key-authenticated requests can pass `@Roles()` checks, provided the creating user had the required roles
- To update an API key's roles after a user's roles change in Keycloak, regenerate the API key

**Usage Example:**

```bash
# API call with API key
curl -X POST https://api.example.com/webhooks/process \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"event": "document.uploaded"}'

# API call with bearer token (still works)
curl -X POST https://api.example.com/webhooks/process \
  -H "Authorization: Bearer eyJhbGciOi..." \
  -H "Content-Type: application/json" \
  -d '{"event": "document.uploaded"}'
```

### API Key Management

API keys are managed through the `ApiKeyService`:

```typescript
@Injectable()
export class ApiKeyService {
  async validateApiKey(apiKey: string): Promise<{ userId: string; userEmail: string; roles: string[] } | null> {
    // Look up API key in database by prefix
    // Compare hash with bcrypt
    // Return user info and stored roles if valid, null otherwise
  }
}
```

**Database Schema:**

```prisma
model ApiKey {
  id         String    @id @default(cuid())
  key_hash   String    @unique
  key_prefix String
  user_id    String    @unique
  user_email String
  roles      String[]  @default([])
  created_at DateTime  @default(now())
  last_used  DateTime?

  @@map("api_keys")
}
```

**Best Practices:**
- API keys are stored hashed with bcrypt (cost factor 10) in the database
- The key prefix enables indexed lookups without full-table scans
- Roles are inherited from the creating user's JWT at generation time
- Regenerating a key captures the user's current roles
- Full API keys are returned only once at creation — they cannot be retrieved later

---

## Configuration

### Backend Environment Variables

```bash
# Keycloak Configuration
SSO_AUTH_SERVER_URL=https://keycloak.example.com/realms/my-realm
# OR
SSO_AUTH_SERVER_URL=https://keycloak.example.com/auth
SSO_REALM=my-realm

SSO_CLIENT_ID=ai-ocr-backend
SSO_CLIENT_SECRET=your-client-secret-here

# OAuth Callback & Redirects
SSO_REDIRECT_URI=https://api.example.com/api/auth/callback
SSO_POST_LOGOUT_REDIRECT_URI=https://app.example.com

# Frontend URL (for cookie redirect after OAuth callback)
FRONTEND_URL=https://app.example.com

# Environment (controls cookie Secure flag; 'development' or 'test' disables Secure)
NODE_ENV=production
```

**Important Configuration Notes:**

1. **SSO_AUTH_SERVER_URL Format:**
   - Can be full OIDC endpoint: `https://keycloak.example.com/realms/my-realm/protocol/openid-connect`
   - Or base realm URL: `https://keycloak.example.com/realms/my-realm`
   - The code auto-detects and adapts

2. **SSO_REDIRECT_URI:**
   - MUST match exactly what's configured in Keycloak client settings
   - Should be your backend callback endpoint: `https://your-backend/api/auth/callback`

3. **SSO_POST_LOGOUT_REDIRECT_URI:**
   - Where Keycloak redirects after logout
   - Typically your frontend home page

4. **NODE_ENV:**
   - Controls the `Secure` flag on auth cookies
   - Set to `development` or `test` to disable Secure (allows HTTP during development)
   - Any other value (including `production`) enables Secure (HTTPS only)

### Frontend Environment Variables

```bash
# API Base URL
VITE_API_BASE_URL=https://api.example.com

# OR for local development
VITE_API_BASE_URL=/api  # Relative URL, uses Vite proxy
```

**Frontend uses Vite's environment variable system:**
- Variables prefixed with `VITE_` are exposed to client
- Configured in `.env`, `.env.local`, etc.
- Example `.env.local`:
  ```
  VITE_API_BASE_URL=http://localhost:3002
  ```

### Keycloak Client Configuration

In Keycloak admin console, configure your client:

**Access Type:** `confidential`

**Valid Redirect URIs:**
```
https://api.example.com/api/auth/callback
http://localhost:3002/api/auth/callback  # For development
```

**Valid Post Logout Redirect URIs:**
```
https://app.example.com
http://localhost:3000  # For development
```

**Web Origins:**
```
https://app.example.com
http://localhost:3000  # For development
```

**Scopes:**
- `openid` (required)
- `profile` (for name, username)
- `email` (for email address)

**Advanced Settings:**
- **Access Token Lifespan**: 5-60 minutes (recommend 15 minutes)
- **SSO Session Idle**: 30 minutes
- **SSO Session Max**: 10 hours
- **Refresh Token Enabled**: Yes
- **Refresh Token Reuse**: Disabled (for rotation)

---

## Security Considerations

### Token Storage

**Approach: HttpOnly Cookies**

Tokens are stored in HttpOnly cookies, making them inaccessible to JavaScript:

| Cookie | HttpOnly | SameSite | Path | TTL |
|--------|----------|----------|------|-----|
| `access_token` | Yes | Lax | `/` | Token lifetime |
| `refresh_token` | Yes | Lax | `/api/auth/refresh` | 30 days |
| `id_token` | Yes | Lax | `/api/auth` | Token lifetime |
| `csrf_token` | **No** | Strict | `/` | Token lifetime |

**Security Properties:**
- **XSS Protection**: HttpOnly flag prevents JavaScript from reading tokens, eliminating XSS-based token theft
- **Automatic Transmission**: Browser sends cookies with same-origin requests without manual intervention
- **Scoped Paths**: `refresh_token` only sent to `/api/auth/refresh`; `id_token` only sent to `/api/auth` routes
- **Secure Flag**: Enabled in production (HTTPS only), disabled in development/test
- **No localStorage**: No tokens stored in any JavaScript-accessible storage

### CSRF Protection

**Double-Submit Cookie Pattern:**
- A `csrf_token` cookie (NOT HttpOnly) is set during login and refresh
- The frontend reads this cookie and sends its value as an `X-CSRF-Token` header on state-changing requests (POST, PUT, DELETE)
- The `CsrfGuard` compares the header value to the cookie value
- A cross-origin attacker cannot read the cookie to forge the header

**CSRF Exemptions:**
- GET, HEAD, OPTIONS requests (safe methods)
- Requests with `Authorization: Bearer` header (not cookie-authenticated)
- Requests with `X-API-Key` header (API key authenticated)

### Refresh Endpoint Security Model

The `POST /api/auth/refresh` endpoint is marked `@Public()` because the access token may be expired when refresh is called — `JwtAuthGuard` is intentionally skipped. The endpoint's security relies on:

1. **Refresh token cookie** — The refresh token must be present in an HttpOnly cookie scoped to `/api/auth/refresh`. This cookie is not accessible to JavaScript and is only sent to this specific path.
2. **CSRF guard** — The `CsrfGuard` validates the double-submit CSRF token on the request, preventing cross-site request forgery.
3. **SameSite cookie policy** — The `Lax` SameSite attribute on the refresh token cookie prevents it from being sent on cross-origin sub-requests.
4. **Rate limiting** — The endpoint is rate-limited to 5 requests per minute per IP via `@Throttle()`, preventing brute-force and abuse.

**Architectural rationale:** This is an inherent trade-off in cookie-based OAuth implementations. The refresh endpoint cannot require a valid access token (since the whole point is to obtain a new one when the current one has expired). CSRF protection, cookie scoping, and rate limiting together provide strong defense against unauthorized refresh attempts.

### Error Handling in Auth Service

Authentication error responses return **generic messages** to prevent information disclosure:

| Error Scenario | Client-Facing Message | HTTP Status |
|---|---|---|
| OAuth callback failure | `"Authentication failed"` | 400 |
| Token refresh failure | `"Token refresh failed"` | 400 |
| Callback error (controller) | Redirect to `FRONTEND_URL?auth_error=callback_failed` | 302 |

Full error details (Keycloak error codes, token endpoint URLs, internal state) are logged server-side via `Logger.error()` with stack traces, but are never exposed to clients. This prevents attackers from using error messages for reconnaissance (e.g., differentiating between expired, revoked, and invalid tokens).

### Token Validation

**Backend Validation (Critical):**
- Every access token validated via Passport JWT strategy using JWKS signature verification
- Issuer and audience claims checked
- Token expiry enforced
- Cookie-first extraction with Bearer header fallback

**Frontend Validation:**
- Frontend never sees raw tokens
- User profile comes from the `/api/auth/me` endpoint, which requires valid JWT

### Secrets Management

**Never Commit Secrets:**
- Use `.env` files (excluded from git)
- Use environment variables in CI/CD
- Use secret management services (AWS Secrets Manager, Azure Key Vault, etc.)

**Client Secret:**
- Only stored on backend
- Never exposed to frontend
- Used for token exchange and refresh via `openid-client`

### HTTPS Requirement

**All OAuth Endpoints MUST Use HTTPS:**
- Tokens transmitted in clear text over HTTP are vulnerable
- Keycloak will reject non-HTTPS redirect URIs in production
- Use Let's Encrypt or similar for free SSL certificates

**Development Exception:**
- `localhost` is exempt from HTTPS requirement
- Never use HTTP in production

### Role Privilege Escalation

**Prevent Privilege Escalation:**
- Validate all role checks server-side
- Never trust client-provided roles
- Use principle of least privilege (assign minimal roles needed)

**Example Vulnerability:**
```typescript
// WRONG: Trusting client-provided role
@Post("admin/users")
async createUser(@Body() body: { role: string }) {
  // Attacker could send role: "admin"
  await this.userService.createWithRole(body.role);
}

// CORRECT: Enforce role on controller
@Post("admin/users")
@Roles("admin")
async createUser(@Body() body: CreateUserDto) {
  // request.user.roles already validated by RolesGuard
  await this.userService.create(body);
}
```

### Session Fixation

**Not Vulnerable:**
- OAuth flow generates new tokens on each login
- PKCE state stored in short-lived HttpOnly cookie (2 min TTL)
- PKCE cookie consumed and cleared immediately after use
- New CSRF token generated on every login and refresh

### Token Leakage

**Mitigations:**
- Tokens never in URLs — no auth_result UUID or token query parameters
- Tokens stored in HttpOnly cookies, inaccessible to JavaScript
- Access tokens short-lived (configurable, default 15 min)
- Refresh tokens require client secret to use
- JWKS signature verification prevents token forgery
- Cookie paths scoped to minimize exposure (e.g., refresh_token only sent to `/api/auth/refresh`)

---

## Development Guide

### Local Development Setup

1. **Start Keycloak:**
   ```bash
   docker run -p 8080:8080 \
     -e KEYCLOAK_ADMIN=admin \
     -e KEYCLOAK_ADMIN_PASSWORD=admin \
     quay.io/keycloak/keycloak:latest start-dev
   ```

2. **Configure Keycloak:**
   - Create realm: `ai-ocr`
   - Create client: `ai-ocr-backend`, Access Type: `confidential`
   - Set redirect URI: `http://localhost:3002/api/auth/callback`
   - Create test user with roles

3. **Backend `.env`:**
   ```bash
   SSO_AUTH_SERVER_URL=http://localhost:8080/realms/ai-ocr
   SSO_REALM=ai-ocr
   SSO_CLIENT_ID=ai-ocr-backend
   SSO_CLIENT_SECRET=<copy-from-keycloak-credentials-tab>
   SSO_REDIRECT_URI=http://localhost:3002/api/auth/callback
   SSO_POST_LOGOUT_REDIRECT_URI=http://localhost:3000
   FRONTEND_URL=http://localhost:3000
   ```

4. **Frontend `.env.local`:**
   ```bash
   VITE_API_BASE_URL=http://localhost:3002
   ```

5. **Start Services:**
   ```bash
   # Backend
   cd apps/backend-services
   npm install
   npm run start:dev

   # Frontend
   cd apps/frontend
   npm install
   npm run dev
   ```

6. **Test Login:**
   - Navigate to `http://localhost:3000`
   - Click login button
   - Should redirect to Keycloak, then back to app with tokens

### Debugging Auth Issues

**Enable Verbose Logging:**

Backend (`auth.controller.ts`):
```typescript
private readonly logger = new Logger(AuthController.name);

async oauthCallback(query, req, res) {
  this.logger.log(`Callback received: code=${query.code.substring(0, 10)}...`);
  // ... existing logic
}
```

Frontend (`AuthContext.tsx`):
```typescript
const checkAuthStatus = async () => {
  console.log("Checking auth status via /api/auth/me");
  // ... /me call
  console.log("Auth check result:", user ? "authenticated" : "not authenticated");
};
```

**Common Issues:**

1. **"PKCE verifier missing or expired"**
   - PKCE cookie expired (2-minute TTL) — user took too long on Keycloak login
   - Browser blocked third-party cookies
   - Solution: Retry login; ensure same-origin cookie settings are correct

2. **"State mismatch — possible CSRF"**
   - State in callback URL doesn't match state in PKCE cookie
   - Possible CSRF attack or stale browser tab
   - Solution: Retry login from a fresh page

3. **"callback_failed" redirect**
   - PKCE code verifier mismatch
   - Missing `iss` parameter when Keycloak requires it
   - Solution: Check backend logs for detailed error

4. **"Invalid token" on API calls**
   - Token expired (check cookie expiry)
   - Token signature invalid (Keycloak keys rotated)
   - Wrong audience/issuer (config mismatch)
   - Solution: Check token in [jwt.io](https://jwt.io), compare issuer/aud with config

5. **"CSRF token validation failed"**
   - Frontend not sending `X-CSRF-Token` header on POST/PUT/DELETE requests
   - csrf_token cookie missing or expired
   - Solution: Check that `getCsrfToken()` reads the cookie correctly, verify `withCredentials: true` is set

6. **"Insufficient permissions"**
   - User lacks required roles
   - Solution: Check `request.user.roles` in backend, assign roles in Keycloak

7. **Infinite redirect loop**
   - Redirect URI mismatch (Keycloak config vs `SSO_REDIRECT_URI`)
   - Solution: Ensure exact match, including protocol and port

### Testing Auth Flow

**Manual Test:**
```bash
# 1. Start login (follow the redirect in a browser)
curl -v http://localhost:3002/api/auth/login

# 2. Complete Keycloak login in browser
# After login, browser redirects to callback, callback sets cookies and redirects to frontend

# 3. Check auth status (cookies are in browser, use browser DevTools or curl with cookie jar)
curl -b cookies.txt http://localhost:3002/api/auth/me

# 4. Test API call (cookies sent automatically)
curl -b cookies.txt http://localhost:3002/api/documents

# 5. Test with Bearer token (fallback auth method)
curl http://localhost:3002/api/documents \
  -H "Authorization: Bearer ACCESS_TOKEN_HERE"
```

**Automated Test:**
```typescript
// Example integration test (pseudo-code)
describe("OAuth Flow", () => {
  it("should complete full login flow", async () => {
    // 1. Start login
    const loginRes = await request(app).get("/api/auth/login");
    expect(loginRes.status).toBe(302);
    // Login response sets pkce_verifier cookie
    
    // 2. Simulate Keycloak callback (requires test double or actual Keycloak)
    const callbackRes = await request(app)
      .get("/api/auth/callback")
      .set("Cookie", pkceCookie)
      .query({ code: "test-code", state: pkceState });
    
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toBe("http://localhost:3000");
    // Response sets auth cookies
    
    // 3. Check user profile
    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", authCookies);
    
    expect(meRes.body).toHaveProperty("sub");
    expect(meRes.body).toHaveProperty("roles");
  });
});
```

---

## Summary

This application implements a **secure, backend-driven OAuth 2.0 Authorization Code flow with PKCE** with:

**Key Features:**
- Confidential client architecture (secrets never exposed)
- PKCE protection on authorization code exchange
- HttpOnly cookie-based token storage (XSS immune)
- CSRF double-submit cookie protection
- JWKS-based token signature verification
- Role-based access control (RBAC)
- Automatic proactive token refresh (75% of lifetime)
- `/api/auth/me` endpoint for stateless profile retrieval
- Cookie-first JWT extraction with Bearer header fallback
- Alternative API key authentication for machine-to-machine

**Technology Stack:**
- Backend: NestJS + `openid-client` + `passport-jwt` + `cookie-parser`
- Frontend: React + Axios (`withCredentials: true`)
- Identity Provider: Keycloak (OpenID Connect)

**Security Layers:**
1. HTTPS transport encryption
2. PKCE code challenge/verifier
3. Nonce validation via openid-client (replay protection)
4. Token signature verification (JWKS)
5. Issuer/audience claim validation
6. HttpOnly cookies (XSS protection)
7. CSRF double-submit cookie pattern
8. Refresh token rotation
9. Role-based authorization

This architecture provides a robust foundation for secure authentication while keeping both the frontend and backend stateless, with no server-side session storage required for horizontal scaling.
