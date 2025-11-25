import { useMemo, useState } from 'react'
import { AppShell, Button, Group, Text, Title, Stack, Badge, Avatar } from '@mantine/core'
import { IconLogout, IconUpload, IconList } from '@tabler/icons-react'
import { useAuth } from './auth/AuthContext'
import './App.css'
import { Login } from './components'
import { DocumentUploadPanel } from './components/upload/DocumentUploadPanel'
import { ProcessingQueue } from './components/queue/ProcessingQueue'
import { DocumentDetailDrawer } from './components/details/DocumentDetailDrawer'
import type { Document } from './shared/types'

type MainView = 'upload' | 'queue'

function AppContent(): JSX.Element {
  const { isAuthenticated, isLoading, logout, user } = useAuth()
  const [activeView, setActiveView] = useState<MainView>('upload')
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [detailOpened, setDetailOpened] = useState(false)

  const navItems = useMemo(
    () => [
      { value: 'upload' as MainView, label: 'Upload', description: 'Send new files', icon: IconUpload },
      { value: 'queue' as MainView, label: 'Processing queue', description: 'Track statuses', icon: IconList },
    ],
    [],
  )

  const openDocument = (doc: Document) => {
    setSelectedDocument(doc)
    setDetailOpened(true)
    if (activeView !== 'queue') {
      setActiveView('queue')
    }
  }

  if (isLoading) {
    return (
      <Stack align="center" justify="center" mih="100vh">
        <Title order={3}>Loading…</Title>
        <Text c="dimmed">Checking authentication status</Text>
      </Stack>
    )
  }

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <>
      <AppShell
        header={{ height: 64 }}
        navbar={{ width: 240, breakpoint: 'sm' }}
        padding="md"
        withBorder
      >
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group>
              <Title order={3}>Document intelligence</Title>
              <Badge variant="light" color="blue">
                Live OCR
              </Badge>
            </Group>
            <Group>
              <Stack gap={0}>
                <Text size="sm" fw={600}>
                  {user?.profile?.name ?? 'Authenticated user'}
                </Text>
                <Text size="xs" c="dimmed">
                  {user?.profile?.email ?? 'Logged in'}
                </Text>
              </Stack>
              <Avatar radius="xl">{user?.profile?.name?.[0] ?? 'U'}</Avatar>
              <Button variant="light" color="red" leftSection={<IconLogout size={16} />} onClick={() => logout()}>
                Logout
              </Button>
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <Stack gap="xs">
            {navItems.map((item) => (
              <Button
                key={item.value}
                variant={activeView === item.value ? 'light' : 'subtle'}
                color={activeView === item.value ? 'blue' : 'gray'}
                justify="space-between"
                leftSection={<item.icon size={18} />}
                onClick={() => setActiveView(item.value)}
              >
                <Stack gap={0} align="flex-start">
                  <Text size="sm" fw={600}>
                    {item.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {item.description}
                  </Text>
                </Stack>
              </Button>
            ))}
          </Stack>
        </AppShell.Navbar>

        <AppShell.Main>
          <Stack gap="lg">
            <Group justify="space-between">
              <Stack gap={2}>
                <Title order={2}>{activeView === 'upload' ? 'Upload documents' : 'Processing monitor'}</Title>
                <Text c="dimmed" size="sm">
                  {activeView === 'upload'
                    ? 'Add new images and track their ingestion progress.'
                    : 'View the OCR pipeline and drill into results.'}
                </Text>
              </Stack>
              <Badge variant="outline" size="lg">
                {new Date().toLocaleDateString()}
              </Badge>
            </Group>

            {activeView === 'upload' ? (
              <DocumentUploadPanel onDocumentFocus={openDocument} />
            ) : (
              <ProcessingQueue onSelectDocument={openDocument} />
            )}
          </Stack>
        </AppShell.Main>
      </AppShell>

      <DocumentDetailDrawer
        document={selectedDocument}
        opened={detailOpened}
        onClose={() => setDetailOpened(false)}
      />
    </>
  )
}

function App(): JSX.Element {
  return <AppContent />
}

export default App
