import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/app.css';
import { initPwa } from './app/pwa';
import { Root } from './app/Root';
import { lang, t } from './app/strings';

document.documentElement.lang = lang;
document.title = t.appTitle;
initPwa();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
