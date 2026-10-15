import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/features/shell/ThemeProvider";
import { SocketBridge } from "@/features/shell/SocketBridge";
import { AuthBootstrap } from "@/features/auth/AuthBootstrap";
import { HealthBootstrap } from "@/features/shell/HealthBootstrap";
import { AppRoutes } from "@/routes";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthBootstrap />
          <HealthBootstrap />
          <SocketBridge />
          <AppRoutes />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
