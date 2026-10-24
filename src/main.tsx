import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import AuthGate from './components/AuthGate.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthGate>
        <App />
      </AuthGate>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
