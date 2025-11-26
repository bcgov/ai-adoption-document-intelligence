import { Stack, Text, Title } from "@mantine/core";
import React from "react";

interface HelloWorldProps {
  name?: string;
}

export const HelloWorld: React.FC<HelloWorldProps> = ({ name = "World" }) => {
  return (
    <Stack gap="xs">
      <Title order={2}>Hello, {name}!</Title>
      <Text size="lg" c="dimmed">
        Welcome to the AI OCR Frontend application.
      </Text>
    </Stack>
  );
};
