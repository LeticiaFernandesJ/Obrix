import { useRef, useState } from 'react';
import { FolderOpen, HelpCircle, Home, Moon, Save, Send, Sun, Upload } from 'lucide-react';
import { useApp } from '../../store/AppStore';
import { Modal } from '../../components/ui';
import {
  baixar, curvaPrevista, desempacotar, empacotar, exemplo, exportarCSV, importarTexto, nomeArquivo,
  novaTarefa, novoEstado, pctPrevistoEm, pctRealAtual, type Estado,
} from '../../lib/schedule';
import { hojeN, n2br, parseData } from '../../lib/dates';

type M = 'home' | 'import' | 'save' | 'open' | 'share' | 'help' | null;
const BASE = import.meta.env.BASE_URL;

export function CronoActions() {
  const { crono, cal, calc, carregarCrono, readOnly, tema, alternarTema, toast } = useApp();
  const [m, setM] = useState<M>(null);
  const fechar = () => setM(null);
  const filePick = useRef<HTMLInputElement>(null);
  const modoArq = useRef<'json' | 'csv'>('json');
  const [impTxt, setImpTxt] = useState('');
  const [impLimpa, setImpLimpa] = useState(false);
  const [opLink, setOpLink] = useState('');
  const [links, setLinks] = useState<{ ro: string; ed: string } | null>(null);

  const clone = (): Estado => JSON.parse(JSON.stringify(crono));
  const zeraHash = () => { try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch { /* ok */ } };

  const importar = () => {
    const S = clone(); if (impLimpa) S.tarefas = [];
    const n = importarTexto(S, cal, impTxt);
    if (n) carregarCrono(S);
    fechar(); setImpTxt('');
    toast(n ? `${n} tarefas importadas.` : 'Nada reconhecido — confira o texto colado.');
  };

  const onArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        if (/\.(csv|txt)$/i.test(f.name) || modoArq.current === 'csv') {
          const S = clone(); const n = importarTexto(S, cal, String(r.result));
          if (n) carregarCrono(S);
          fechar(); toast(`${n} tarefas importadas.`);
        } else {
          carregarCrono(JSON.parse(String(r.result))); fechar(); toast('Cronograma aberto.');
        }
      } catch (err) { alert('Não consegui ler este arquivo: ' + (err as Error).message); }
    };
    r.readAsText(f, 'utf-8'); e.target.value = '';
  };

  const abrirLink = async () => {
    const t = opLink.trim().replace(/\s+/g, '');
    const mm = /[#&?](?:v|p)=([A-Za-z0-9_-]+)/.exec(t);
    const carga = mm ? mm[1] : /^[zj][A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
    if (!carga) { alert('Não encontrei o código do cronograma nesse texto. Cole o link inteiro, do http até o final.'); return; }
    try { const obj = await desempacotar(carga); carregarCrono(obj); fechar(); toast('Cronograma carregado do link.'); }
    catch { alert('O link parece incompleto — provavelmente foi cortado pelo e-mail. Peça o arquivo .json em anexo.'); }
  };

  const abrirShare = async () => {
    setM('share'); setLinks(null);
    const base = location.origin + BASE;
    const p = await empacotar(crono);
    setLinks({ ro: base + '#v=' + p, ed: base + '#p=' + p });
  };
  const copiar = (txt: string) => {
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Link copiado.')).catch(() => toast('Selecione o link e copie com Ctrl+C.'));
  };

  const sd = parseData(crono.meta.statusDate) ?? hojeN();
  const emailHref = () => {
    const cp = curvaPrevista(crono, calc, cal);
    const prev = pctPrevistoEm(sd, cp), real = pctRealAtual(calc);
    const grande = (links?.ro.length ?? 0) > 28000;
    const assunto = encodeURIComponent(`Cronograma — ${crono.meta.nome || 'obra'} — status ${n2br(sd)}`);
    const corpo = encodeURIComponent(
      `Segue a atualização do cronograma.\n\nObra: ${crono.meta.nome || '-'}\nContrato: ${crono.meta.contrato || '-'}\nEmpresa: ${crono.meta.empresa || '-'}\n` +
      `Data de status: ${n2br(sd)}\nAvanço realizado: ${real.toFixed(1)}%  (previsto ${prev.toFixed(1)}%)\n\n` +
      (crono.meta.obs ? `Observações:\n${crono.meta.obs}\n\n` : '') +
      `Painel online (somente leitura) — cole o link no navegador:\n${grande ? '[link muito grande: envie o arquivo em anexo]' : links?.ro}\n`);
    return `mailto:${encodeURIComponent(crono.meta.pmo || '')}?subject=${assunto}&body=${corpo}`;
  };

  const tem = crono.tarefas.length > 0;
  const modais = {
    home: (
      <Modal title="Tela inicial" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Voltar ao cronograma</button>
        {tem && <button className="btn" onClick={() => baixar(nomeArquivo(crono, 'json'), JSON.stringify(crono, null, 1))}>Baixar cópia</button>}
        <button className="btn" onClick={() => setM('import')}>Colar do Excel</button>
        <button className="btn" onClick={() => { zeraHash(); const E = novoEstado(); E.tarefas = [novaTarefa({ nome: '' })]; carregarCrono(E); fechar(); }}>Começar do zero</button>
        <button className="btn btn-primary" onClick={() => { zeraHash(); carregarCrono(exemplo()); fechar(); }}>Ver um exemplo pronto</button>
      </>}>
        <p>Um cronograma de obra completo — Gantt, dependências, linha de base e curva S — integrado ao controle de verbas AC21 da Obrix.</p>
        {tem
          ? <div className="note warn"><b>Atenção:</b> começar de novo substitui o cronograma que está aberto. Se ainda não salvou, clique em <b>Baixar cópia</b> primeiro.</div>
          : <div className="note">Escolha por onde começar. Você pode trocar depois a qualquer momento.</div>}
      </Modal>
    ),
    import: (
      <Modal title="Importar cronograma" size="lg" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn" onClick={() => { modoArq.current = 'csv'; filePick.current?.click(); }}>Escolher arquivo CSV…</button>
        <button className="btn btn-primary" onClick={importar}>Importar</button>
      </>}>
        <p>Copie as linhas do Excel (Ctrl+C) e cole abaixo, ou cole um texto separado por ponto e vírgula. A primeira linha pode ser o cabeçalho.</p>
        <div className="note"><b>Colunas reconhecidas:</b> EDT/Item · Tarefa · Duração · Início · Término · Predecessoras · % · Peso · Responsável.<br />
          O nível das fases vem do EDT (1, 1.1, 1.1.2) ou dos espaços no início do nome.</div>
        <div className="field"><label>Cole aqui</label>
          <textarea className="mono" value={impTxt} onChange={(e) => setImpTxt(e.target.value)}
            placeholder={'Item\tTarefa\tDuração\tInício\tPredecessoras\n1\tFundações\t\t\n1.1\tEscavação\t5\t02/03/2026\t\n1.2\tSapatas\t8\t\t2'} /></div>
        <label className="chip" style={{ cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={impLimpa} onChange={(e) => setImpLimpa(e.target.checked)} /> substituir o cronograma atual</label>
      </Modal>
    ),
    save: (
      <Modal title="Salvar" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn" onClick={() => { fechar(); setTimeout(() => window.print(), 150); }}>Imprimir / PDF</button>
        <button className="btn" onClick={() => { exportarCSV(crono, calc); fechar(); }}>Baixar CSV (Excel)</button>
        <button className="btn btn-primary" onClick={() => { baixar(nomeArquivo(crono, 'json'), JSON.stringify(crono, null, 1)); fechar(); }}>Baixar cronograma (.json)</button>
      </>}>
        <p>O arquivo <b>.json</b> é o cronograma completo — pode ser reaberto e editado aqui. O <b>.csv</b> abre no Excel para conferência ou impressão.</p>
      </Modal>
    ),
    open: (
      <Modal title="Abrir cronograma" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Cancelar</button>
        <button className="btn" onClick={() => { modoArq.current = 'json'; filePick.current?.click(); }}>Escolher arquivo…</button>
        <button className="btn btn-primary" onClick={abrirLink}>Abrir link colado</button>
      </>}>
        <p>Abra um arquivo <b>.json</b> que você salvou ou recebeu em anexo — ou cole abaixo o link que chegou por e-mail.</p>
        <div className="field"><label>Link ou código recebido</label>
          <textarea style={{ minHeight: 80, fontSize: 11 }} value={opLink} onChange={(e) => setOpLink(e.target.value)} placeholder="cole aqui o link inteiro" /></div>
      </Modal>
    ),
    share: (
      <Modal title="Enviar ao PMO" size="lg" onClose={fechar} footer={<>
        <button className="btn" onClick={fechar}>Fechar</button>
        <button className="btn" onClick={() => baixar(nomeArquivo(crono, 'json'), JSON.stringify(crono, null, 1))}>Baixar arquivo para anexar</button>
        {links && <a className="btn btn-primary" href={emailHref()}>Abrir e-mail</a>}
      </>}>
        {!links ? <p>Gerando o link…</p> : (<>
          <p>O cronograma inteiro viaja dentro do próprio link — não há servidor, senha nem cadastro. Quem abrir vê o painel e o Gantt em modo somente leitura.</p>
          {links.ro.length > 28000 && <div className="note warn"><b>Cronograma grande.</b> O link ficou com {links.ro.length.toLocaleString('pt-BR')} caracteres e alguns e-mails cortam links longos. Prefira enviar o arquivo .json em anexo.</div>}
          <div className="field"><label>Link somente leitura (para o PMO)</label>
            <div className="linkbox"><input readOnly value={links.ro} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copiar(links.ro)}>Copiar</button></div></div>
          <div className="field"><label>Link editável (para quem vai atualizar o cronograma)</label>
            <div className="linkbox"><input readOnly value={links.ed} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copiar(links.ed)}>Copiar</button></div></div>
          <div className="note">Toda semana: atualize os <b>%</b>, clique em <b>Registrar medição</b> e gere um link novo. O link antigo continua mostrando a foto daquela semana.</div>
          <div className="note warn"><b>Privacidade:</b> o link carrega os dados do cronograma dentro dele. Qualquer pessoa que o receba (ou o encaminhe) vê o cronograma, e ele <b>não pode ser cancelado</b> depois de enviado. Envie só a quem deve ver; para restringir o acesso, mande o arquivo .json em anexo.</div>
          <div className="note"><b>O link abre direto?</b> Só se o Obrix estiver publicado num endereço da internet ou da rede da empresa. Caso contrário, envie o <b>arquivo .json</b> em anexo e o PMO usa <b>Abrir</b>.</div>
        </>)}
      </Modal>
    ),
    help: (
      <Modal title="Como usar" size="lg" onClose={fechar} footer={<>
        <button className="btn" onClick={() => { carregarCrono(exemplo()); fechar(); toast('Exemplo carregado.'); }}>Carregar exemplo de obra</button>
        <button className="btn btn-primary" onClick={fechar}>Entendi</button>
      </>}>
        <p><b>1. Digite o cronograma como numa planilha.</b> Uma linha por serviço. Preencha o nome e a <b>duração em dias úteis</b> — as datas se calculam sozinhas.</p>
        <p><b>2. Ligue as tarefas.</b> Na coluna <b>Predec.</b> escreva o número da linha que precisa terminar antes (ex.: <kbd>5</kbd>). Para começar 2 dias depois: <kbd>5TI+2</kbd>. Para começarem juntas: <kbd>5II</kbd>.</p>
        <p><b>3. Agrupe em fases.</b> Selecione a linha e clique em recuar — a linha de cima vira fase e soma sozinha datas e avanço.</p>
        <p><b>4. Salve a linha de base</b> quando o cronograma for aprovado. É o "previsto" contra o qual todo mundo vai comparar depois.</p>
        <p><b>5. Toda semana:</b> ajuste a <b>data de status</b>, preencha a coluna <b>%</b> de cada serviço, clique em <b>Registrar medição</b> e depois em <b>Enviar ao PMO</b>.</p>
        <div className="note"><b>Atalhos:</b> <kbd>Enter</kbd> desce uma linha · <kbd>Alt</kbd>+<kbd>→</kbd>/<kbd>←</kbd> recua/avança nível · <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> move a linha · duração <kbd>0</kbd> vira marco (losango).</div>
        <div className="note"><b>Onde ficam os dados?</b> No navegador deste computador. Para compartilhar use <b>Enviar ao PMO</b> (link) ou <b>Salvar arquivo</b> (.json).</div>
      </Modal>
    ),
  };

  return (
    <>
      {!readOnly && <button className="btn btn-icon" title="Tela inicial" onClick={() => setM('home')}><Home size={15} /></button>}
      {!readOnly && <button className="btn" onClick={() => setM('import')}><Upload size={15} /> Importar</button>}
      <button className="btn" onClick={() => setM('save')}><Save size={15} /> Salvar arquivo</button>
      {!readOnly && <button className="btn" onClick={() => setM('open')}><FolderOpen size={15} /> Abrir</button>}
      <button className="btn btn-primary" onClick={abrirShare}><Send size={15} /> {readOnly ? 'Copiar link' : 'Enviar ao PMO'}</button>
      <button className="btn btn-icon" title="Claro/escuro" onClick={alternarTema}>{tema === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
      <button className="btn btn-icon" title="Ajuda" onClick={() => setM('help')}><HelpCircle size={15} /></button>
      <input ref={filePick} type="file" accept=".json,.cron,.csv,.txt" hidden onChange={onArquivo} />
      {m && modais[m]}
    </>
  );
}
