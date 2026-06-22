import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      // First load can take 3-4 min while GitHub rate limits are being respected
      // without a token. Subsequent loads hit the 1hr cache instantly.
      gcTime: 1000 * 60 * 60,
    },
  },
});
