import { useState } from 'react'
import { useSSO } from '@bcgov/citz-imb-sso-react'
import './App.css'
import { HelloWorld, DocumentsList, Login } from './components'
import { apiService } from './data/services/api.service'

function App(): JSX.Element {
  const [count, setCount] = useState(0)
  const { isAuthenticated, isLoggingIn, getAuthorizationHeaderValue } = useSSO()

  // Extract and set auth token SYNCHRONOUSLY before any rendering decisions
  if (isAuthenticated) {
    const authHeader = getAuthorizationHeaderValue()

    // Check if we have a valid Bearer token (not "Bearer undefined")
    if (authHeader && authHeader.startsWith('Bearer ') && authHeader !== 'Bearer undefined') {
      const token = authHeader.replace('Bearer ', '')
      apiService.setAuthToken(token)
    } else {
      apiService.setAuthToken(null)
    }
  } else {
    apiService.setAuthToken(null)
  }

  // Show loading state while determining authentication status
  if (isLoggingIn) {
    return (
      <div className="loading-container">
        <h2>Loading...</h2>
        <p>Checking authentication status...</p>
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
