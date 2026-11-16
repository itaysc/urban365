import { createRoot } from 'react-dom/client';
import { AssistantPanel } from '@/components/assistant/AssistantWidget';

const host = document.getElementById('u365-assistant');
if (host) {
  createRoot(host).render(
    <AssistantPanel pathname={window.location.pathname} signInHref="/login" />,
  );
}
