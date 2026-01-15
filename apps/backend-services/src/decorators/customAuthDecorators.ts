import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

export function KeycloakSSO() {
  return applyDecorators(
    ApiBearerAuth('keycloak-sso'),
    ApiUnauthorizedResponse({ description: "User is not authenticated" }),
  );
}

export function ApiKey() {
  return applyDecorators(
    ApiBearerAuth('api-key'),
    ApiUnauthorizedResponse({ description: "Invalid API key" }),
  );
}

