import { useState, useEffect } from 'react'
import { useSSO } from '@bcgov/citz-imb-sso-react'
import './App.css'
import { HelloWorld, DocumentsList, Login } from './components'
import { apiService } from './data/services/api.service'

function App(): JSX.Element {
  const [count, setCount] = useState(0)
  const [isRefreshingToken, setIsRefreshingToken] = useState(false)
  const { isAuthenticated, isLoggingIn, getAuthorizationHeaderValue, refreshToken, logout } = useSSO()

  // Handle token setup and refresh
  useEffect(() => {
    const handleTokenSetup = async () => {
      if (isAuthenticated) {
        const authHeader = getAuthorizationHeaderValue()
        console.log('🔍 Current auth header:', authHeader)

        // Check if we have a valid Bearer token (not "Bearer undefined")
        if (authHeader && authHeader.startsWith('Bearer ') && authHeader !== 'Bearer undefined') {
          const token = authHeader.replace('Bearer ', '')
          console.log('✅ Valid token found, setting in API service')
          apiService.setAuthToken(token)
        } else {
          // Try to refresh the token if we don't have a valid one
          console.log('🔄 No valid token, attempting refresh...')
          setIsRefreshingToken(true)
          try {
            await refreshToken()
            console.log('🔄 Token refresh completed, checking result...')

            // After refresh, check again
            const newAuthHeader = getAuthorizationHeaderValue()
            console.log('🔍 New auth header after refresh:', newAuthHeader)

            if (newAuthHeader && newAuthHeader.startsWith('Bearer ') && newAuthHeader !== 'Bearer undefined') {
              const newToken = newAuthHeader.replace('Bearer ', '')
              console.log('✅ Token refreshed successfully')
              apiService.setAuthToken(newToken)
            } else {
              console.log('❌ Token refresh did not provide valid token')
              apiService.setAuthToken(null)
            }
          } catch (error) {
            console.log('❌ Token refresh failed with error:', error)
            console.log('🔐 Forcing logout due to refresh failure')
            apiService.setAuthToken(null)
            // Force logout if token refresh fails completely
            logout()
          } finally {
            setIsRefreshingToken(false)
          }
        }
      } else {
        console.log('❌ User not authenticated, clearing token')
        apiService.setAuthToken(null)
      }
    }

    // Only run if not currently refreshing to avoid loops
    if (!isRefreshingToken) {
      handleTokenSetup()
    }
  }, [isAuthenticated, getAuthorizationHeaderValue, refreshToken, logout, isRefreshingToken])

  // Show loading state while determining authentication status or refreshing tokens
  if (isLoggingIn || isRefreshingToken) {
    return (
      <div className="loading-container">
        <h2>Loading...</h2>
        <p>{isRefreshingToken ? 'Refreshing session...' : 'Checking authentication status...'}</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Login />
  }

  // Token is set synchronously above, so API calls will have auth headers immediately

  return (
    <>
      <div>
        <h1>AI OCR Frontend</h1>
        <HelloWorld name="Developer" />
        <div className="card">
          <button onClick={() => setCount((count) => count + 1)}>
            count is {count}
          </button>
          <p>
            Edit <code>src/App.tsx</code> and save to test HMR
          </p>
        </div>
        <p className="read-the-docs">
          Click on the Vite and React logos to learn more
        </p>
        <DocumentsList />
      </div>
    </>
  )
}

export default App
