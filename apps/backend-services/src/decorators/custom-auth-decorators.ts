import { applyDecorators, SetMetadata } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiSecurity,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";

// biome-ignore lint/security/noSecrets: allowApiKeyAuth is a metadata key, not a real secret
export const API_KEY_AUTH_KEY = "allowApiKeyAuth";

export function KeycloakSSOAuth() {
  return applyDecorators(
    ApiBearerAuth("keycloak-sso"),
    ApiUnauthorizedResponse({ description: "User is not authenticated" }),
  );
}

export function ApiKeyAuth() {
  return applyDecorators(
    ApiSecurity("api-key"),
    ApiUnauthorizedResponse({ description: "Invalid API key" }),
    SetMetadata(API_KEY_AUTH_KEY, true),
  );
}
