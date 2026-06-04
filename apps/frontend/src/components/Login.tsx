import { useAuth } from "../auth/useAuth";
import { Badge, Button, Group, PanelCard, Stack, Text, Title } from "../ui";

export const Login = () => {
  const { isAuthenticated, user, login, logout } = useAuth();

  if (isAuthenticated && user) {
    return (
      <PanelCard p="xl" style={{ maxWidth: 500, margin: "0 auto" }}>
        <Stack gap="lg" align="center">
          <Group gap="xs">
            <Title order={1}>Welcome,</Title>
            <Title order={1} c="blue">
              {String(user?.profile?.name || "")}
            </Title>
          </Group>

          <Stack gap="sm" style={{ width: "100%" }}>
            <Group justify="space-between">
              <Text fw={500}>Username:</Text>
              <Badge variant="light" color="blue">
                {String(user?.profile?.preferred_username || "")}
              </Badge>
            </Group>
            <Group justify="space-between">
              <Text fw={500}>Email:</Text>
              <Text size="sm">{String(user?.profile?.email || "")}</Text>
            </Group>
          </Stack>

          <Button
            variant="primary"
            danger
            size="large"
            onClick={() => logout()}
            style={{ minWidth: 120 }}
          >
            Logout
          </Button>
        </Stack>
      </PanelCard>
    );
  }

  return (
    <PanelCard p="xl" style={{ maxWidth: 500, margin: "0 auto" }}>
      <Stack gap="lg" align="center">
        <Title order={1} ta="center">
          Please log in to continue
        </Title>
        <Text c="dimmed" ta="center" size="lg">
          Use your IDIR credentials to access the AI OCR application
        </Text>
        <Button
          variant="primary"
          size="large"
          onClick={() => login()}
          style={{ minWidth: 150 }}
        >
          Login with IDIR
        </Button>
      </Stack>
    </PanelCard>
  );
};
