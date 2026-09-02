import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {IdentityBanner} from './components/IdentityBanner.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IdentityBanner />
    <App />
  </StrictMode>,
);
