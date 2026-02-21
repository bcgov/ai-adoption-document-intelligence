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
- **Stateless Frontend**: The SPA stores only provider-issued tokens; no application-specific sessions
- **Token Transparency**: Provider tokens are passed through to the frontend for direct API authentication
- **Defense-in-Depth**: Multiple security layers including state tokens, nonce validation, JWKS verification, and RBAC

---

## OAuth 2.0 Flow Type

### Authorization Code Flow with PKCE-Ready Architecture

The implementation uses the **OAuth 2.0 Authorization Code Flow**, which is the most secure flow for web applications with a backend:

**Flow Characteristics:**
- **Confidential Client**: Backend holds the `client_secret` and exchanges authorization codes server-to-server
- **State Parameter**: Signed JWT with embedded nonce to prevent CSRF and replay attacks
- **Nonce Validation**: ID token nonce is validated against the state to ensure response freshness
- **PKCE-Ready**: Code verifier parameter support is present in `exchangeCodeForTokens()` for future enhancement
- **Token Storage**: Provider tokens stored in browser `localStorage` for persistence across sessions
- **Refresh Token Rotation**: Supports refresh token grant for extending sessions without re-authentication

**Why This Flow?**
- Prevents token leakage in browser history (tokens never in URL)
- Client secret never exposed to browser
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
│  │  │  - Token Storage (localStorage)                               │   │  │
│  │  │  - Automatic Refresh Logic                                    │   │  │
│  │  │  - Auth Result Handling                                       │   │  │
│  │  │  - Profile Decoding (ID Token)                                │   │  │
│  │  └──────────────────────────────────────────────────────────────┘   │  │
│  │                              │                                         │  │
│  │                              ▼                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────┐   │  │
│  │  │             API Service (axios)                               │   │  │
│  │  │  - Injects: Authorization: Bearer {access_token}              │   │  │
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
│  │  │  - GET  /api/auth/result                                    │   │    │
│  │  │  - POST /api/auth/refresh                                   │   │    │
│  │  │  - GET  /api/auth/logout                                    │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  │                              │                                      │    │
│  │                              ▼                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │            Auth Service                                     │   │    │
│  │  │  - URL Construction (Keycloak endpoints)                    │   │    │
│  │  │  - State Token Creation/Verification (JWT)                  │   │    │
│  │  │  - Code → Token Exchange                                    │   │    │
│  │  │  - ID Token Nonce Validation (JWKS)                         │   │    │
│  │  │  - Refresh Token Proxying                                   │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  │                              │                                      │    │
│  │                              ▼                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │        AuthSessionStore (In-Memory)                         │   │    │
│  │  │  - Short-lived token cache (60s TTL)                        │   │    │
│  │  │  - One-time consumption pattern                             │   │    │
│  │  │  - Background cleanup sweeper                               │   │    │
│  │  └────────────────────────────────────────────────────────────┘   │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                  Global Guards (APP_GUARD)                          │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐   │    │
│  │  │        BCGovAuthGuard (Bearer Token Validation)             │   │    │
│  │  │  - Skips @Public routes                                     │   │    │
│  │  │  - Extracts Bearer token from Authorization header          │   │    │
│  │  │  - Validates token via JWKS (RS256)                         │   │    │
│  │  │  - Verifies issuer & audience                               │   │    │
│  │  │  - Normalizes Keycloak roles into request.user              │   │    │
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
| `jsonwebtoken` | 9.0.2 | JWT signing, verification, and decoding |
| `jwks-rsa` | 3.2.0 | Fetches and caches Keycloak's public signing keys |
| `axios` | 1.13.2 | HTTP client for Keycloak token endpoint |
| `class-validator` | 0.14.3 | DTO validation for all auth routes |
| `class-transformer` | 0.5.1 | DTO transformation |

**Key Backend Libraries Explained:**

- **`jsonwebtoken`**: Signs the state token, verifies state on callback, and validates ID token nonces
- **`jwks-rsa`**: Automates fetching Keycloak's public keys from the JWKS endpoint for RS256 signature verification
- **`axios`**: Performs server-to-server calls to Keycloak's token endpoint (code exchange, refresh)
- **`class-validator`**: Ensures all incoming OAuth callback parameters and request bodies are well-formed

### Frontend Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `react` | 19.2.0 | UI framework |
| `react-router-dom` | 7.9.6 | Client-side routing |
| `axios` | 1.13.2 | HTTP client for backend API calls |
| `oidc-client-ts` | 3.4.1 | OIDC utilities (currently unused, legacy) |

**Frontend Implementation Notes:**

