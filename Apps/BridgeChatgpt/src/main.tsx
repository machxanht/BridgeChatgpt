import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ProjectSetupStatusBar } from './components/ProjectSetupStatusBar.js';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ProjectSetupStatusBar />
  </StrictMode>,
);
