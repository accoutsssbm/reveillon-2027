# Réveillon em Família 2027

App da festa de Ano Novo, com duas telas:

- **Convidados** (abre primeiro, sem senha): ver a festa, confirmar presença (sozinho, com a família ou colando uma lista), escolher o que vai levar, cadastrar um prato com a receita em texto e ver a própria parte com o QR Code do Pix.
- **Organização** (botão “Organização”, com usuário e senha): tudo o que o convidado faz e mais preços, pagamentos, telefones, cobrança individual no WhatsApp, publicação no grupo e imagens para baixar.

O convidado não consegue alterar preços nem pagamentos nem ver telefones. Quem bloqueia isso é o banco de dados (regras RLS), não a tela.

## Arquivos

| Pasta / arquivo | Para quê |
|---|---|
| `index.html`, `css/`, `js/`, `icons/`, `assets/`, `manifest.webmanifest` | O site. Sobe tudo para o GitHub. |
| `js/config.js` | **Único arquivo que você edita:** URL e chave do Supabase. |
| `supabase/01_schema.sql` | Cria as tabelas, as regras de acesso e as funções do convidado. |
| `supabase/02_catalogo.sql` | Carrega os 35 pratos, 77 insumos, 19 itens de bebida/descartável/aluguel e 13 ideias de decoração. |

---

## 1. Supabase

1. Entre em supabase.com e crie um projeto (plano gratuito serve). Anote a senha do banco em lugar seguro.
2. Menu **SQL Editor** → **New query** → cole o conteúdo inteiro de `supabase/01_schema.sql` → **Run**. Tem que terminar com “Success”.
3. Nova query com `supabase/02_catalogo.sql` → **Run**.
4. **Bloquear cadastro aberto:** menu **Authentication** → **Sign In / Providers** (em versões antigas, **Providers** ou **Settings**) → desligue **Allow new users to sign up**. Assim só existe organizador que você criar.
5. **Criar os organizadores:** **Authentication** → **Users** → **Add user** → **Create new user**:
   - E-mail: o e-mail da pessoa (ou um usuário fictício, ver abaixo)
   - Senha: a que você vai passar para ela
   - Marque **Auto Confirm User**
   - Repita para cada organizador.
6. **Pegar a URL e a chave:** **Project Settings** → **API** (ou **Data API** e **API Keys**). Copie:
   - **Project URL** (ex.: `https://abcdefghijk.supabase.co`)
   - **anon public** key (a chave longa marcada como *anon* / *public*). **Não** use a `service_role`.

### Entrar só com o nome, sem e-mail (opcional)

Se preferir que a pessoa digite só `maria` em vez do e-mail:

- Crie o usuário no passo 5 como `maria@familia.festa` (pode ser outro final).
- Em `js/config.js`, coloque `DOMINIO_LOGIN: 'familia.festa'`.

Se o Supabase recusar esse e-mail fictício, use o e-mail real da pessoa e deixe `DOMINIO_LOGIN` vazio.

## 2. Configurar o site

Abra `js/config.js` e substitua:

```js
SUPABASE_URL: 'https://abcdefghijk.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOi...',
```

A chave *anon* pode ficar pública no GitHub: ela só permite o que as regras do banco deixam.

## 3. GitHub Pages

1. Crie um repositório (ex.: `reveillon-2027`) e suba **todo o conteúdo desta pasta** na raiz: `index.html` precisa ficar na raiz do repositório. A pasta `supabase/` pode subir junto, não atrapalha.
2. **Settings** → **Pages** → *Source*: **Deploy from a branch** → branch `main`, pasta `/ (root)` → **Save**.
3. Em 1 a 2 minutos o site fica em `https://SEU-USUARIO.github.io/reveillon-2027/`.
4. Opcional, para o “Esqueci a senha” e links do Supabase: **Authentication** → **URL Configuration** → coloque essa URL em **Site URL**.

## 4. Primeiro uso (organizadora)

1. Abra o site → **Organização** → entre.
2. **Painel → Dados da festa e regras:** local, chave Pix (tipo, chave, nome e cidade de quem recebe), WhatsApp da organização e as regras da criança.
3. **Comida → Compras e preços:** troque os preços marcados “est.” pelos reais. Ingredientes novos que os convidados cadastrarem aparecem no grupo **Sem preço**.
4. **Pessoas → Importar lista:** cole os nomes ou anexe um arquivo `.txt`, `.csv`, `.xlsx` ou contatos `.vcf`.
5. **Painel → Link para os convidados:** copie e mande no grupo.

## Como as contas funcionam

- **Comida:** cada receita tem “serve quantas pessoas”. O app multiplica pelo número de porções confirmadas (adulto = 1; criança = fração em “Criança come”). O café da manhã usa só quem marcou que vai dormir.
- **Lista de compras:** soma os ingredientes de cada responsável e arredonda para embalagem fechada (kg e L de 100 em 100 g/ml; o resto em unidades inteiras). É esse valor que entra no total.
- **Bebidas, descartáveis e aluguel:** “1 garrafa para cada 2 pessoas” → com 10 pessoas, 5 garrafas. Aqui criança conta como pessoa inteira. “Quantidade fixa” não muda.
- **Decoração:** custo fixo, soma dos materiais escolhidos.
- **Rateio:** total ÷ (adultos confirmados + crianças × “Criança paga”). Quem comprou ingredientes ou materiais tem o gasto descontado; se gastou mais do que a cota, aparece “a receber”.
- **Famílias:** cada pessoa pode estar na “Família de” alguém (o responsável). No cadastro do convidado, todos entram na família da primeira pessoa digitada.
  - **Cobrar junto:** uma cobrança só, no nome do responsável, somando as cotas, o que cada um gastou e o que cada um já pagou.
  - **Separado:** cada adulto recebe a própria cobrança. Criança continua sempre na conta do responsável.
  - Quem muda: a organização (Dinheiro ou Pessoas) ou o próprio responsável, na tela inicial do convidado.
  - Quem não tem WhatsApp cadastrado é cobrado pelo número do responsável da família.

## Onde fica salvo o quê

- Dados da festa: no Supabase, iguais para todos.
- O celular de quem confirmou guarda um código que deixa só aquele aparelho alterar a própria participação. Se a pessoa trocar de celular ou limpar o navegador, a organização altera por ela na tela Pessoas.
- Tema claro/escuro: no navegador de cada um.

## Atualizar para uma versão nova

Se você já tinha rodado o `01_schema.sql` antes, rode **o novo `01_schema.sql` de novo** no SQL Editor. Ele só acrescenta o que falta (colunas e funções novas) e não apaga pessoas, preços nem pagamentos. Depois suba os arquivos novos do site no GitHub por cima dos antigos.

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| “Falta configurar” | `js/config.js` ainda tem `COLE_AQUI`. |
| “Sem conexão com o servidor” | URL errada em `config.js` ou projeto Supabase pausado (projetos gratuitos pausam após 1 semana sem uso; reative no painel). |
| “E-mail ou senha incorretos” | Confira o usuário em Authentication → Users e se ele está confirmado. |
| QR Code do Pix não aparece | Preencha chave, nome **e** cidade no Painel. |
| Mudança de outra pessoa demora a aparecer | O app atualiza sozinho em até 1 minuto; puxar a página para baixo atualiza na hora. |
