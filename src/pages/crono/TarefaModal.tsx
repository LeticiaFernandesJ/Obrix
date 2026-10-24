import { useEffect, useState } from 'react';
import { BellRing, Check, Lock, UserRound, Users } from 'lucide-react';
import { useApp } from '../../store/AppStore';
import { Modal } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { type Membro, listarMembros } from '../../lib/equipe';
import { aplicarCampo, inicioDaNovaTarefa, novaTarefa, predParse, predTexto } from '../../lib/schedule';
import { hojeN, n2iso, parseData } from '../../lib/dates';

/** Nome que aparece para a equipe: o cadastrado ou, na falta dele, o e-mail. */
export const nomeDoMembro = (m: Pick<Membro, 'nome' | 'email'>) => m.nome || m.email || 'Sem nome';

interface Props {
  /** linha a editar; null cria uma tarefa nova depois da linha selecionada */
  indice: number | null;
  marcoInicial?: boolean;
  /** linha selecionada na grade (a nova tarefa entra logo abaixo dela) */
  selecionada: number;
  onClose: () => void;
  onSalvo: (linha: number) => void;
}

export function TarefaModal({ indice, marcoInicial = false, selecionada, onClose, onSalvo }: Props) {
  const { crono, updateCrono, orgId, userId, toast, podeEditarArea } = useApp();
  /** só altera a própria tarefa: o responsável aparece, mas não dá para trocar */
  const limitado = !podeEditarArea('cronograma');
  const T = crono.tarefas;
  const atual = indice != null ? T[indice] : null;
  /** tarefa já criada: só o % concluído e o responsável podem mudar (o resto fica como foi cadastrado) */
  const travado = indice != null;
  const nuvem = !!supabase && !!orgId;

  const [nome, setNome] = useState(atual?.nome ?? (marcoInicial ? 'Marco' : ''));
  const [marco, setMarco] = useState(atual ? atual.marco || +atual.dur === 0 : marcoInicial);
  const [dur, setDur] = useState(atual ? String(atual.dur) : '1');
  const [ini, setIni] = useState(atual?.iniM != null ? n2iso(atual.iniM) : '');
  const [pred, setPred] = useState(atual ? predTexto(T, atual) : '');
  const [pct, setPct] = useState(atual ? String(Math.round(atual.pct)) : '0');
  const [peso, setPeso] = useState(atual?.peso != null ? String(atual.peso) : '');
  const [modo, setModo] = useState<'equipe' | 'nome'>(atual?.respId ? 'equipe' : nuvem && !atual?.resp ? 'equipe' : 'nome');
  const [respId, setRespId] = useState(atual?.respId ?? '');
  const [respNome, setRespNome] = useState(atual && !atual.respId ? atual.resp : '');
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [erroEquipe, setErroEquipe] = useState(false);

  useEffect(() => {
    if (!nuvem) return;
    let vivo = true;
    listarMembros(supabase!, orgId!).then((m) => { if (vivo) setMembros(m); }).catch(() => { if (vivo) { setErroEquipe(true); setModo('nome'); } });
    return () => { vivo = false; };
  }, [nuvem, orgId]);

  const escolhido = membros?.find((m) => m.user_id === respId) ?? null;
  const vaiAvisar = modo === 'equipe' && !!escolhido && escolhido.user_id !== userId && escolhido.user_id !== (atual?.respId ?? '');
  const sobreSi = modo === 'equipe' && !!escolhido && escolhido.user_id === userId;

  const salvar = () => {
    if (!travado && !nome.trim()) { toast('Informe o nome da tarefa.'); return; }
    const d = marco ? 0 : parseFloat(dur.replace(',', '.'));
    if (!travado && !marco && !(d >= 0)) { toast('A duração precisa ser um número de dias úteis.'); return; }
    const p = parseFloat(pct.replace(',', '.'));
    if (pct.trim() !== '' && !(p >= 0 && p <= 100)) { toast('O percentual concluído vai de 0 a 100.'); return; }
    if (!limitado && modo === 'equipe' && !escolhido) { toast('Escolha uma pessoa da equipe ou use "Só o nome".'); return; }

    const respTexto = limitado ? '' : modo === 'equipe' ? nomeDoMembro(escolhido!) : respNome.trim();
    const respIdFinal = limitado ? null : modo === 'equipe' ? escolhido!.user_id : null;
    const pos = T.length ? Math.min(selecionada + 1, T.length) : 0;
    const linha = indice ?? pos;

    updateCrono((S, cal, ca) => {
      if (indice != null) {
        // tarefa existente: só o percentual e o responsável
        aplicarCampo(S, cal, ca, indice, 'pct', pct.trim() === '' ? '0' : String(p));
        if (!limitado) { S.tarefas[indice].resp = respTexto; S.tarefas[indice].respId = respIdFinal; }
        return;
      }
      // as predecessoras são números das linhas como estão na tela agora, antes de a nova linha entrar
      const predicts = predParse(S.tarefas, pred, indice ?? -1);
      S.tarefas.splice(pos, 0, novaTarefa({ nivel: S.tarefas[selecionada] ? S.tarefas[selecionada].nivel : 0 }));
      const i = pos;
      aplicarCampo(S, cal, ca, i, 'nome', nome.trim());
      aplicarCampo(S, cal, ca, i, 'dur', String(d));
      aplicarCampo(S, cal, ca, i, 'ini', marco && !ini ? '' : ini);
      aplicarCampo(S, cal, ca, i, 'pct', pct.trim() === '' ? '0' : String(p));
      aplicarCampo(S, cal, ca, i, 'peso', peso);
      const t = S.tarefas[i];
      t.pred = predicts.filter((x) => x.id !== t.id);
      // tarefa nova sem data: começa hoje (dia em que foi criada); o término sai da duração
      t.iniM = inicioDaNovaTarefa(parseData(ini), t.pred.length > 0, hojeN());
      t.marco = marco; if (marco) t.dur = 0;
      if (!limitado) { t.resp = respTexto; t.respId = respIdFinal; }
    });
    if (vaiAvisar) toast(`Tarefa salva. ${nomeDoMembro(escolhido!)} será avisado(a) no sino.`);
    onSalvo(linha); onClose();
  };

  return (
    <Modal title={indice == null ? (marcoInicial ? 'Novo marco' : 'Nova tarefa') : 'Dados da tarefa'} size="lg" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className="btn btn-primary" onClick={salvar}><Check size={15} /> {indice == null ? 'Adicionar tarefa' : 'Salvar tarefa'}</button>
    </>}>
      {travado && <p className="aviso-travado"><Lock size={14} /> Depois de criada, só o <b>% concluído</b> e o <b>responsável</b> podem ser alterados. Os demais dados ficam como foram cadastrados.</p>}
      {indice == null && T.length > 0 && <p className="dica" style={{ marginTop: 0 }}>Entra logo abaixo da linha {selecionada + 1}{T[selecionada]?.nome ? ` (${T[selecionada].nome})` : ''}, no mesmo nível.</p>}
      <div className="form-grid">
        <div className="form-group form-full"><label htmlFor="tarefa-nome">Nome da tarefa <span className="req">*</span></label>
          <input id="tarefa-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Concretagem da laje do 2º pavimento" maxLength={160} autoFocus={!travado} readOnly={travado} />
        </div>

        <div className="form-group"><label htmlFor="tarefa-tipo">Tipo</label>
          <select id="tarefa-tipo" disabled={travado} value={marco ? 'marco' : 'tarefa'} onChange={(e) => { const m = e.target.value === 'marco'; setMarco(m); if (!m && (dur === '0' || dur === '')) setDur('1'); }}>
            <option value="tarefa">Tarefa (tem duração)</option><option value="marco">Marco (um evento, duração 0)</option>
          </select></div>
        <div className="form-group"><label htmlFor="tarefa-dur">Duração (dias úteis)</label>
          <input id="tarefa-dur" inputMode="decimal" value={marco ? '0' : dur} disabled={marco || travado} onChange={(e) => setDur(e.target.value)} /></div>

        <div className="form-group"><label htmlFor="tarefa-ini">Data de início</label>
          <input id="tarefa-ini" type="date" disabled={travado} value={ini} onChange={(e) => setIni(e.target.value)} />
          <span className="dica">{indice == null ? 'Vazio: começa hoje, no dia em que a tarefa é criada (ou depois das predecessoras). O término vem da duração.' : 'Vazio: o início vem das predecessoras ou da data do projeto. O término vem da duração.'}</span></div>
        <div className="form-group"><label htmlFor="tarefa-pred">Predecessoras (opcional)</label>
          <input id="tarefa-pred" readOnly={travado} value={pred} onChange={(e) => setPred(e.target.value)} placeholder="Ex: 5  ou  5TI+2  ou  4;7II" />
          <span className="dica">Número da linha que precisa terminar antes. TI+2 = começa 2 dias depois.</span></div>

        <div className="form-group"><label htmlFor="tarefa-pct">% concluído</label>
          <input id="tarefa-pct" inputMode="decimal" autoFocus={travado} value={pct} onChange={(e) => setPct(e.target.value)} /></div>
        <div className="form-group"><label htmlFor="tarefa-peso">Peso (opcional)</label>
          <input id="tarefa-peso" inputMode="decimal" readOnly={travado} value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Importância da tarefa na obra" /></div>

        {limitado ? (
          <div className="form-group form-full">
            <label>Responsável</label>
            <div className="resp-fixo"><UserRound size={15} /> {atual?.resp || 'Você'}</div>
            <span className="dica">Quem muda o responsável é um administrador ou editor do cronograma.</span>
          </div>
        ) : (
        <div className="form-group form-full">
          <label id="tarefa-resp-rotulo">Responsável</label>
          {nuvem && !erroEquipe ? (
            <div className="seg resp-seg" role="group" aria-labelledby="tarefa-resp-rotulo">
              <button type="button" className={modo === 'equipe' ? 'on' : ''} aria-pressed={modo === 'equipe'} onClick={() => setModo('equipe')}><Users size={14} /> Pessoa da equipe</button>
              <button type="button" className={modo === 'nome' ? 'on' : ''} aria-pressed={modo === 'nome'} onClick={() => setModo('nome')}><UserRound size={14} /> Só o nome</button>
            </div>
          ) : null}
          {modo === 'equipe' && nuvem && !erroEquipe ? (
            <>
              <select id="tarefa-resp-equipe" aria-label="Pessoa da equipe" value={respId} onChange={(e) => setRespId(e.target.value)} disabled={!membros}>
                <option value="">{membros ? 'Escolha uma pessoa da equipe' : 'Carregando a equipe…'}</option>
                {(membros ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{nomeDoMembro(m)}{m.user_id === userId ? ' (você)' : ''}</option>)}
              </select>
              {vaiAvisar && <span className="aviso-resp"><BellRing size={14} /> {nomeDoMembro(escolhido!)} recebe um aviso no sino do Obrix assim que você salvar.</span>}
              {sobreSi && <span className="dica">Você escolheu você mesmo, então não há aviso.</span>}
              {!vaiAvisar && !sobreSi && escolhido && <span className="dica">Já é a pessoa responsável: nenhum aviso novo.</span>}
            </>
          ) : (
            <>
              <input id="tarefa-resp-nome" aria-label="Nome do responsável" value={respNome} onChange={(e) => setRespNome(e.target.value)} placeholder="Ex: Equipe de alvenaria, Seu José" maxLength={80} />
              {nuvem && !erroEquipe && <span className="dica">Só o nome: a pessoa não é avisada e não precisa ter conta no Obrix.</span>}
              {erroEquipe && <span className="dica">Não consegui carregar a equipe agora. Digite o nome do responsável.</span>}
            </>
          )}
        </div>
        )}
      </div>
    </Modal>
  );
}
