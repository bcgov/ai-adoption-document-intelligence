import { SetMetadata } from "@nestjs/common";

// biome-ignore lint/security/noSecrets: allowApiKeyAuth is a metadata key, not a real secret
export const API_KEY_AUTH_KEY = "allowApiKeyAuth";
export const ApiKeyAuth = () => SetMetadata(API_KEY_AUTH_KEY, true);
