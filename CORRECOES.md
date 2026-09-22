# Correcções — Dumba (21/09/2026)

Estado honesto: corrigi as causas que consegui **confirmar no código**. Não consegui executar o projecto
(sem rede para `npm install`), por isso só verifiquei a sintaxe. **Nada foi testado** contra Render, Vercel, Neon ou ZumboPay.

## 1. Não entra na página /admin
Duas causas confirmadas:
- **Sem `vercel.json`**: abrir `/admin` directamente na Vercel dava 404 (o site é uma SPA). → criado `frontend/vercel.json`.
- **Cookie bloqueado**: o site (Vercel) e a API (Render) são domínios diferentes; o cookie `SameSite=Lax` da sessão não é guardado/enviado entre eles. O login respondia OK e o painel voltava logo ao ecrã de login, sem erro. → a sessão passa a viajar em `Authorization: Bearer` (guardada em `sessionStorage`). Se a sessão expirar, volta ao login.
- O ecrã de login mostrava a palavra crua `network` quando a API não respondia. Agora diz o endereço da API que está a usar e o que verificar.

## 2. "API errada" / erro a toda a hora
Causas prováveis (dependem das variáveis que tem publicadas):
- `VITE_API_URL` em falta na Vercel → o site chamava `localhost:3000` (no telemóvel do cliente, isso é o próprio telemóvel). Agora, em produção não há fallback para localhost, o endereço sem `https://` é corrigido, e uma resposta que não seja JSON é tratada como erro de configuração (com aviso na consola do navegador).
- `CORS_ORIGINS` no Render diferente do endereço exacto do site → o navegador bloqueia tudo. A API agora regista `[cors] origem bloqueada: ...` nos logs.
- A API agora avisa nos logs, ao arrancar, que variáveis faltam (`[config] ...`, só nomes, nunca valores).
- Erros de pagamento: o motivo real ia directo para o cliente e **não ficava em log nenhum**. Agora o cliente vê uma mensagem amigável; o motivo real fica no log do Render (`[pagamento] falha ao iniciar`) e na notificação do admin.
- Criados os `.env.example` (backend e frontend) que o README menciona mas não existiam.

## 3. Nada a pedir para verificar o telemóvel / sem redirecionamento
- M-Pesa e e-Mola **nunca redirecionam**: por desenho da integração, o gateway envia um pedido ao telemóvel. O que faltava era dizê-lo. O ecrã pós-pedido agora diz "Verifique o seu telemóvel", com método, valor e número, e o aviso rápido também.
- Visa Card redireciona para `checkout_url`. Se o gateway não devolver esse link, antes ficava eternamente "a aguardar". Agora falha logo, cancela o pedido, devolve o stock e regista a resposta do gateway nos logs. O ecrã também ganhou o botão "Abrir página de pagamento" caso o redirecionamento automático seja bloqueado.

## Ficheiros alterados
Backend: `src/routes.js`, `src/server.js`, `src/messages.js`, `.env.example` (novo).
Frontend: `src/api.js`, `src/config.js`, `src/admin.jsx`, `src/App.jsx` (hooks estavam depois de um `return` condicional), `src/components/CheckoutModal.jsx`, `src/locales/pt.js`, `src/locales/en.js`, `vercel.json` (novo), `.env.example` (novo).
`README.md`: só a nota sobre RETURN_URL/CANCEL_URL.

## O que tem de fazer (nada disto se resolve só com código)
1. **Vercel**: `VITE_API_URL=https://SUA-API.onrender.com` (sem `/` no fim). Estas variáveis só entram no build: faça **novo deploy**.
2. **Render**: `CORS_ORIGINS=https://SEU-SITE.vercel.app` (exacto, sem `/`; cada domínio de preview conta como outro), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `DATABASE_URL` e as `ZUMBOPAY_*`.
3. **Neon**: confirme que existem as tabelas `product_variants`, `payment_transactions` e `notifications` (migrações 001 e 002). Sem elas `/api/products` ou `/api/orders` dão erro 500.
4. Teste por ordem: `https://SUA-API.onrender.com/health` → `{"ok":true}`; depois `/api/products`; depois `/admin`. Olhe para os logs do Render se falhar.

## NÃO feito / NÃO verificado
- **Campos da ZumboPay não confirmados**: `wallet_id`, `msisdn`, `source_id`, `checkout_url` e o corpo de `/payments` já estavam no código; não consegui abrir a documentação oficial para os confirmar. Se um pagamento falhar, a resposta real do gateway estará no log `[pagamento]`.
- **Confirmação só por webhook**: o pedido só passa a "pago" quando a ZumboPay chama `POST /api/webhooks/zumbopay`. Tem de registar esse URL no painel deles. Sem isso, o ecrã fica em "a verificar" para sempre (não há limite de tempo nem consulta directa ao gateway).
- **Regresso do cartão ao site**: `ZUMBOPAY_RETURN_URL`/`CANCEL_URL` estão no README mas o código nunca as envia (não sei o nome do campo na API). Depois de pagar, o cliente fica na página do gateway.
- **Limite de pedidos**: 10 POST/min por IP. Vários clientes na mesma rede móvel podem apanhar "Muitos pedidos". Não alterei.
- **Logout do admin** só apaga o token no navegador (token sem revogação no servidor; expira em 8 h).
- Sessões de admin antigas (por cookie) deixam de valer: é preciso voltar a entrar.

