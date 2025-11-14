import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { SSOProvider } from '@bcgov/citz-imb-sso-react'
import { queryClient } from './data/queryClient'
import './shared/styles/index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SSOProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </SSOProvider>
  </StrictMode>,
)
