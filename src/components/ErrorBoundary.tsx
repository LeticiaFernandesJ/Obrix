import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ehErroDeArquivoAntigo, recarregarUmaVez } from '../lib/recarregar';

const CHAVES = ['obrix-ac21-v1', 'cronograma-obra-v2'];

export default class ErrorBoundary extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };
  static getDerivedStateFromError(erro: Error) { return { erro }; }
  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error(erro, info);
    if (ehErroDeArquivoAntigo(erro)) recarregarUmaVez();
  }

  baixarCopia = () => {
    const copia: Record<string, unknown> = {};
    CHAVES.forEach((k) => { try { copia[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch { copia[k] = localStorage.getItem(k); } });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' }));
    a.download = 'obrix-copia-de-seguranca.json'; a.click();
  };
  limpar = () => {
    if (!confirm('Apagar os dados salvos neste navegador e recarregar? Baixe a cópia antes se quiser guardá-los.')) return;
    CHAVES.forEach((k) => localStorage.removeItem(k));
    location.href = import.meta.env.BASE_URL;
  };

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' }}>
        <div className="card" style={{ maxWidth: 520, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Algo deu errado</h2>
          <p style={{ color: 'var(--text2)', marginBottom: 6 }}>O Obrix encontrou um erro inesperado e não conseguiu mostrar esta tela. Seus dados continuam salvos no navegador.</p>
          <p className="note" style={{ textAlign: 'left', wordBreak: 'break-word' }}>{this.state.erro.message}</p>
          <div className="action-row" style={{ justifyContent: 'center', marginTop: 14, marginBottom: 0 }}>
            <button className="btn btn-primary" onClick={() => location.reload()}>Recarregar</button>
            <button className="btn" onClick={this.baixarCopia}>Baixar cópia dos dados</button>
            <button className="btn btn-danger" onClick={this.limpar}>Apagar dados e reiniciar</button>
          </div>
        </div>
      </div>
    );
  }
}
