import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Obras = lazy(() => import('./pages/Obras'));
const Detalhe = lazy(() => import('./pages/Detalhe'));
const Compras = lazy(() => import('./pages/Compras'));
const Historico = lazy(() => import('./pages/Historico'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const Cronograma = lazy(() => import('./pages/crono/Cronograma'));
const Painel = lazy(() => import('./pages/crono/Painel'));
const Projeto = lazy(() => import('./pages/crono/Projeto'));
const Equipe = lazy(() => import('./pages/Equipe'));
import { ComObra } from './pages/crono/CronoHeader';

export default function App() {
  return (
    <Suspense fallback={<div className="empty" style={{ padding: 60 }}>Carregando…</div>}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="obras" element={<Obras />} />
        <Route path="detalhe" element={<Detalhe />} />
        <Route path="compras" element={<Compras />} />
        <Route path="historico" element={<Historico />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="cronograma" element={<ComObra><Cronograma /></ComObra>} />
        <Route path="painel" element={<ComObra><Painel /></ComObra>} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="projeto" element={<ComObra><Projeto /></ComObra>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
