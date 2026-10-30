import { useRef, useState } from 'react';
import { FolderOpen, HelpCircle, Home, Save, Send, Upload } from 'lucide-react';
import { useApp } from '../../store/AppStore';
import { Modal } from '../../components/ui';
import { useDialogo } from '../../components/Dialogo';
import { fmtN,
  baixar, curvaPrevista, desempacotar, empacotar, exemplo, exportarCSV, importarTexto, nomeArquivo,
  normalizarEstado, novaTarefa, novoEstado, pctPrevistoEm, pctRealAtual, type Estado, type Tarefa,
} from '../../lib/schedule';
import { AVISO_ARQUIVO_GRANDE, MODOS_IMPORT, arquivoGrandeDemais, type Extra, type ModoImport, aplicarImportacao, lerArquivo, montarArquivo, textoResumo } from '../../lib/importacao';
import { exportarMSProject, lerMSProject } from '../../lib/msproject';
import { hojeN, n2br, parseData } from '../../lib/dates';

type M = 'home' | 'import' | 'save' | 'open' | 'share' | 'help' | null;
const BASE = import.meta.env.BASE_URL;

export function CronoActions() {
  const { crono, cal, calc, carregarCrono, backupsCrono, restaurarCrono, obraAtual, readOnly, podeEditarArea, toast } = useApp();
  const podeEditar = podeEditarArea('cronograma');
  const { avisar, confirmar } = useDialogo();
  const [m, setM] = useState<M>(null);
  const fechar = () => setM(null);
  const filePick = useRef<HTMLInputElement>(null);
  const modoArq = useRef<'json' | 'csv' | 'msp'>('json');
  const [impTxt, setImpTxt] = useState('');
  const [modo, setModo] = useState<ModoImport>('atualizar');
  const [opLink, setOpLink] = useState('');
  const [links, setLinks] = useState<{ ro: string; ed: string } | null>(null);
  const [validade, setValidade] = useState(30);

  const obraRef = obraAtual ? { id: obraAtual.id, nome: obraAtual.nome, codigo: obraAtual.codigo } : null;
  const nomeObra = obraAtual ? `${obraAtual.codigo ? obraAtual.codigo + ' - ' : ''}${obraAtual.nome}` : 'esta obra';
  /** obra que estava aberta quando o arquivo foi escolhido: se mudar até a leitura, nada é importado */
  const alvo = useRef<number | null>(null);
  const escolherArquivo = (tipo: 'json' | 'csv' | 'msp') => { modoArq.current = tipo; alvo.current = obraAtual?.id ?? null; filePick.current?.click(); };
  const arquivoJson = () => JSON.stringify(montarArquivo(obraRef, crono), null, 1);
  const zeraHash = () => { try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch { /* ok */ } };

  /** Calcula o resultado, mostra o que vai mudar nesta obra, pede confirmação e só então aplica (tudo ou nada). */
  const aplicar = async (vindas: Tarefa[], md: ModoImport, opc: { mesmaObra?: boolean; extra?: Extra; aviso?: string; origem?: string } = {}): Promise<boolean> => {
    const destino = obraAtual?.id;
    try {
      const r = aplicarImportacao(crono, vindas, md, opc);
      const msg = `${opc.aviso ?? ''}Importar na obra "${nomeObra}"?\n\nResultado: ${textoResumo(r.resumo)}.\n\nAs outras obras não são alteradas. Uma cópia da versão atual fica guardada e pode ser restaurada.`;
      if (!(await confirmar(msg, { titulo: 'Importar cronograma', confirmar: 'Importar', perigo: md === 'substituir' || !!opc.aviso }))) return false;
      if (!carregarCrono(r.estado, { obraId: destino, motivo: `Antes de importar${opc.origem ? ' ' + opc.origem : ''}` })) { await avisar('Não foi possível importar. Nada foi alterado.'); return false; }
      toast(`Importado na obra ${nomeObra}: ${textoResumo(r.resumo)}.`);
      return true;
    } catch (e) { await avisar(`Não importei: ${(e as Error).message} Nada foi alterado.`); return false; }
  };
  /** Troca o cronograma inteiro da obra por um já pronto (arquivo .json ou link), com a mesma conferência. */
  const aplicarCompleto = async (est: Estado, aviso = '', origem = ''): Promise<boolean> => {
    const destino = obraAtual?.id;
    try {
      if (!est.tarefas.length) throw new Error('o arquivo não tem nenhuma tarefa.');
      const msg = `${aviso}Substituir o cronograma da obra "${nomeObra}" pelo do arquivo (${est.tarefas.length} tarefas)?\n\nAs outras obras não são alteradas. Uma cópia da versão atual fica guardada e pode ser restaurada.`;
      if (!(await confirmar(msg, { titulo: 'Abrir cronograma', confirmar: 'Substituir', perigo: true }))) return false;
      if (!carregarCrono(est, { obraId: destino, motivo: `Antes de abrir ${origem || 'um cronograma'}` })) { await avisar('Não foi possível abrir. Nada foi alterado.'); return false; }
      toast(`Cronograma da obra ${nomeObra} substituído.`);
      return true;
    } catch (e) { await avisar(`Não abri: ${(e as Error).message} Nada foi alterado.`); return false; }
  };

  const importar = async () => {
    const tmp = novoEstado(); const n = importarTexto(tmp, cal, impTxt);
    if (!n) { toast('Nada reconhecido. Confira o texto colado.'); return; }
    if (await aplicar(tmp.tarefas, modo, { origem: 'do texto colado' })) { fechar(); setImpTxt(''); }
  };

  const onArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (arquivoGrandeDemais(f)) { e.target.value = ''; void avisar(AVISO_ARQUIVO_GRANDE + ' Nada foi alterado.'); return; }
    const destino = alvo.current; const tipo = modoArq.current; const doImport = m === 'import';
    const r = new FileReader();
    r.onload = () => {
      void (async () => {
        try {
          if (destino !== (obraAtual?.id ?? null)) { await avisar('Você trocou de obra enquanto escolhia o arquivo. Nada foi alterado; escolha o arquivo de novo.'); return; }
          const txt = String(r.result);
          if (/\.xml$/i.test(f.name) || tipo === 'msp') {
            const p = lerMSProject(txt);
            if (await aplicar(p.tarefas, modo, { extra: { cal: p.cal, inicio: p.inicio, nome: p.nome }, origem: f.name })) fechar();
          } else if (/\.(csv|txt)$/i.test(f.name) || tipo === 'csv') {
            const tmp = novoEstado(); const n = importarTexto(tmp, cal, txt);
            if (!n) { toast('Nada reconhecido. Confira o arquivo.'); return; }
            if (await aplicar(tmp.tarefas, modo, { origem: f.name })) fechar();
          } else {
            const { estado, obra } = lerArquivo(JSON.parse(txt));
            const mesma = !!obra && obra.id === obraAtual?.id && obra.nome === obraAtual?.nome;
            const aviso = obra && !mesma ? `ATENÇÃO: este arquivo foi exportado da obra "${obra.codigo ? obra.codigo + ' - ' : ''}${obra.nome}" e você está na obra "${nomeObra}".\n\n` : '';
            const md: ModoImport = doImport ? modo : 'substituir';
            const ok = md === 'substituir' ? await aplicarCompleto(estado, aviso, f.name) : await aplicar(estado.tarefas, md, { mesmaObra: mesma, aviso, origem: f.name });
            if (ok) fechar();
          }
        } catch (err) { void avisar('Não consegui ler este arquivo: ' + (err as Error).message + ' Nada foi alterado.'); }
      })();
    };
    r.readAsText(f, 'utf-8'); e.target.value = '';
  };

  const abrirLink = async () => {
    const t = opLink.trim().replace(/\s+/g, '');
    const mm = /[#&?](?:v|p)=([A-Za-z0-9_-]+)/.exec(t);
    const carga = mm ? mm[1] : /^[zj][A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
    if (!carga) { void avisar('Não encontrei o código do cronograma nesse texto. Cole o link inteiro, do http até o final.'); return; }
    try { const obj = await desempacotar(carga); if (await aplicarCompleto(normalizarEstado(obj), '', 'um link')) fechar(); }
    catch (e) { void avisar(/expirou|grande demais/.test((e as Error).message) ? (e as Error).message : 'O link parece incompleto, provavelmente foi cortado pelo e-mail. Peça o arquivo .json em anexo.'); }
  };

  const gerarLinks = async (dias: number) => {
    setLinks(null);
    const base = location.origin + BASE;
    const p = await empacotar(crono, dias);
    setLinks({ ro: base + '#v=' + p, ed: base + '#p=' + p });
  };
  const abrirShare = async () => { setM('share'); await gerarLinks(validade); };
  const copiar = (txt: string) => {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Link copiado.')).catch(() => toast('Selecione o link e copie com Ctrl+C.'));
  };

  const sd = parseData(crono.meta.statusDate) ?? hojeN();
  const emailHref = () => {
    const cp = curvaPrevista(crono, calc, cal);
    const prev = pctPrevistoEm(sd, cp), real = pctRealAtual(calc);
    const grande = (links?.ro.length ?? 0) > 28000;
    const assunto = encodeURIComponent(`Cronograma - ${crono.meta.nome || 'obra'} - status ${n2br(sd)}`);
    const corpo = encodeURIComponent(
      `Segue a atualização do cronograma.\n\nObra: ${crono.meta.nome || '-'}\nContrato: ${crono.meta.contrato || '-'}\nEmpresa: ${crono.meta.empresa || '-'}\n` +
      `Data de status: ${n2br(sd)}\nAvanço realizado: ${fmtN(real, 1)}%  (previsto ${fmtN(prev, 1)}%)\n\n` +
      (crono.meta.obs ? `Observações:\n${crono.meta.obs}\n\n` : '') +
      `Painel online (somente leitura). Cole o link no navegador:\n${grande ? '[link muito grande: envie o arquivo em anexo]' : links?.ro}\n`);
    return `mailto:${encodeURIComponent(crono.meta.pmo || '')}?subject=${assunto}&body=${corpo}`;
  };

  const tem = crono.tarefas.length > 0;
  const modais = {
    home: (
      <Modal title="Tela inicial" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Voltar ao cronograma</button>
        {tem && <button className="btn" onClick={() => baixar(nomeArquivo(crono, 'json'), arquivoJson())}>Baixar cópia</button>}
        <button className="btn" onClick={() => setM('import')}>Colar do Excel</button>
        <button className="btn" onClick={() => { zeraHash(); const E = novoEstado(); E.tarefas = [novaTarefa({ nome: '' })]; carregarCrono(E); fechar(); }}>Começar do zero</button>
        <button className="btn btn-primary" onClick={() => { zeraHash(); carregarCrono(exemplo()); fechar(); }}>Ver um exemplo pronto</button>
      </>}>
        <p>Um cronograma de obra completo, com Gantt, dependências, linha de base e curva S, integrado ao controle de verbas AC21 do Obrix.</p>
        {tem
          ? <div className="note warn"><b>Atenção:</b> começar de novo substitui o cronograma que está aberto. Se ainda não salvou, clique em <b>Baixar cópia</b> primeiro.</div>
          : <div className="note">Escolha por onde começar. Você pode trocar depois a qualquer momento.</div>}
      </Modal>
    ),
    import: (
      <Modal title="Importar cronograma" size="lg" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn" onClick={() => escolherArquivo('msp')}>Arquivo do MS Project (.xml)…</button>
        <button className="btn" onClick={() => escolherArquivo('csv')}>Arquivo CSV…</button>
        <button className="btn" onClick={() => escolherArquivo('json')}>Arquivo do Obrix (.json)…</button>
        <button className="btn btn-primary" onClick={() => void importar()}>Importar o texto colado</button>
      </>}>
        <div className="note">A importação vale <b>só para a obra {nomeObra}</b>. As outras obras nunca são alteradas, e antes de aplicar você confirma o que vai mudar.</div>
        <p>Copie as linhas do Excel (Ctrl+C) e cole abaixo, ou cole um texto separado por ponto e vírgula. A primeira linha pode ser o cabeçalho.</p>
        <div className="note"><b>MS Project:</b> no Project, use Arquivo &gt; Salvar como &gt; XML e escolha o arquivo pelo botão abaixo. Vêm tarefas, níveis, durações, predecessoras, percentuais e responsáveis. Em "Substituir" vêm também o calendário e a data de início. Arquivos .mpp e do Primavera não são lidos.</div>
        <div className="note"><b>Colunas reconhecidas:</b> EDT/Item · Tarefa · Duração · Início · Término · Predecessoras · % · Peso · Responsável.<br />
          O nível das fases vem do EDT (1, 1.1, 1.1.2) ou dos espaços no início do nome.</div>
        <div className="field"><label htmlFor="cronoactions-1">Cole aqui</label>
          <textarea id="cronoactions-1" className="mono" value={impTxt} onChange={(e) => setImpTxt(e.target.value)}
            placeholder={'Item\tTarefa\tDuração\tInício\tPredecessoras\n1\tFundações\t\t\n1.1\tEscavação\t5\t02/03/2026\t\n1.2\tSapatas\t8\t\t2'} /></div>
        <div className="field"><label htmlFor="cronoactions-modo">O que fazer com as tarefas</label>
          <select id="cronoactions-modo" value={modo} onChange={(e) => setModo(e.target.value as ModoImport)}>
            {MODOS_IMPORT.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
          </select>
          <small>{MODOS_IMPORT.find((x) => x.id === modo)?.ajuda}</small></div>
        {backupsCrono.length > 0 && (
          <div className="field"><label>Versões anteriores desta obra</label>
            {backupsCrono.map((b) => (
              <div key={b.ts} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', padding: '6px 0', fontSize: 12.5 }}>
                <span>{new Date(b.ts).toLocaleString('pt-BR')} · {b.motivo} · {b.estado.tarefas.length} tarefas</span>
                <button className="btn btn-sm" onClick={async () => {
                  if (await confirmar(`Voltar o cronograma da obra "${nomeObra}" para a versão de ${new Date(b.ts).toLocaleString('pt-BR')}? A versão atual também fica guardada.`, { titulo: 'Restaurar versão', confirmar: 'Restaurar' })) { restaurarCrono(b.ts); fechar(); toast('Versão anterior restaurada.'); }
                }}>Restaurar</button>
              </div>))}
          </div>)}
      </Modal>
    ),
    save: (
      <Modal title="Salvar" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn" onClick={() => { fechar(); setTimeout(() => window.print(), 150); }}>Imprimir / PDF</button>
        <button className="btn" onClick={() => { exportarCSV(crono, calc); fechar(); }}>Baixar CSV (Excel)</button>
        <button className="btn" onClick={() => { baixar(nomeArquivo(crono, 'xml'), exportarMSProject(crono, calc), 'application/xml;charset=utf-8'); fechar(); }}>Exportar para MS Project (.xml)</button>
        <button className="btn btn-primary" onClick={() => { baixar(nomeArquivo(crono, 'json'), arquivoJson()); fechar(); }}>Baixar cronograma (.json)</button>
      </>}>
        <p>O arquivo <b>.json</b> é o cronograma completo e pode ser reaberto e editado aqui. O <b>.csv</b> abre no Excel para conferência ou impressão e o <b>.xml</b> abre no Microsoft Project.</p>
      </Modal>
    ),
    open: (
      <Modal title="Abrir cronograma" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn" onClick={() => escolherArquivo('json')}>Escolher arquivo…</button>
        <button className="btn btn-primary" onClick={abrirLink}>Abrir link colado</button>
      </>}>
        <p>Abra um arquivo <b>.json</b> que você salvou ou recebeu em anexo, ou cole abaixo o link que chegou por e-mail. Ele <b>substitui o cronograma da obra {nomeObra}</b> (as outras obras não mudam) e você confirma antes.</p>
        <div className="field"><label htmlFor="cronoactions-2">Link ou código recebido</label>
          <textarea id="cronoactions-2" style={{ minHeight: 80, fontSize: 11 }} value={opLink} onChange={(e) => setOpLink(e.target.value)} placeholder="cole aqui o link inteiro" /></div>
      </Modal>
    ),
    share: (
      <Modal title="Enviar ao PMO" size="lg" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Fechar</button>
        <button className="btn" onClick={() => baixar(nomeArquivo(crono, 'json'), arquivoJson())}>Baixar arquivo para anexar</button>
        {links && <a className="btn btn-primary" href={emailHref()}>Abrir e-mail</a>}
      </>}>
        {!links ? <p>Gerando o link…</p> : (<>
          <p>O cronograma inteiro viaja dentro do próprio link: não há servidor, senha nem cadastro. Quem abrir vê o painel e o Gantt em modo somente leitura.</p>
          {links.ro.length > 28000 && <div className="note warn"><b>Cronograma grande.</b> O link ficou com {links.ro.length.toLocaleString('pt-BR')} caracteres e alguns e-mails cortam links longos. Prefira enviar o arquivo .json em anexo.</div>}
          <div className="field"><label htmlFor="link-validade">Validade do link</label>
            <select id="link-validade" value={validade} onChange={(e) => { const d = Number(e.target.value); setValidade(d); void gerarLinks(d); }}>
              <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option><option value={0}>Sem validade</option>
            </select></div>
          <div className="field"><label htmlFor="link-ro">Link somente leitura (para o PMO)</label>
            <div className="linkbox"><input id="link-ro" readOnly value={links.ro} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copiar(links.ro)}>Copiar</button></div></div>
          <div className="field"><label htmlFor="link-ed">Link editável (para quem vai atualizar o cronograma)</label>
            <div className="linkbox"><input id="link-ed" readOnly value={links.ed} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copiar(links.ed)}>Copiar</button></div></div>
          <div className="note">Toda semana: atualize os <b>%</b>, clique em <b>Registrar medição</b> e gere um link novo. O link antigo continua mostrando a foto daquela semana.</div>
          <div className="note warn"><b>Privacidade:</b> o link carrega os dados do cronograma dentro dele. Qualquer pessoa que o receba (ou o encaminhe) vê o cronograma, e ele <b>não pode ser cancelado</b> depois de enviado, mas deixa de abrir quando a validade acaba. Envie só a quem deve ver; para restringir o acesso, mande o arquivo .json em anexo.</div>
          <div className="note"><b>O link abre direto?</b> Só se o Obrix estiver publicado num endereço da internet ou da rede da empresa. Caso contrário, envie o <b>arquivo .json</b> em anexo e o PMO usa <b>Abrir</b>.</div>
        </>)}
      </Modal>
    ),
    help: (
      <Modal title="Como usar" size="lg" onClose={fechar} footer={<>
        <button className="btn" onClick={() => { carregarCrono(exemplo()); fechar(); toast('Exemplo carregado.'); }}>Carregar exemplo de obra</button>
        <button className="btn btn-primary" onClick={fechar}>Entendi</button>
      </>}>
        <p><b>1. Adicione as tarefas pelo botão Tarefa.</b> A janela pede o nome, a <b>duração em dias úteis</b>, a data de início, as predecessoras e o responsável; as datas se calculam sozinhas. Depois de criada, dois cliques na linha (ou <b>Detalhes</b>) abrem a mesma janela com todos os dados liberados para alterar; na grade, só o <b>%</b> se edita direto.</p>
        <p><b>2. Ligue as tarefas.</b> No campo <b>Predecessoras</b> da janela escreva o número da linha que precisa terminar antes (ex.: <kbd>5</kbd>). Para começar 2 dias depois: <kbd>5TI+2</kbd>. Para começarem juntas: <kbd>5II</kbd>.</p>
        <p><b>3. Agrupe em fases.</b> Selecione a linha e clique em recuar: a linha de cima vira fase e soma sozinha datas e avanço.</p>
        <p><b>4. Salve a linha de base</b> quando o cronograma for aprovado. É o "previsto" contra o qual todo mundo vai comparar depois.</p>
        <p><b>5. Toda semana:</b> ajuste a <b>data de status</b>, atualize a coluna <b>%</b> de cada serviço (é a única que se edita direto na grade), clique em <b>Registrar medição</b> e depois em <b>Enviar ao PMO</b>.</p>
        <div className="note"><b>Atalhos:</b> <kbd>Enter</kbd> desce uma linha (não cria tarefa nova) · dois cliques na linha abrem a janela da tarefa para alterar qualquer dado (na grade só o % é direto) · <kbd>Alt</kbd>+<kbd>→</kbd>/<kbd>←</kbd> recua/avança nível · <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> move a linha · duração <kbd>0</kbd> vira marco (losango).</div>
        <div className="note"><b>Onde ficam os dados?</b> No navegador deste computador. Para compartilhar use <b>Enviar ao PMO</b> (link) ou <b>Salvar arquivo</b> (.json).</div>
      </Modal>
    ),
  };

  return (
    <>
      {podeEditar && <button className="btn btn-icon" title="Tela inicial" aria-label="Tela inicial" onClick={() => setM('home')}><Home size={15} /></button>}
      {podeEditar && <button className="btn" onClick={() => setM('import')}><Upload size={15} /> Importar</button>}
      <button className="btn" onClick={() => setM('save')}><Save size={15} /> Salvar arquivo</button>
      {podeEditar && <button className="btn" onClick={() => setM('open')}><FolderOpen size={15} /> Abrir</button>}
      <button className="btn btn-primary" onClick={abrirShare}><Send size={15} /> {readOnly ? 'Copiar link' : 'Enviar ao PMO'}</button>
      <button className="btn btn-icon" title="Ajuda" aria-label="Ajuda" onClick={() => setM('help')}><HelpCircle size={15} /></button>
      <input ref={filePick} type="file" accept=".json,.cron,.csv,.txt,.xml" hidden onChange={onArquivo} />
      {m && modais[m]}
    </>
  );
}
