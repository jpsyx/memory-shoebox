import { Code, Loader, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { healthQueryOptions } from "@/api/health";

export const Route = createFileRoute("/")({
  component: HomePage,
});

/**
 * Placeholder home page. It calls the API's health endpoint so a fresh clone
 * proves the whole stack end to end: SPA, Vite proxy, Fastify, and the shared
 * contract package. Replace it with the real feed.
 */
function HomePage() {
  const { data, isPending, isError } = useQuery(healthQueryOptions);

  return (
    <Stack align="center" justify="center" mih="100vh" gap="xs">
      <Title order={1}>Famgram</Title>
      <Text c="dimmed">
        Edit <Code>apps/web/src/routes/index.tsx</Code> to get started.
      </Text>
      {isPending ? <Loader size="sm" /> : null}
      {isError ? (
        <Text c="red">
          Could not reach the API. Is the server running on port 8080?
        </Text>
      ) : null}
      {data ? (
        <Text c="dimmed" size="sm">
          Server {data.version} is up, {data.uptimeSeconds}s since start.
        </Text>
      ) : null}
    </Stack>
  );
}
