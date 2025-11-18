import { useState, useEffect } from 'react'
import { useSSO } from '@bcgov/citz-imb-sso-react'
import './App.css'
import { HelloWorld, DocumentsList, Login } from './components'
import { apiService } from './data/services/api.service'
import '@mantine/core/styles.css'
import { MantineProvider, Title, Button, Card, Text, Badge, Group, Stack } from '@mantine/core'

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
          setIsRefreshingToken(false) // Clear any refresh state
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
              console.log('❌ Token refresh did not provide valid token - forcing logout')
              apiService.setAuthToken(null)
              // Force logout if token refresh fails completely
              logout()
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
        setIsRefreshingToken(false) // Clear refresh state when not authenticated
      }
    }

    handleTokenSetup()
  }, [isAuthenticated, getAuthorizationHeaderValue, refreshToken, logout])

  // Show loading state while determining authentication status or refreshing tokens
  if (isLoggingIn || isRefreshingToken) {
    return (
      <MantineProvider>
        <div className="loading-container">
          <h2>Loading...</h2>
          <p>{isRefreshingToken ? 'Refreshing session...' : 'Checking authentication status...'}</p>
        </div>
      </MantineProvider>
    )
  }

  if (!isAuthenticated) {
    return (
      <MantineProvider>
        <Login />
      </MantineProvider>
    )
  }

  // Token is set synchronously above, so API calls will have auth headers immediately

  return (
    <MantineProvider>
      <Stack p="md" gap="lg">
        <Group justify="space-between" align="center">
          <Title order={1}>AI OCR Frontend</Title>
          <Group gap="sm">
            <Badge size="lg" variant="light" color="blue">
              Mantine UI
            </Badge>
            <Button
              variant="filled"
              color="red"
              size="sm"
              onClick={() => logout()}
              leftSection="🚪"
            >
              Logout
            </Button>
          </Group>
        </Group>

        <HelloWorld name="Developer" />

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between" mb="xs">
            <Title order={3}>Interactive Counter</Title>
            <Badge color="cyan" variant="light">
              Counter: {count}
            </Badge>
          </Group>

          <Text size="sm" c="dimmed" mb="md">
            Click the button below to increment the counter
          </Text>

          <Button
            variant="filled"
            color="blue"
            size="md"
            onClick={() => setCount((count) => count + 1)}
          >
            Count is {count}
          </Button>

          <Text size="sm" c="dimmed" mt="md">
            Edit <code>src/App.tsx</code> and save to test HMR
          </Text>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={4} mb="sm">Built with Modern Tools</Title>
          <Text size="sm">
            This application uses Vite, React, TypeScript, and now Mantine UI components for a beautiful and consistent design system.
          </Text>
        </Card>

        <DocumentsList />
      </Stack>
    </MantineProvider>
  )
}

export default App
