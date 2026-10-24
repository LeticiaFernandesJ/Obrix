import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import AuthGate from './components/AuthGate.tsx';
import { DialogoProvider } from './components/Dialogo.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { recarregarUmaVez } from './lib/recarregar.ts';
import './index.css';

// nova versão publicada com a aba aberta: o arquivo da tela mudou de nome → recarrega
window.addEventListener('vite:preloadError', (e) => { e.preventDefault(); recarregarUmaVez(); });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <DialogoProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </DialogoProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