---

# Sessão seguinte (22/09/2026) — pagamento por etapas, faturas e SEO

Ao contrário da sessão anterior, desta vez consegui montar um ambiente de teste (Node + Chromium
sem rede) e correr o projeto de verdade: 19 testes automáticos no backend (`cd backend && npm test`)
e um checkout completo testado num Chromium com a API simulada (34 cenários, incluindo aceite,
recusado, expirado, cancelado e cartão). Isto não substitui testar contra o Render/Neon/ZumboPay
reais, que continuo sem conseguir alcançar daqui.

## 1. Pagamento agora por páginas, com número separado do contacto
- Checkout em 3 passos: **Entrega → Pagamento → Confirmar**.
- Na etapa de pagamento pede-se o **número que vai pagar** (pode ser diferente do contacto),
  validado por operadora (M-Pesa = Vodacom 84/85, e-Mola = Movitel 86/87) no frontend e no backend
  (`backend/src/payment-rules.js`, `validators.js`).
- Nova página "Verifique o seu telemóvel": contagem decrescente de **2 minutos** (o prazo real é
  decidido pelo servidor, `MOBILE_TIMEOUT_SECONDS` em `payment-rules.js`; o ecrã só mostra o que o
  servidor confirma), com os passos a seguir e um botão "Cancelar pagamento".
- **Pop-ups de resultado** (`components/PaymentResult.jsx`): aceite, recusado, tempo esgotado,
  cancelado ou erro ao iniciar. Os que não são sucesso oferecem "Tentar novamente" sem perder os
  dados nem o carrinho.
- Backend: `sweepExpiredPayments()` corre a cada 30 s e expira pagamentos parados a tempo, devolve o
  stock, e reserva-o outra vez se o cliente aprovar tarde e ainda houver stock (com aviso ao admin).
  Transições de estado impedem que um evento atrasado desfaça um estado já final
  (`canTransition` em `payment-rules.js`).

## 2. Login do admin ("credenciais inválidas")
Não pude confirmar a causa exata sem ver as variáveis reais do Render, mas o login agora tolera as
causas mais prováveis: espaços/quebras de linha/aspas coladas nas variáveis `ADMIN_*`, maiúscula
automática e espaço final que o teclado do telemóvel costuma inserir (`backend/src/admin-auth.js`).
O log do Render passa a dizer se falhou o utilizador ou a palavra-passe (nunca os valores). Ecrã de
login sem capitalização automática e com botão "Ver" na palavra-passe.

## 3. Faturas em PDF
`GET /api/orders/:code/invoice` (só depois de pago) gera um PDF com `pdf-lib`
(`backend/src/invoice.js`): cabeçalho com o logo, dados da loja (`SHOP_*` no `.env`), cliente,
entrega, artigos, total e, se `INVOICE_VAT_RATE` estiver definido, o IVA incluído em separado.
Passa para segunda página sozinho com muitos artigos. Botão "Descarregar fatura" no pop-up de
pagamento aceite e em cada transação paga no admin.

## 4. SEO forte
- Cada produto passa a ter **URL própria** (`/produto/:slug`), partilhável e com botão "Voltar" a
  funcionar (`history.pushState`/`popstate` em `App.jsx`).
- `frontend/src/seo.js`: título, meta description, canonical, Open Graph/Twitter e um JSON-LD
  `Product` (preço, disponibilidade) atualizados por página — ajuda motores de busca que executam
  JavaScript (o Google faz isso).
- `index.html` reforçado com Open Graph/Twitter/JSON-LD `OnlineStore` **estáticos**, porque a
  pré-visualização de links no WhatsApp/Facebook **não executa JavaScript** — só vê o que está
  escrito ali. Criei `public/og-cover.png` e `og-cover-en.png` (1200×630) a partir do logo e do
  hero já existentes.
- Backend: `GET /sitemap.xml` (um endereço por produto ativo) e `GET /robots.txt`
  (`backend/src/seo.js` + `seo-utils.js`, com 4 testes). Precisam de `SITE_URL` no `.env` do Render.
- **`frontend/vercel.json` tem um endereço por preencher**: troque
  `SUBSTITUA-PELO-SEU-BACKEND.onrender.com` pelo domínio real do backend nas duas linhas do topo,
  para o `/sitemap.xml` e o `/robots.txt` responderem no domínio da loja (é isso que o Google usa).

## O que NÃO ficou feito nesta sessão
- **Pedi para adicionar um sistema de notificações e ainda não o fiz.** O centro de notificações do
  admin (painel "Notificações", já existente) continua só a funcionar dentro da aba aberta, por
  sondagem a cada 8 s. Ainda falta: pedir permissão do navegador e mostrar notificações do sistema
  operativo para pedidos/pagamentos novos, um som curto, e um contador no título/ícone da aba.
- Não testei o build de produção do Vite (`npm run build`) neste ambiente — só um build equivalente
  com esbuild, para verificar que o código compila. Antes de publicar, corra `npm run build` você
  mesmo.
- Continuo sem conseguir confirmar os campos exatos da API da ZumboPay (sem acesso à documentação
  oficial a partir daqui) nem testar contra o Render/Neon reais.