- **No OIDC client library actively used**: The frontend relies on the backend to handle all OAuth interactions
- **`oidc-client-ts` is present but not actively used**: Previously considered for client-side OIDC, superseded by backend-driven approach
- **Token storage**: Uses native `localStorage` API for token persistence
- **Token decoding**: Uses browser native `atob()` for base64 decoding of ID token payload

---

## Backend Implementation

### Module Structure

```
apps/backend-services/src/auth/
├── auth.module.ts              # Module definition with global guards
├── auth.controller.ts          # Public HTTP endpoints for OAuth flow
├── auth.service.ts             # Core OAuth orchestration logic
├── auth-session.store.ts       # In-memory result cache
├── bcgov-auth.guard.ts         # Bearer token validation guard
├── api-key-auth.guard.ts       # API key validation guard
├── roles.guard.ts              # RBAC enforcement guard
├── public.decorator.ts         # @Public() metadata
├── roles.decorator.ts          # @Roles(...) metadata
├── api-key-auth.decorator.ts   # @ApiKeyAuth() metadata
└── dto/
    ├── token-response.dto.ts         # Keycloak token response structure
    ├── refresh-token.dto.ts          # Refresh request/response DTOs
    ├── oauth-callback-query.dto.ts   # Callback query parameters
    ├── auth-result-query.dto.ts      # Result endpoint query
    └── logout-query.dto.ts           # Logout query parameters
```

### Core Components

#### 1. **AuthService** (`auth.service.ts`)

The central orchestrator for the OAuth flow. Key responsibilities:

**Initialization:**
```typescript
constructor(
  private configService: ConfigService,
  private authSessionStore: AuthSessionStore,
)
```

- Constructs Keycloak endpoint URLs from environment variables
- Initializes JWKS client for public key caching
- Validates required configuration on startup

**Key Methods:**

| Method | Purpose |
|--------|---------|
| `getLoginUrl()` | Generates authorization URL with signed state token and nonce |
| `handleCallback(code, state, iss?)` | Validates PKCE state, exchanges code for tokens via openid-client, validates ID token, stores result. The `iss` parameter is required when Keycloak advertises `authorization_response_iss_parameter_supported` |
| `refreshAccessToken(refreshToken)` | Proxies refresh token grant to Keycloak via openid-client |
| `refreshAccessToken(refreshToken)` | Proxies refresh token to Keycloak |
| `consumeAuthResult(resultId)` | One-time read of stored tokens |
| `getLogoutUrl(idTokenHint?)` | Constructs Keycloak logout URL |

**State Token Security:**
```typescript
private createStateToken(): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const payload = { nonce };
  
  const state = jwt.sign(payload, this.stateSecret, {
    expiresIn: "5m",
    audience: this.clientId,
    issuer: "auth-service",
  });
  
  return { state, nonce };
}
```

- State is a JWT signed with `AUTH_STATE_SECRET`
- Contains a cryptographically random nonce
- Expires in 5 minutes (short-lived to prevent replay)
- Verified on callback with issuer/audience checks

**ID Token Validation:**
```typescript
private async validateIdTokenNonce(
  idToken: string,
  expectedNonce: string,
): Promise<void> {
  const decoded = jwt.decode(idToken, { complete: true });
  const key = await this.jwksClient.getSigningKey(decoded.header.kid);
  const signingKey = key.getPublicKey();
  
  const verified = jwt.verify(idToken, signingKey, {
    algorithms: ["RS256"],
    issuer: this.issuer,
    audience: this.clientId,
  }) as jwt.JwtPayload;
  
  if (verified.nonce !== expectedNonce) {
    throw new Error("Nonce mismatch");
  }
}
```

- Fetches Keycloak's public key using `kid` from token header
- Verifies signature using RS256 algorithm
- Validates issuer and audience claims
- Ensures nonce matches what was sent in authorization request

#### 2. **AuthController** (`auth.controller.ts`)

Thin HTTP layer exposing OAuth entrypoints. All routes are marked `@Public()` because they're part of the authentication flow itself.

**Routes:**

