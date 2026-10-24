# Obrix — Gestão inteligente de obras

Sistema web (PWA) que reúne, em um só lugar:

- **Controle de verbas AC21** — obras, itens orçados e não orçados, compras, histórico de alterações, relatórios e exportação para Excel.
- **Cronograma de obra** — um por obra, com Gantt, dependências, caminho crítico, linha de base, curva S, painel para o PMO e envio por link ou arquivo.

Os dados ficam no **Supabase** (login por e-mail e senha, cada usuário vê só os seus dados) e também em cache no navegador para uso offline.

## Tecnologias

React 18 · TypeScript · Vite · React Router · Chart.js · Supabase · vite-plugin-pwa · Vitest

## Como rodar

```bash
npm install
cp .env.example .env     # preencha com os dados do seu projeto Supabase
npm run dev              # http://localhost:5173
```

Sem o `.env`, o app funciona só no navegador (sem login e sem nuvem).

### Variáveis de ambiente

| Variável | Onde achar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / publishable key |

Use **somente** a chave `anon`. Nunca coloque a `service_role` no front-end.

## Banco de dados (Supabase)

1. Abra **SQL Editor → New query**.
2. Cole o conteúdo de [`supabase/schema-completo.sql`](supabase/schema-completo.sql) e clique em **Run**.
   > Atenção: o script recria as sete tabelas do Obrix (`obras`, `itens`, `compras`, `historico`, `cronogramas`, `tarefas`, `medicoes`) e apaga o conteúdo delas. Não mexe em outras tabelas.
3. Em **Authentication → Providers → Email**, escolha se exige confirmação de e-mail (**Confirm email**).
4. Em **Authentication → URL Configuration**, defina o **Site URL** com o endereço onde o app será publicado (usado nos e-mails de confirmação e de recuperação de senha).

O arquivo `supabase/schema.sql` é do formato antigo (tabela única) e não é mais necessário.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Verifica os tipos e gera a versão de produção em `dist/` |
| `npm test` | Roda os testes automáticos (cronograma, contas do AC21 e gravação no banco) |
| `npm run icones` | Gera de novo os ícones do PWA a partir de `public/assets/obrix-logo.jpg` |

## Publicação (GitHub Pages)

O fluxo `.github/workflows/deploy.yml` roda a cada push na `main`: confere os tipos, roda os testes, compila e publica.

1. Em **Settings → Pages**, escolha **GitHub Actions** como fonte.
2. Em **Settings → Secrets and variables → Actions**, crie os secrets `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. O site fica em `https://<usuario>.github.io/<nome-do-repositorio>/`. Use esse endereço como **Site URL** no Supabase.

## Estrutura

```
src/
  lib/          regras de negócio: ac21.ts (verbas), schedule.ts (cronograma), nuvem.ts (tabelas), dates.ts
  store/        estado global e sincronização com o Supabase
  components/   layout, login, modais, tela de erro
  pages/        telas do AC21 e, em pages/crono, as do cronograma
supabase/       SQL do banco
scripts/        gerador de ícones do PWA
```

## Observações

- **Links do PMO** (`#v=…`) carregam os dados dentro do endereço: quem tiver o link vê o cronograma, e ele não pode ser cancelado. Para restringir, envie o arquivo `.json`.
- **Sem internet**, as alterações ficam no aparelho e são enviadas quando a conexão volta. Ao reconectar, o app pergunta o que fazer se a nuvem tiver mudado.
- A pasta `server/` (API MySQL do template original) não é usada pelo Obrix.
