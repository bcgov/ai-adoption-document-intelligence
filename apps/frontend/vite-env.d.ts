/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_SSO_AUTH_SERVER_URL: string
  readonly VITE_SSO_REALM: string
  readonly VITE_SSO_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
