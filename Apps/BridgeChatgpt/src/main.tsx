import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { ConversationChat } from './components/ConversationChat';
import './index.css';
import { BrowserSignIn } from './components/BrowserSignIn';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserSignIn><ConversationChat /></BrowserSignIn>
  </StrictMode>,
);
