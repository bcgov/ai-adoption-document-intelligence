import { useState } from 'react'
import { useAuth } from './auth/AuthContext'
import './App.css'
import { HelloWorld, DocumentsList, Login } from './components'
import '@mantine/core/styles.css'
import { MantineProvider, Title, Button, Card, Text, Badge, Group, Stack } from '@mantine/core'

function AppContent(): JSX.Element {
  const [count, setCount] = useState(0)
  const { isAuthenticated, isLoading, logout } = useAuth()

  // Show loading state while determining authentication status or refreshing tokens
  if (isLoading) {
    return (
      <MantineProvider>
        <div className="loading-container">
          <h2>Loading...</h2>
          <p>Checking authentication status...</p>
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

function App(): JSX.Element {
  return <AppContent />
}

export default App