```typescript
// 1. Login Initiation
@Get("login")
async getLoginUrl(@Res() res: Response) {
  const loginUrl = this.authService.getLoginUrl();
  res.redirect(loginUrl);  // 302 redirect to Keycloak
}

// 2. OAuth Callback Handler
@Get("callback")
async oauthCallback(
  @Query() query: OAuthCallbackQueryDto,  // { code, state, iss?, session_state? }
  @Res() res: Response,
) {
  const resultId = await this.authService.handleCallback(query.code, query.state, query.iss);
  const redirectUrl = this.authService.buildAuthResultRedirect(resultId);
  return res.redirect(redirectUrl);  // Redirect to SPA with ?auth_result=uuid
}

// 3. Token Result Consumption
@Get("result")
async consumeResult(
  @Query() query: AuthResultQueryDto,  // { result }
): Promise<TokenResponseDto> {
  return this.authService.consumeAuthResult(query.result);
}

// 4. Token Refresh
@Post("refresh")
async refreshToken(@Body() body: RefreshTokenDto): Promise<RefreshReturnDto> {
  const tokens = await this.authService.refreshAccessToken(body.refresh_token);
  return { ...tokens };
}

// 5. Logout Initiation
@Get("logout")
async logout(@Query() query: LogoutQueryDto, @Res() res: Response) {
  const logoutUrl = this.authService.getLogoutUrl(query.id_token_hint);
  res.redirect(logoutUrl);  // 302 redirect to Keycloak logout
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
  @IsJWT()
  @ApiProperty()
  state!: string;

  @IsOptional()
  @IsString()
  @ApiProperty()
  session_state?: string;
}
```

#### 3. **AuthSessionStore** (`auth-session.store.ts`)

