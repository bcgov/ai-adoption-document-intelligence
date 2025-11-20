import { UserManagerSettings } from 'oidc-client-ts';

const keycloakConfig: UserManagerSettings = {
  authority: import.meta.env.VITE_SSO_AUTH_SERVER_URL || '',
  client_id: import.meta.env.VITE_SSO_CLIENT_ID || '',
  redirect_uri: `${window.location.origin}/auth/callback`,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email',
  // Automatic token refresh
  automaticSilentRenew: true,
  silent_redirect_uri: `${window.location.origin}/auth/silent-renew`,
  // Token validation
  validateSubOnSilentRenew: true,
  // Session monitoring
  monitorSession: true,
};

export default keycloakConfig;
