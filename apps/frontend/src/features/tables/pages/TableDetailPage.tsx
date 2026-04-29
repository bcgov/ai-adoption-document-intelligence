import { Container, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";

export function TableDetailPage() {
  const { tableId } = useParams<{ tableId: string }>();
  return (
    <Container>
      <Title order={2}>Table: {tableId}</Title>
      <Text>Table detail — content in Task 23.</Text>
    </Container>
  );
}
