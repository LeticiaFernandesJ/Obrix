import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, LogOut, Pencil, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react';
import { useApp } from '../store/AppStore';
import { useDialogo } from '../components/Dialogo';
import { Empty } from '../components/ui';
import { supabase } from '../lib/supabase';
import {
  LISTA_PAPEIS, PAPEIS, type Convite, type Membro, type Papel, apagarConvite, criarConvite, linkConvite, listarConvites,
  definirMeuNome, listarMembros, mudarPapel, removerMembro, renomearOrg, traduzirErro,
} from '../lib/equipe';

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');
const classePapel = (p: Papel) => (p === 'admin' ? 'badge-blue' : p === 'editor' ? 'badge-ok' : 'badge-gray');

export default function Equipe() {
  const { orgId, orgNome, orgs, papel, usuario, nomeUsuario, trocarOrg, recarregarOrgs, toast } = useApp();
  const { confirmar, avisar } = useDialogo();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoPapel, setNovoPapel] = useState<Papel>('editor');
  const [paraQuem, setParaQuem] = useState('');
  const [nome, setNome] = useState(orgNome);
  const [meuNome, setMeuNome] = useState(nomeUsuario);
  const [meuId, setMeuId] = useState<string | null>(null);
  const admin = papel === 'admin';

  useEffect(() => { setNome(orgNome); }, [orgNome]);
  useEffect(() => { setMeuNome(nomeUsuario); }, [nomeUsuario]);
  useEffect(() => { void supabase?.auth.getUser().then(({ data }) => setMeuId(data.user?.id ?? null)); }, []);

  const carregar = useCallback(async () => {
    if (!supabase || !orgId) return;
    setCarregando(true);
    try {
      setMembros(await listarMembros(supabase, orgId));
      setConvites(admin ? await listarConvites(supabase, orgId) : []);
    } catch (e) { void avisar(traduzirErro((e as Error).message), 'Não foi possível carregar a equipe'); }
    setCarregando(false);
  }, [orgId, admin, avisar]);
  useEffect(() => { void carregar(); }, [carregar]);

  const falha = (e: unknown) => void avisar(traduzirErro((e as Error).message), 'Não foi possível concluir');

  if (!supabase || !orgId) {
    return <div className="content"><div className="card"><Empty icon={<Users size={30} />}>Equipes funcionam com login. Entre com a sua conta para convidar pessoas.</Empty></div></div>;
  }

  const copiar = (token: string) => {
    const link = linkConvite(token);
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Link copiado.')).catch(() => void avisar(link, 'Copie o link'));
  };

  const gerarConvite = async () => {
    try {
      const c = await criarConvite(supabase!, orgId, novoPapel, paraQuem);
      setParaQuem(''); await carregar(); copiar(c.token);
    } catch (e) { falha(e); }
  };
  const revogar = async (c: Convite) => {
    if (!(await confirmar('O link deixa de funcionar na hora.', { titulo: 'Cancelar este convite?', confirmar: 'Cancelar convite', cancelar: 'Voltar', perigo: true }))) return;
    try { await apagarConvite(supabase!, c.id); await carregar(); } catch (e) { falha(e); }
  };
  const trocarPapel = async (m: Membro, p: Papel) => {
    try {
      await mudarPapel(supabase!, orgId, m.user_id, p); await carregar();
      if (m.user_id === meuId) recarregarOrgs();
      toast('Papel atualizado.');
    } catch (e) { falha(e); await carregar(); }
  };
  const remover = async (m: Membro) => {
    const eu = m.user_id === meuId;
    const msg = eu ? `Você deixa de ter acesso aos dados de "${orgNome}".` : `${m.nome || m.email || 'Esta pessoa'} deixa de ter acesso aos dados de "${orgNome}".`;
    if (!(await confirmar(msg, { titulo: eu ? 'Sair desta organização?' : 'Remover da equipe?', confirmar: eu ? 'Sair' : 'Remover', perigo: true }))) return;
    try {
      await removerMembro(supabase!, orgId, m.user_id);
      if (eu) recarregarOrgs(); else { await carregar(); toast('Pessoa removida.'); }
    } catch (e) { falha(e); }
  };
  const salvarMeuNome = async () => {
    if (meuNome.trim().length < 3 || meuNome.trim() === nomeUsuario) return;
    try { await definirMeuNome(supabase!, meuNome); recarregarOrgs(); await carregar(); toast('Seu nome foi atualizado.'); } catch (e) { falha(e); }
  };
  const salvarNome = async () => {
    if (!nome.trim() || nome.trim() === orgNome) return;
    try { await renomearOrg(supabase!, orgId, nome); recarregarOrgs(); toast('Nome atualizado.'); } catch (e) { falha(e); }
  };

  return (
    <div className="content">
      <div className="card">
        <div className="card-head">
          <div className="card-title">Organização</div>
          <button className="btn btn-sm" onClick={() => void carregar()}><RefreshCw size={14} /> Atualizar</button>
        </div>
        <div className="filter-bar">
          <div className="form-group" style={{ flex: 2 }}>
            <label htmlFor="equipe-nome">Nome da empresa ou equipe</label>
            <input id="equipe-nome" value={nome} disabled={!admin} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void salvarNome(); }} maxLength={80} />
          </div>
          {admin && <button className="btn btn-primary" onClick={() => void salvarNome()} disabled={!nome.trim() || nome.trim() === orgNome}><Check size={15} /> Salvar nome</button>}
          {orgs.length > 1 && (
            <div className="form-group">
              <label htmlFor="equipe-troca">Trocar de organização</label>
              <select id="equipe-troca" value={orgId} onChange={(e) => trocarOrg(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="note" style={{ marginBottom: 0 }}>Seu papel aqui: <span className={'badge ' + classePapel(papel ?? 'leitor')}>{PAPEIS[papel ?? 'leitor'].rotulo}</span> · {PAPEIS[papel ?? 'leitor'].descricao}</div>
      </div>

      <div className="card">
        <div className="card-title">Seu nome</div>
        <div className="filter-bar">
          <div className="form-group" style={{ flex: 2 }}>
            <label htmlFor="equipe-meunome">Nome completo</label>
            <input id="equipe-meunome" value={meuNome} onChange={(e) => setMeuNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void salvarMeuNome(); }} maxLength={120} placeholder="Como você quer aparecer para a equipe" />
          </div>
          <button className="btn btn-primary" onClick={() => void salvarMeuNome()} disabled={meuNome.trim().length < 3 || meuNome.trim() === nomeUsuario}><Check size={15} /> Salvar meu nome</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Membros ({membros.length})</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pessoa</th><th>Papel</th><th>Desde</th><th className="td-center">Ações</th></tr></thead>
            <tbody>
              {carregando && membros.length === 0 && <tr><td colSpan={4} className="td-empty">Carregando…</td></tr>}
              {membros.map((m) => {
                const eu = m.user_id === meuId;
                return (
                  <tr key={m.user_id}>
                    <td style={{ fontWeight: 500 }}>{m.nome || m.email || 'Sem nome'}{eu && <span className="badge badge-gray" style={{ marginLeft: 8 }}>você</span>}{m.nome && <div style={{ fontWeight: 400, fontSize: 12.5, color: 'var(--text3)' }}>{m.email}</div>}</td>
                    <td style={{ minWidth: 190 }}>
                      {admin ? (
                        <select aria-label={`Papel de ${m.nome || m.email}`} value={m.papel} onChange={(e) => void trocarPapel(m, e.target.value as Papel)} style={{ height: 38, borderRadius: 9 }}>
                          {LISTA_PAPEIS.map((p) => <option key={p} value={p}>{PAPEIS[p].rotulo}</option>)}
                        </select>
                      ) : <span className={'badge ' + classePapel(m.papel)}>{PAPEIS[m.papel].rotulo}</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{dataBR(m.created_at)}</td>
                    <td className="td-center">
                      {(admin || eu) && (
                        <button className="btn btn-sm btn-danger" onClick={() => void remover(m)}>
                          {eu ? <><LogOut size={13} /> Sair</> : <><Trash2 size={13} /> Remover</>}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="legend-row" style={{ marginTop: 14, marginBottom: 0, gap: 18 }}>
          {LISTA_PAPEIS.map((p) => <span key={p}><span className={'badge ' + classePapel(p)}>{PAPEIS[p].rotulo}</span> {PAPEIS[p].descricao}</span>)}
        </div>
      </div>

      {admin ? (
        <div className="card">
          <div className="card-title">Convidar pessoas</div>
          <p style={{ color: 'var(--text2)', marginBottom: 14 }}>
            Gere um link e envie por WhatsApp ou e-mail. Quem abrir o link entra na equipe com o papel escolhido, depois de criar a conta ou entrar. Cada link vale para uma pessoa e expira em 7 dias.
          </p>
          <div className="filter-bar">
            <div className="form-group">
              <label htmlFor="conv-papel">Papel</label>
              <select id="conv-papel" value={novoPapel} onChange={(e) => setNovoPapel(e.target.value as Papel)}>
                {LISTA_PAPEIS.map((p) => <option key={p} value={p}>{PAPEIS[p].rotulo}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label htmlFor="conv-quem">Para quem (opcional, só para você lembrar)</label>
              <input id="conv-quem" value={paraQuem} onChange={(e) => setParaQuem(e.target.value)} placeholder="Ex: Marcos, engenheiro" maxLength={80} />
            </div>
            <button className="btn btn-primary" onClick={() => void gerarConvite()}><UserPlus size={15} /> Gerar link</button>
          </div>

          {convites.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 18 }}>
              <table>
                <thead><tr><th>Convite</th><th>Papel</th><th>Expira em</th><th className="td-center">Ações</th></tr></thead>
                <tbody>
                  {convites.map((c) => (
                    <tr key={c.id}>
                      <td>{c.email || <span style={{ color: 'var(--text3)' }}>Sem anotação</span>}</td>
                      <td><span className={'badge ' + classePapel(c.papel)}>{PAPEIS[c.papel].rotulo}</span></td>
                      <td style={{ fontSize: 12 }}>{dataBR(c.expira_em)}</td>
                      <td className="td-center"><div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-sm" onClick={() => copiar(c.token)}><Copy size={13} /> Copiar link</button>
                        <button className="btn btn-sm btn-danger" aria-label="Cancelar convite" onClick={() => void revogar(c)}><Trash2 size={13} /></button>
                      </div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="note"><Pencil size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Só administradores convidam pessoas e mudam papéis.{usuario ? ` Você está como ${usuario}.` : ''}</div>
      )}
    </div>
  );
}
