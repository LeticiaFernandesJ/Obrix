import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Obras from './pages/Obras';
import Detalhe from './pages/Detalhe';
import Compras from './pages/Compras';
import Historico from './pages/Historico';
import Relatorios from './pages/Relatorios';
import Cronograma from './pages/crono/Cronograma';
import Painel from './pages/crono/Painel';
import Projeto from './pages/crono/Projeto';
import { ComObra } from './pages/crono/CronoHeader';

export default function App() {
  return (
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
        <Route path="projeto" element={<ComObra><Projeto /></ComObra>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
