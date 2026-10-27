import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CalendarRange, Check, ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppStore';
import {
  CORES, SITUACOES, STATUS_OBRA, badgeStatusObra, corPct, fmt, fmtData, gravarSituacao, lerSituacao, nivelPct, pctInt, porSituacao, rotuloNivel,
  totalComprometido, totalPago, type Obra, type Situacao, type StatusObra,
  plural,
} from '../lib/ac21';
import { useDialogo } from '../components/Dialogo';
import { Empty, Modal, Progress, CampoDinheiro } from '../components/ui';
import { pctFis, resumoCrono } from '../lib/schedule';
import { n2br } from '../lib/dates';

interface Form {
  nome: string; codigo: string; local: string; responsavel: string; inicio: string; fim: string;
  ac21: string; status: StatusObra; obs: string;
}
const vazio: Form = { nome: '', codigo: '', local: '', responsavel: '', inicio: '', fim: '', ac21: '', status: 'Em Andamento', obs: '' };
const doObra = (o: Obra): Form => ({ ...o, ac21: String(o.ac21 || '') });

export default function Obras() {
  const { db, cronos, obraAtivaId, setObraAtiva, salvarObra, excluirObra, toast, podeEditarArea } = useApp();
  const podeEditar = podeEditarArea('obras');
  const podeExcluir = podeEditar && podeEditarArea('compras') && podeEditarArea('cronograma');
  const { confirmar } = useDialogo();
  const nav = useNavigate();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>(lerSituacao);
  const [editId, setEditId] = useState<number | null>(null); // null = nova
  const [aberto, setAberto] = useState(false); // formulário visível só ao clicar em Nova Obra ou Editar
  const [f, setF] = useState<Form>(vazio);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const q = busca.toLowerCase();
  const doFiltro = porSituacao(db.obras, situacao);
  const lista = q ? doFiltro.filter((o) => o.nome.toLowerCase().includes(q) || o.codigo.toLowerCase().includes(q)) : doFiltro;

  const nova = () => { setEditId(null); setF(vazio); setAberto(true); };
  const editar = (o: Obra) => { setEditId(o.id); setF(doObra(o)); setAberto(true); };
  const fechar = () => { setAberto(false); setEditId(null); setF(vazio); };
  const salvar = () => {
    const nome = f.nome.trim(); const ac21 = parseFloat(f.ac21) || 0;
    if (!nome) { toast('Informe o nome da obra.'); return; }
    if (!(ac21 > 0)) { toast('Informe um valor de AC21 maior que zero.'); return; }
    if (f.inicio && f.fim && f.fim < f.inicio) { toast('A previsão de término não pode ser anterior ao início.'); return; }
    const cod = f.codigo.trim().toLowerCase();
    if (cod && db.obras.some((x) => x.id !== editId && x.codigo.trim().toLowerCase() === cod)) { toast('Já existe uma obra com esse código.'); return; }
    salvarObra({
      nome, ac21, codigo: f.codigo.trim(), local: f.local.trim(), responsavel: f.responsavel.trim(),
      inicio: f.inicio, fim: f.fim, status: f.status, obs: f.obs.trim(),
    }, editId);
    toast(editId == null ? 'Obra cadastrada.' : 'Obra atualizada.');
    fechar();
  };
  const excluir = async (o: Obra) => {
    const nc = db.compras.filter((c) => c.obraId === o.id).length;
    if (!(await confirmar(`Excluir a obra "${o.nome}"? Serão removidos também seus ${plural(o.itens.length, 'item', 'itens')} e ${plural(nc, 'compra', 'compras')}. Esta ação não pode ser desfeita.`, { confirmar: 'Excluir obra', perigo: true }))) return;
    excluirObra(o.id); if (editId === o.id) fechar();
  };
  const detalhe = (o: Obra) => { setObraAtiva(o.id); nav('/detalhe'); };

  return (
    <div className="content">
      <div className="action-row">
        {podeEditar && <button className="btn btn-accent" onClick={nova}><Plus size={15} /> Nova Obra</button>}
        <div className="spacer" />
        <select aria-label="Situação das obras" className="sel-situacao" value={situacao} onChange={(e) => { const s = e.target.value as Situacao; setSituacao(s); gravarSituacao(s); }}>
          {SITUACOES.map((x) => <option key={x.id} value={x.id}>{x.rotulo} ({porSituacao(db.obras, x.id).length})</option>)}
        </select>
        <div className="search"><Search size={15} /><input aria-label="Buscar obra" placeholder="Buscar obra..." value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      </div>

      <div className="obras-split um">
        <div className="panel">
          <div className="panel-head"><div className="metric-icon mi-blue"><Building2 size={17} /></div>Obras</div>
          <div className="obra-list-pad">
            {lista.length === 0 && <Empty icon={<Search size={30} />}>{q || !db.obras.length ? 'Nenhuma obra encontrada.' : situacao === 'finalizadas' ? 'Nenhuma obra finalizada.' : 'Nenhuma obra ativa. Escolha "Todas as obras" para ver as outras.'}</Empty>}
            {lista.map((o) => {
              const idx = db.obras.indexOf(o);
              const pg = totalPago(db, o), comp = totalComprometido(db, o), p = pctInt(comp, o.ac21), sl = o.ac21 - comp;
              const nv = nivelPct(p);
              const fis = resumoCrono(cronos[String(o.id)]);
              return (
                <div key={o.id} className={'obra-card' + (obraAtivaId === o.id || editId === o.id ? ' selected' : '')}>
                  <div className="obra-dot" style={{ background: CORES[idx % CORES.length] }} />
                  <div onClick={() => detalhe(o)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>{o.nome}</strong>
                      <span className={'badge badge-' + (nv === 'ok' ? 'ok' : nv)}>{rotuloNivel[nv]}</span>
                      <span className={'badge ' + badgeStatusObra(o.status)}>{o.status}</span>
                    </div>
                    <div className="sub-line">{o.codigo} · {o.local} · Resp.: {o.responsavel || '-'} · {fmtData(o.inicio)} → {fmtData(o.fim)}</div>
                    <div className="obra-kpis">
                      <div><div className="k">AC21</div><strong>{fmt(o.ac21)}</strong></div>
                      <div><div className="k">Comprometido</div><strong style={{ color: corPct(p) }}>{fmt(comp)}</strong></div>
                      <div><div className="k">Pago</div><strong>{fmt(pg)}</strong></div>
                      <div><div className="k">Saldo</div><strong style={{ color: sl < 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(sl)}</strong></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}><Progress value={p} color={corPct(p)} /></div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: corPct(p) }}>{p}% comprometido</span>
                    </div>
                    <div className="fisico" title="Avanço físico do cronograma desta obra">
                      <CalendarRange size={13} />
                      {fis ? (<><span>Físico {pctFis(fis.pct)}%</span><Progress value={fis.pct} color="var(--series-3)" /><span>{fis.fim != null ? 'término ' + n2br(fis.fim) : ''}</span></>)
                        : <span style={{ color: 'var(--text3)' }}>Sem cronograma. Abra Cronograma no menu</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                    <button className="btn btn-sm" onClick={() => detalhe(o)}><ClipboardList size={13} /> Detalhes</button>
                    {podeEditar && <button className="btn btn-sm" onClick={() => editar(o)}><Pencil size={13} /> Editar</button>}
                    {podeExcluir && <button className="btn btn-sm btn-danger" onClick={() => excluir(o)}><Trash2 size={13} /> Excluir</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {podeEditar && aberto && (
        <Modal title={editId == null ? 'Nova Obra' : 'Editar Obra'} onClose={fechar} footer={<>
          <button className="btn" onClick={fechar}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar}><Check size={15} /> Salvar Obra</button>
        </>}>
              <div className="form-grid">
                <div className="form-group form-full"><label htmlFor="obras-1">Nome da Obra <span className="req">*</span></label>
                  <input id="obras-1" value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Reforma Sede Porto Alegre" /></div>
                <div className="form-group"><label htmlFor="obras-2">Código</label><input id="obras-2" value={f.codigo} onChange={(e) => set('codigo', e.target.value)} placeholder="Ex: AC21-POA-001" /></div>
                <div className="form-group"><label htmlFor="obras-3">Localização</label><input id="obras-3" value={f.local} onChange={(e) => set('local', e.target.value)} placeholder="Cidade, Estado" /></div>
                <div className="form-group"><label htmlFor="obras-4">Responsável</label><input id="obras-4" value={f.responsavel} onChange={(e) => set('responsavel', e.target.value)} placeholder="Nome do responsável" /></div>
                <div className="form-group"><label htmlFor="obras-5">Data de Início</label><input id="obras-5" type="date" value={f.inicio} onChange={(e) => set('inicio', e.target.value)} /></div>
                <div className="form-group"><label htmlFor="obras-6">Previsão de Término</label><input id="obras-6" type="date" value={f.fim} onChange={(e) => set('fim', e.target.value)} /></div>
                <div className="form-group"><label htmlFor="obras-7">AC21 Aprovado (R$) <span className="req">*</span></label>
                  <CampoDinheiro id="obras-7" value={f.ac21} onChange={(v) => set('ac21', v)} /></div>
                <div className="form-group"><label htmlFor="obras-8">Status</label>
                  <select id="obras-8" value={f.status} onChange={(e) => set('status', e.target.value as StatusObra)}>
                    {STATUS_OBRA.map((s) => <option key={s}>{s}</option>)}
                  </select></div>
                <div className="form-group form-full"><label htmlFor="obras-9">Observações</label>
                  <textarea id="obras-9" value={f.obs} onChange={(e) => set('obs', e.target.value)} placeholder="Anotações gerais sobre a obra..." /></div>
              </div>
        </Modal>
      )}
    </div>
  );
}