In-memory cache for short-lived auth results. Design goals:
- Prevent tokens from appearing in browser URLs
- One-time consumption pattern (tokens can't be redeemed twice)
- Automatic cleanup of expired entries

```typescript
@Injectable()
export class AuthSessionStore {
  private readonly ttlMs: number;
  private readonly store = new Map<string, StoredTokens>();

  constructor(private configService: ConfigService) {
    const ttlSeconds = Number(
      this.configService.get<string>("AUTH_RESULT_TTL_SECONDS") ?? "60",
    );
    this.ttlMs = ttlSeconds * 1000;
    
    // Background cleanup every TTL interval
    setInterval(() => this.cleanupExpired(), this.ttlMs).unref();
  }

  save(tokens: TokenResponseDto): string {
    const id = randomUUID();
    this.store.set(id, {
      tokens,
      expiresAt: Date.now() + this.ttlMs,
    });
    return id;
  }

  consume(id: string): TokenResponseDto {
    const entry = this.store.get(id);
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(id);
      throw new NotFoundException("Auth result expired or invalid");
    }
    this.store.delete(id);  // One-time consumption
    return entry.tokens;
  }
}
```

**Important:** This is in-memory, so:
- Entries lost on server restart
- Not suitable for horizontally scaled deployments without sticky sessions
- Could be replaced with Redis for production multi-instance setups

#### 4. **BCGovAuthGuard** (`bcgov-auth.guard.ts`)

Global guard that validates bearer tokens on all routes except those marked `@Public()`.

**Flow:**

1. Check if route is `@Public()` → skip validation
2. Check if route allows `@ApiKeyAuth()` and API key present → skip  (ApiKeyAuthGuard handles it)
3. Extract `Authorization: Bearer {token}` header
4. Decode token header to get `kid` (key ID)
5. Fetch corresponding public key from Keycloak JWKS endpoint
6. Verify token signature with RS256
7. Validate `issuer` and `audience` claims
8. Normalize Keycloak role claims into `request.user.roles[]`
9. Attach `user` object to request for downstream use

```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);

  if (isPublic) {
    return true;
  }

  const request = context.switchToHttp().getRequest<Request>();
  const authHeader = request.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedException("No Bearer token provided");
  }

  const token = authHeader.substring(7);
  
  try {
    const user = await this.validateToken(token);
    request.user = user;  // Attach user to request
    return true;
  } catch {
    throw new ForbiddenException("Invalid token");
  }
}
```

**Token Validation Logic:**

```typescript
private async validateToken(token: string): Promise<User> {
  // Decode token header to get key ID (kid)
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header.kid) {
    throw new UnauthorizedException("Invalid token format");
  }

  // Fetch public key from JWKS endpoint (cached for 24h)
  const key = await this.jwksClient.getSigningKey(decoded.header.kid);
  const signingKey = key.getPublicKey();

  // Verify signature and claims
  const verified = jwt.verify(token, signingKey, {
    algorithms: ["RS256"],
    issuer: expectedIssuer,
    audience: this.clientId,
  }) as jwt.JwtPayload & User;

  // Normalize Keycloak roles from multiple sources
  const normalizedRoles = this.extractRoles(verified);

  return {
    ...verified,
    roles: normalizedRoles,
  };
}
```

**Role Normalization:**

Keycloak can embed roles in multiple JWT claims:
- `roles[]` (top-level)
- `realm_access.roles[]` (realm-level roles)
- `resource_access.<client-id>.roles[]` (client-specific roles)

The guard normalizes all of these into a single `user.roles[]` array:

```typescript
private extractRoles(payload: jwt.JwtPayload): string[] {
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

RBAC enforcement guard that runs after `BCGovAuthGuard`. It checks the `@Roles()` decorator and ensures `request.user.roles` contains at least one required role.

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

Global guards are registered via `APP_GUARD` provider token, which applies them to all routes automatically:

```typescript
@Module({
  imports: [ConfigModule, ApiKeyModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthSessionStore,
    {
      provide: APP_GUARD,
      useClass: BCGovAuthGuard,  // Validates bearer tokens first
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyAuthGuard,  // Handles API key auth
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,  // Enforces @Roles decorator last
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
```

**Guard Execution Order:**
1. `BCGovAuthGuard` → Validates bearer token → Sets `request.user`
2. `ApiKeyAuthGuard` → Validates API key (if applicable) → Sets `request.user`
3. `RolesGuard` → Checks `@Roles()` decorator → Validates `request.user.roles`

### Security Mechanisms

#### CSRF Protection (State Token)

The `state` parameter is a signed JWT that:
- Prevents CSRF by binding the authorization request to the callback
- Contains a cryptographic nonce that must match the ID token
- Expires in 5 minutes to prevent replay attacks
- Uses `AUTH_STATE_SECRET` (defaults to client secret) for signing

#### Nonce Validation

The nonce from the state token is validated against the ID token:
```typescript
if (verified.nonce !== expectedNonce) {
  throw new Error("Nonce mismatch");
}
```

This ensures:
- The ID token was issued in response to our specific authorization request
- Protects against token replay attacks
- Provides request-response binding

#### Token Signature Verification (JWKS)

All bearer tokens are verified using Keycloak's public keys:
- Keys fetched from `/protocol/openid-connect/certs` (JWKS endpoint)
- Cached for 24 hours for performance
- RS256 asymmetric signature verification
- Validates `issuer` and `audience` claims

#### Short-Lived Auth Results

The `AuthSessionStore` provides a brief window (60s default) for the SPA to redeem tokens:
- Prevents long-lived result IDs from being exploited
- One-time consumption pattern prevents replay
- Background cleanup prevents memory leaks

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
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
}

interface AuthUser {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_at?: number;
  profile?: {
    name?: string;
    preferred_username?: string;
    email?: string;
    [key: string]: unknown;
  };
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => void;
  getAccessToken: () => string | null;
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
  const handledAuthResultIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const initAuth = async () => {
      try {
        await restoreStoredTokens();      // Rehydrate from localStorage
        await handleAuthResultFromUrl();  // Check for ?auth_result= param
      } catch {
        localStorage.removeItem("auth_tokens");
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // Automatically inject token into API service when user changes
  useEffect(() => {
    apiService.setAuthToken(user?.access_token ?? null);
  }, [user?.access_token]);

  // ... context value and return
};
```

**Key Behaviors:**
- Runs once on mount
- Attempts to restore previous session from `localStorage`
- Checks URL for OAuth redirect (`?auth_result=`)
- Sets `isLoading = false` when complete
- Automatically updates `apiService` with latest access token

### Token Management

#### Storage Strategy

Tokens are stored in `localStorage` as a JSON string:

```typescript
const persistTokens = async (tokens: TokenResponse) => {
  const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;
  const tokenData = { ...tokens, expires_at: expiresAt };
  localStorage.setItem("auth_tokens", JSON.stringify(tokenData));
  
  const userData = await decodeAndCreateUser(tokenData);
  setUser(userData);
};
```

**Why `localStorage`?**
- Persists across browser sessions (unlike `sessionStorage`)
- Simple API, no dependencies
- Allows the backend to be truly stateless
- Can be easily migrated to `sessionStorage` or `IndexedDB` if needed

**Storage Format:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "expires_at": 1707678234
}
```

#### Token Restoration

On app load, the provider attempts to restore tokens:

```typescript
const restoreStoredTokens = async () => {
  const storedTokens = localStorage.getItem("auth_tokens");
  if (!storedTokens) {
    return;
  }

  const tokens: TokenResponse & { expires_at?: number } = JSON.parse(storedTokens);
  const now = Math.floor(Date.now() / 1000);

  // If token still valid, use it
  if (tokens.expires_at && tokens.expires_at > now) {
    const userData = await decodeAndCreateUser(tokens);
    setUser(userData);
    return;
  }

  // If expired but refresh token available, refresh
  if (tokens.refresh_token) {
    try {
      await refreshToken();
    } catch {
      // Refresh failed, clear tokens
      localStorage.removeItem("auth_tokens");
      setUser(null);
    }
  } else {
    // No way to refresh, clear tokens
    localStorage.removeItem("auth_tokens");
    setUser(null);
  }
};
```

**Restoration Logic:**
1. Check if tokens exist in `localStorage`
2. If access token not expired → use it
3. If expired but refresh token present → automatically refresh
4. If refresh fails or no refresh token → clear storage, user must re-login

#### Profile Decoding

The ID token is decoded client-side to extract profile information:

```typescript
const decodeAndCreateUser = async (
  tokens: TokenResponse & { expires_at?: number },
): Promise<AuthUser> => {
  let profilePayload: Record<string, unknown> | undefined;

  if (tokens.id_token) {
    try {
      const base64Payload = tokens.id_token.split(".")[1];
      if (base64Payload) {
        // Base64URL decoding
        const normalized = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(
          normalized.length + ((4 - (normalized.length % 4)) % 4),
          "=",
        );
        profilePayload = JSON.parse(atob(padded));
      }
    } catch {
      // Ignore parsing errors - profile is optional
    }
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    id_token: tokens.id_token,
    expires_at: tokens.expires_at,
    profile: profilePayload ? {
      name: profilePayload.name as string | undefined,
      preferred_username: profilePayload.preferred_username as string | undefined,
      email: profilePayload.email as string | undefined,
      ...profilePayload,
    } : undefined,
  };
};
```

**Note:** This is purely for UI convenience (displaying username, email). The backend never trusts client-decoded claims; it always validates tokens server-side.

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

#### Auth Result Handling

After OAuth redirect, the backend returns the user to the SPA with `?auth_result=<uuid>`:

```typescript
const handleAuthResultFromUrl = async () => {
  const url = new URL(window.location.href);
  const authResult = url.searchParams.get("auth_result");

  if (!authResult) {
    return;
  }

  // Prevent React StrictMode double-execution from consuming result twice
  if (handledAuthResultIdsRef.current.has(authResult)) {
    return;
  }
  handledAuthResultIdsRef.current.add(authResult);

  try {
    // Exchange result ID for tokens
    const response = await axios.get<TokenResponse>(
      `${apiBaseUrl}/auth/result`,
      { params: { result: authResult } },
    );

    await persistTokens(response.data);
  } catch {
    localStorage.removeItem("auth_tokens");
    setUser(null);
  } finally {
    // Clean URL without reload
    url.searchParams.delete("auth_result");
    updateBrowserUrl(url);
  }
};
```

**React StrictMode Protection:**
- Uses `useRef` to track handled result IDs
- Prevents double-invocation in development mode from consuming result twice
- Important because `AuthSessionStore.consume()` is one-time use

**URL Cleanup:**

```typescript
const updateBrowserUrl = (url: URL) => {
  const newSearch = url.searchParams.toString();
  window.history.replaceState(
    {},
    document.title,
    `${url.pathname}${newSearch ? `?${newSearch}` : ""}${url.hash}`,
  );
};
```

Uses `history.replaceState()` to remove `?auth_result=` from URL without page reload, keeping the browser history clean.

#### Token Refresh

The refresh function proxies the refresh token to the backend:

```typescript
const refreshToken = async (): Promise<void> => {
  try {
    const storedTokens = localStorage.getItem("auth_tokens");
    if (!storedTokens) {
      throw new Error("No tokens to refresh");
    }

    const tokens = JSON.parse(storedTokens);
    if (!tokens.refresh_token) {
      throw new Error("No refresh token available");
    }

    const response = await axios.post<TokenResponse>(
      `${apiBaseUrl}/auth/refresh`,
      { refresh_token: tokens.refresh_token },
    );

    await persistTokens(response.data);
  } catch (error) {
    // Clear invalid tokens
    localStorage.removeItem("auth_tokens");
    setUser(null);
    throw error;
  }
};
```

**When is Refresh Triggered?**
- Automatically on app load if access token expired
- Can be manually triggered by components (e.g., API interceptors)
- After refresh failure, user must re-login

#### Logout

The logout function clears local state and redirects to Keycloak logout:

```typescript
const logout = () => {
  const idTokenHint = user?.id_token;
  setUser(null);
  localStorage.removeItem("auth_tokens");
  
  const logoutUrl = idTokenHint
    ? `${apiBaseUrl}/auth/logout?id_token_hint=${encodeURIComponent(idTokenHint)}`
    : `${apiBaseUrl}/auth/logout`;
  
  window.location.href = logoutUrl;
};
```

**ID Token Hint:**
- Sent to Keycloak to identify the session to terminate
- Optional but recommended for clean logout
- Keycloak will invalidate the session and redirect back to `SSO_POST_LOGOUT_REDIRECT_URI`

### API Integration

The auth context automatically injects the access token into all API calls via `apiService`:

```typescript
useEffect(() => {
  apiService.setAuthToken(user?.access_token ?? null);
}, [user?.access_token]);
```

The `apiService` (from `api.service.ts`) then adds the `Authorization` header:

```typescript
// Example implementation in api.service.ts
class ApiService {
  private authToken: string | null = null;

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  request(config: AxiosRequestConfig) {
    if (this.authToken) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${this.authToken}`,
      };
    }
    return axios.request(config);
  }
}
```

This ensures all API calls are automatically authenticated without manual token management in components.

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
- `user`: Current user object with tokens and profile
- `login()`: Initiates login flow
- `logout()`: Clears session and redirects to Keycloak logout
- `getAccessToken()`: Returns current access token or null
- `refreshToken()`: Manually triggers token refresh

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
    │                           │                          │  3. Generate state JWT    │
    │                           │                          │     with embedded nonce   │
    │                           │                          │                           │
    │                           │  4. 302 Redirect to      │                           │
    │                           │     Keycloak auth URL    │                           │
    │                           │     with state, nonce    │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  5. GET /auth?           │                           │
    │                           │     client_id=X&         │                           │
    │                           │     redirect_uri=Y&      │                           │
    │                           │     state=JWT&           │                           │
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
    │                           │      state=JWT           │                           │
    │                           ├─────────────────────────>│                           │
    │                           │                          │                           │
    │                           │                          │  11. Verify state JWT    │
    │                           │                          │      Extract nonce       │
    │                           │                          │                           │
    │                           │                          │  12. POST /token         │
    │                           │                          │      grant_type:         │
    │                           │                          │        authorization_code │
    │                           │                          │      code: XYZ           │
    │                           │                          │      client_id: X        │
    │                           │                          │      client_secret: *** │
    │                           │                          ├──────────────────────────>│
    │                           │                          │                           │
    │                           │                          │  13. Returns tokens:     │
    │                           │                          │      - access_token      │
    │                           │                          │      - refresh_token     │
    │                           │                          │      - id_token          │
    │                           │                          │<──────────────────────────┤
    │                           │                          │                           │
    │                           │                          │  14. Validate id_token   │
    │                           │                          │      signature (JWKS)    │
    │                           │                          │      Verify nonce match  │
    │                           │                          │                           │
    │                           │                          │  15. Save tokens in      │
    │                           │                          │      AuthSessionStore    │
    │                           │                          │      TTL = 60s           │
    │                           │                          │      Returns resultId    │
    │                           │                          │                           │
    │                           │  16. 302 Redirect to     │                           │
    │                           │      SPA with            │                           │
    │                           │      ?auth_result=UUID   │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  17. SPA sees            │                           │
    │                           │      auth_result param   │                           │
    │                           │                          │                           │
    │                           │  18. GET /api/auth/      │                           │
    │                           │      result?result=UUID  │                           │
    │                           ├─────────────────────────>│                           │
    │                           │                          │                           │
    │                           │                          │  19. Lookup & delete     │
    │                           │                          │      from session store  │
    │                           │                          │                           │
    │                           │  20. Returns tokens      │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  21. Store tokens in     │                           │
    │                           │      localStorage        │                           │
    │                           │      Decode id_token     │                           │
    │                           │      for profile info    │                           │
    │                           │      Update React state  │                           │
    │                           │                          │                           │
    │                           │  22. Clean URL           │                           │
    │                           │      (remove param)      │                           │
    │                           │                          │                           │
    │  23. Application loaded   │                          │                           │
    │     with user logged in   │                          │                           │
    │<──────────────────────────┤                          │                           │
    │                           │                          │                           │
```

**Key Steps Explained:**

- **Steps 1-5**: User clicks login, SPA navigates to backend `/auth/login`, backend creates state JWT with nonce and redirects to Keycloak
- **Steps 6-8**: Keycloak authenticates user (login page, 2FA, etc.) and generates authorization code
- **Steps 9-15**: Keycloak redirects back to backend callback, backend verifies state, exchanges code for tokens, validates ID token nonce
- **Steps 16-22**: Backend stores tokens with short TTL, redirects SPA with `auth_result` UUID, SPA exchanges UUID for tokens, stores in localStorage
- **Step 23**: User is authenticated, SPA can make API calls with access token

### Token Refresh Flow

```
┌────────┐                 ┌─────────┐                ┌──────────┐                ┌──────────┐
│  User  │                 │   SPA   │                │  Backend │                │ Keycloak │
└───┬────┘                 └────┬────┘                └────┬─────┘                └────┬─────┘
    │                           │                          │                           │
    │                           │  1. Access token         │                           │
    │                           │     expired or about to  │                           │
    │                           │                          │                           │
    │                           │  2. Read refresh_token   │                           │
    │                           │     from localStorage    │                           │
    │                           │                          │                           │
    │                           │  3. POST /api/auth/      │                           │
    │                           │     refresh              │                           │
    │                           │     { refresh_token }    │                           │
    │                           ├─────────────────────────>│                           │
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
    │                           │  6. Returns new tokens   │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  7. Update localStorage  │                           │
    │                           │     with new tokens      │                           │
    │                           │     Update React state   │                           │
    │                           │                          │                           │
    │  8. Continue using app    │                          │                           │
    │     with refreshed token  │                          │                           │
    │<──────────────────────────┤                          │                           │
    │                           │                          │                           │
```

**Refresh Triggers:**
- Automatic on app load if access token expired
- Manual trigger by API error interceptors (401 responses)
- Proactive refresh before expiry (can be implemented with timer)

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
    │                           │  2. Extract id_token     │                           │
    │                           │     Clear user state     │                           │
    │                           │     Clear localStorage   │                           │
    │                           │                          │                           │
    │                           │  3. Navigate to          │                           │
    │                           │     /api/auth/logout?    │                           │
    │                           │     id_token_hint=JWT    │                           │
    │                           ├─────────────────────────>│                           │
    │                           │                          │                           │
    │                           │  4. 302 Redirect to      │                           │
    │                           │     Keycloak logout      │                           │
    │                           │     with id_token_hint   │                           │
    │                           │<─────────────────────────┤                           │
    │                           │                          │                           │
    │                           │  5. GET /logout?         │                           │
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

The `BCGovAuthGuard` normalizes these into `request.user.roles`:
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

1. `BCGovAuthGuard` checks if route has `@ApiKeyAuth()` and `X-API-Key` header present
2. If yes, skips bearer token validation (delegates to `ApiKeyAuthGuard`)
3. `ApiKeyAuthGuard` validates the API key against database
4. Sets `request.user` with user info from API key record
5. `RolesGuard` can still enforce roles if needed (API keys can have associated roles)

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
  async validateApiKey(apiKey: string): Promise<{ userId: string; userEmail: string } | null> {
    // Look up API key in database
    // Return user info if valid, null otherwise
  }
}
```

**Best Practices:**
- API keys should be stored hashed in the database (similar to passwords)
- Include key prefix for key identification (e.g., `pk_live_...`)
- Implement key rotation policies
- Scope keys to specific operations or resources

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

# Frontend URL (for auth result redirect)
FRONTEND_URL=https://app.example.com

# Auth Security
AUTH_STATE_SECRET=your-state-signing-secret  # Optional, defaults to client secret
AUTH_RESULT_TTL_SECONDS=60                   # Optional, default 60
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

4. **AUTH_STATE_SECRET:**
   - Used to sign the state JWT
   - Should be a strong random secret (32+ characters)
   - Defaults to `SSO_CLIENT_SECRET` if not provided

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

**Current Approach: `localStorage`**

**Pros:**
- Persists across browser sessions
- Simple implementation
- No server-side session management needed

**Cons:**
- Vulnerable to XSS attacks (if attacker injects malicious scripts, they can read localStorage)

**Mitigations:**
1. **Content Security Policy (CSP)**: Implement strict CSP headers to prevent script injection
2. **HTTPOnly Cookies (Alternative)**: Could store tokens in HTTPOnly cookies immune to XSS, but complicates CORS
3. **Short-Lived Tokens**: Access tokens expire quickly (15 min default)
4. **XSS Protection**: Sanitize all user inputs, use React's built-in XSS protection

**Future Enhancement:**
Consider moving to HTTPOnly cookies for token storage:
```typescript
// Backend sets cookie after auth
res.cookie("auth_token", tokens.access_token, {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
});
```

### CSRF Protection

**State Token:**
- Signed JWT with short expiry (5 minutes)
- Contains cryptographic nonce
- Validated on callback
- Prevents CSRF attacks on OAuth flow

**API Requests:**
- Bearer tokens are not vulnerable to CSRF (unlike cookies)
- Tokens sent via `Authorization` header, not automatically by browser

**If Using Cookies (Future):**
- Implement CSRF tokens for state-changing operations
- Use `SameSite=Strict` or `SameSite=Lax` cookie attribute

### Token Validation

**Backend Validation (Critical):**
- Every bearer token validated via JWKS signature verification
- Issuer and audience claims checked
- Token expiry enforced
- Never trust client-decoded claims

**Frontend Validation (Informational):**
- ID token decoded for UI display only
- Backend always re-validates on API calls

### Secrets Management

**Never Commit Secrets:**
- Use `.env` files (excluded from git)
- Use environment variables in CI/CD
- Use secret management services (AWS Secrets Manager, Azure Key Vault, etc.)

**Client Secret:**
- Only stored on backend
- Never exposed to frontend
- Used for token exchange and refresh

**State Secret:**
- Separate from client secret (recommended)
- Used only for signing state JWTs
- Rotation supported (old states become invalid)

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
- No session IDs reused
- State token is one-time use

### Token Leakage

**Mitigations:**
- Tokens never in URLs (except transient `auth_result` ID, which is short-lived and one-time)
- Access tokens short-lived (15 min default)
- Refresh tokens require client secret to use
- JWKS signature verification prevents token forgery

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

Backend (`auth.service.ts`):
```typescript
private logger = new Logger(AuthService.name);

async handleCallback(code: string, state: string, iss?: string): Promise<string> {
  this.logger.log(`Callback received: code=${code.substring(0, 10)}..., state=${state.substring(0, 20)}...`);

  // ... existing logic
}
```

Frontend (`AuthContext.tsx`):
```typescript
const handleAuthResultFromUrl = async () => {
  console.log("Checking for auth_result in URL:", window.location.search);
  
  // ... existing logic
  
  console.log("Auth result redeemed successfully, storing tokens");
};
```

**Common Issues:**

1. **"PKCE state expired or invalid"**
   - PKCE state expired (user took >60s to login, configurable via `AUTH_RESULT_TTL_SECONDS`)
   - Server restarted (in-memory PKCE store cleared)
   - Solution: Retry login immediately

1. **"callback_failed" redirect**
   - Missing `iss` parameter in callback URL when Keycloak advertises `authorization_response_iss_parameter_supported`
   - PKCE code verifier mismatch
   - Solution: Ensure all query parameters from Keycloak callback (code, state, iss) are passed to `handleCallback`

2. **"Auth result expired or invalid"**
   - Result ID consumed twice (React StrictMode)
   - Result ID expired (>60s elapsed)
   - Solution: Check `handledAuthResultIdsRef` logic

3. **"Invalid token" on API calls**
   - Token expired (check `expires_at`)
   - Token signature invalid (Keycloak keys rotated)
   - Wrong audience/issuer (config mismatch)
   - Solution: Check token in [jwt.io](https://jwt.io), compare issuer/aud with config

4. **"Insufficient permissions"**
   - User lacks required roles
   - Solution: Check `request.user.roles` in backend, assign roles in Keycloak

5. **Infinite redirect loop**
   - Redirect URI mismatch (Keycloak config vs `SSO_REDIRECT_URI`)
   - Solution: Ensure exact match, including protocol and port

### Testing Auth Flow

**Manual Test:**
```bash
# 1. Get login URL
curl http://localhost:3002/api/auth/login -v

# 2. Manually visit Keycloak URL in browser

# 3. After login, copy callback URL from browser
# Example: http://localhost:3002/api/auth/callback?code=abc&state=xyz

# 4. Visit callback URL in browser (should redirect to frontend)

# 5. Copy auth_result from URL
# Example: http://localhost:3000/?auth_result=uuid

# 6. Exchange result for tokens
curl "http://localhost:3002/api/auth/result?result=uuid"

# 7. Test API call with token
curl http://localhost:3002/api/protected \
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
    
    // 2. Simulate Keycloak response (requires test double or actual Keycloak)
    const callbackRes = await request(app)
      .get("/api/auth/callback")
      .query({ code: "test-code", state: signedState });
    
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toContain("auth_result=");
    
    // 3. Redeem result
    const resultId = extractResultId(callbackRes.headers.location);
    const tokensRes = await request(app)
      .get("/api/auth/result")
      .query({ result: resultId });
    
    expect(tokensRes.body).toHaveProperty("access_token");
    expect(tokensRes.body).toHaveProperty("refresh_token");
  });
});
```

---

## Summary

This application implements a **secure, backend-driven OAuth 2.0 Authorization Code flow** with:

**Key Features:**
- Confidential client architecture (secrets never exposed)
- State token with embedded nonce for CSRF protection
- JWKS-based token signature verification
- Role-based access control (RBAC)
- Automatic token refresh
- Clean separation between frontend (token storage) and backend (OAuth orchestration)
- Alternative API key authentication for machine-to-machine

**Technology Stack:**
- Backend: NestJS + `jsonwebtoken` + `jwks-rsa` + Axios
- Frontend: React + Axios + `localStorage`
- Identity Provider: Keycloak (OpenID Connect)

**Security Layers:**
1. HTTPS transport encryption
2. State token signing (JWT)
3. Nonce validation (replay protection)
4. Token signature verification (JWKS)
5. Issuer/audience claim validation
6. Short-lived auth results (60s TTL)
7. Refresh token rotation
8. Role-based authorization

This architecture provides a robust foundation for secure authentication while keeping the frontend stateless and the backend in control of sensitive operations.
