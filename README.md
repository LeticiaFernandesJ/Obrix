# Obrix - Gestão inteligente de obras

Sistema web (PWA) que reúne, em um só lugar:

- **Controle de verbas AC21**: obras, itens orçados e não orçados, compras, histórico de alterações, relatórios e exportação para Excel.
- **Cronograma de obra**: um por obra, com Gantt, dependências, caminho crítico, linha de base, curva S, painel para o PMO e envio por link ou arquivo.

- **Financeiro**: contas a pagar com vencimento, fluxo de caixa dos próximos meses e botão "Pago". As compras ganharam o campo **Vencimento**.
- **Importar NF-e (XML)**: em Compras, leia uma ou mais notas fiscais eletrônicas; cada parcela da nota vira uma conta com o seu vencimento (ou cada item vira uma compra). Notas já lançadas são sinalizadas.
- **Desempenho (valor agregado)**: aba na obra com IDP, IDC, custo previsto no término (EAC) e curva planejado x agregado x custo real, cruzando o cronograma com o que foi pago.
- **Alertas**: o sino na barra superior junta verba no limite, contas vencidas ou a vencer, tarefas atrasadas e índices abaixo do esperado. Alertas por e-mail ou push precisam de um servidor e ainda não existem.
- **MS Project**: importe e exporte o cronograma em XML (Arquivo > Salvar como > XML no Project). Arquivos `.mpp` e do Primavera não são lidos.

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
2. Cole o conteúdo de [`supabase/schema-equipes.sql`](supabase/schema-equipes.sql) e clique em **Run**.
   - **Instalação nova:** cria tudo do zero.
   - **Quem já usava o formato anterior** (`schema-completo.sql`): o script copia os dados de cada conta para uma organização ("Minha empresa") e guarda as tabelas antigas com o sufixo `_v2`, sem acesso pela API. Depois de conferir que está tudo certo, você pode apagá-las.
   - Pode ser executado mais de uma vez.
3. Em **Authentication → Providers → Email**, escolha se exige confirmação de e-mail (**Confirm email**).
4. Em **Authentication → URL Configuration**, defina o **Site URL** com o endereço onde o app será publicado (usado nos e-mails de confirmação e de recuperação de senha).

Os arquivos em `supabase/legado/` são formatos antigos. O `schema-completo-v2.sql` só é usado pelo teste da migração.

> **Atualizando uma instalação antiga:** rode de novo o `supabase/schema-equipes.sql` no SQL Editor. Ele é seguro para repetir e acrescenta a coluna de vencimento das compras.

## Equipes e permissões

Os dados pertencem a uma **organização** (sua empresa ou equipe), não a uma pessoa. Quem cria a conta cria a primeira organização e vira administrador.

| Papel | Pode |
|---|---|
| **Administrador** | Tudo, mais convidar pessoas, mudar papéis, remover membros e renomear a organização |
| **Editor** | Cadastrar e alterar obras, itens, compras e cronogramas |
| **Leitor** | Só consultar e exportar |

- **Convidar:** em **Equipe → Convidar pessoas**, escolha o papel e gere o link. Envie por WhatsApp ou e-mail. Quem abrir o link entra na equipe depois de criar a conta ou entrar. Cada link vale para uma pessoa e expira em 7 dias; o administrador pode cancelá-lo antes.
- **Segurança:** as regras ficam no banco (RLS), então valem mesmo fora do app. A organização nunca fica sem administrador.
- **Vários usuários ao mesmo tempo:** cada alteração grava só as linhas que mudaram, e o app recebe avisos em tempo real quando outra pessoa altera algo. Se duas pessoas mudarem a mesma linha ao mesmo tempo, vale a última gravação.
- **Histórico:** cada registro mostra o e-mail de quem fez a alteração.
- **Participar de mais de uma organização:** o app mostra o seletor na tela Equipe.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Verifica os tipos e gera a versão de produção em `dist/` |
| `npm test` | Roda os testes automáticos (cronograma, contas do AC21, gravação no banco e regras de acesso das equipes) |
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
supabase/       SQL do banco (schema-equipes.sql) e teste das regras de acesso
scripts/        gerador de ícones do PWA
```

## Observações

- **Links do PMO** (`#v=…`) carregam os dados dentro do endereço: quem tiver o link vê o cronograma, e ele não pode ser cancelado. Para restringir, envie o arquivo `.json`.
- **Sem internet**, as alterações ficam no aparelho e são enviadas quando a conexão volta. Ao reconectar, o app pergunta o que fazer se a nuvem tiver mudado.
