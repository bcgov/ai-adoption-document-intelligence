import { useAuth } from '../auth/AuthContext';
import { Card, Title, Text, Button, Stack, Group, Badge } from '@mantine/core';

export const Login = () => {
  const { isAuthenticated, user, login, logout } = useAuth();

  if (isAuthenticated && user) {
    return (
      <Card shadow="sm" padding="xl" radius="md" withBorder style={{ maxWidth: 500, margin: '0 auto' }}>
        <Stack gap="lg" align="center">
          <Group gap="xs">
            <Title order={1}>Welcome,</Title>
            <Title order={1} c="blue">{String(user?.profile?.name || '')}</Title>
          </Group>

          <Stack gap="sm" style={{ width: '100%' }}>
            <Group justify="space-between">
              <Text fw={500}>Username:</Text>
              <Badge variant="light" color="blue">{String(user?.profile?.preferred_username || '')}</Badge>
            </Group>
            <Group justify="space-between">
              <Text fw={500}>Email:</Text>
              <Text size="sm">{String(user?.profile?.email || '')}</Text>
            </Group>
          </Stack>

          <Button
            variant="filled"
            color="red"
            size="lg"
            onClick={() => logout()}
            style={{ minWidth: 120 }}
          >
            Logout
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Card shadow="sm" padding="xl" radius="md" withBorder style={{ maxWidth: 500, margin: '0 auto' }}>
      <Stack gap="lg" align="center">
        <Title order={1} ta="center">Please log in to continue</Title>
        <Text c="dimmed" ta="center" size="lg">
          Use your IDIR credentials to access the AI OCR application
        </Text>
        <Button
          variant="filled"
          color="blue"
          size="lg"
          onClick={() => login()}
          style={{ minWidth: 150 }}
        >
          Login with IDIR
        </Button>
      </Stack>
    </Card>
  );
};
