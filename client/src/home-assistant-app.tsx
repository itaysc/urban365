import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { AssistantPanel } from '@/components/assistant/AssistantWidget';
import { queryClient } from '@/queries/client';

const host = document.getElementById('u365-assistant');
if (host) {
  createRoot(host).render(
    <QueryClientProvider client={queryClient}>
      <AssistantPanel pathname={window.location.pathname} signInHref="/login" />
    </QueryClientProvider>,
  );
}
