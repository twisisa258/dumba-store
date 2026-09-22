# Dumba · loja online

Loja em **React** (Vite) + API em **Node.js** (Express) + base de dados **PostgreSQL no Neon**.
Idiomas: **Português** e **Inglês**. Fonte: **Plus Jakarta Sans**.

```
dumba-store/
├── database/   schema.sql, seed.sql, 001_product_variants.sql
├── backend/    API (Express, pg, zod)
└── frontend/   site (React + Vite)
```

## O que já tem

- Página inicial com palavras-chave que rodam (Compre rápido, seguro, com M-Pesa…), faixa em movimento e etiquetas (M-Pesa, e-Mola, Pague na entrega).
- Loja com filtro por categoria, carrinho guardado no telemóvel e stock em tempo real.
- Tela de detalhes por produto com variantes obrigatórias (ex.: cor), seleção visual, quantidade e stock por variante.
- O pedido leva a variante escolhida até ao servidor; o backend valida e desconta o stock da variante e do produto.
- Formulários personalizados (finalizar compra, contacto, newsletter) com validação no site **e** no servidor, mensagens em PT/EN e telemóvel moçambicano (+258 8X…).
- Alertas personalizados: avisos (sucesso, erro, atenção, info) e caixa de confirmação própria.
- Pedidos gravados no Neon. O preço é sempre recalculado no servidor.
- Pagamento na entrega, M-Pesa e e-Mola (por agora manual: o cliente recebe o número e a referência do pedido).

## Publicar (tudo com planos gratuitos)

### 1. Base de dados (Neon)
1. Crie um projeto em neon.tech.
2. Numa base nova, execute `database/schema.sql` e depois `database/seed.sql`.
3. Se a base já existia antes das variantes, execute também `database/001_product_variants.sql` antes de atualizar o frontend/API.
4. Copie a **connection string** (Connect > Connection string).

### 2. API (Render)
1. New > **Web Service**, ligue o repositório e escolha **Root Directory = `backend`**.
2. Build command: `npm install` · Start command: `npm start`.
3. Variáveis de ambiente:
   - `DATABASE_URL` = a connection string do Neon
   - `CORS_ORIGINS` = o endereço do site na Vercel (ex.: `https://dumba.vercel.app`)
   - `MPESA_NUMBER` e `EMOLA_NUMBER` = números que recebem os pagamentos
4. Teste `https://SUA-API.onrender.com/health` e `/api/products`.

O plano gratuito do Render "adormece" sem visitas. O primeiro acesso pode demorar cerca de um minuto (o site avisa o cliente).

### 3. Site (Vercel)
1. New Project, ligue o repositório e escolha **Root Directory = `frontend`** (Framework: Vite).
2. Variáveis de ambiente:
   - `VITE_API_URL` = endereço da API no Render
   - `VITE_WHATSAPP` = número do WhatsApp da loja, só dígitos (ex.: `258841234567`)
3. Faça o deploy. Depois, se quiser, ligue o domínio em Settings > Domains.

## Desenvolvimento local
```
cd backend  && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
```

## Ver os pedidos
No Neon, SQL Editor:
```sql
select code, customer_name, phone, city, payment_method, total_mzn, status, created_at
from orders order by created_at desc;
```
Para mudar o estado: `update orders set status = 'confirmed' where code = 'DMB-XXXXXX';`

## Antes de vender a sério
- **Fotos e marcas:** as fotos em `frontend/public/products` são de exemplo. Troque por fotos reais do seu stock e, para cada variante, pode definir uma imagem própria em `product_variants.image_url`.
- **Preços e stock:** edite `database/seed.sql` (ou a tabela `products` no Neon).
- **M-Pesa automático:** ainda não está ligado à API da Vodacom. Precisa de contrato com a Vodacom ou de um agregador de pagamentos.
- **Segurança:** nunca publique o ficheiro `.env`. A API já tem limite de pedidos, validação e proteção de cabeçalhos.
- **Um painel de administração** (para gerir produtos e pedidos sem SQL) é o passo seguinte natural.


## Pagamentos ZumboPay

O checkout aceita exclusivamente **M-Pesa, e-Mola e Visa Card**. As chaves do gateway ficam apenas no backend.

Variáveis obrigatórias:
- `ZUMBOPAY_API_URL`
- `ZUMBOPAY_API_KEY`
- `ZUMBOPAY_MERCHANT_ID`
- `ZUMBOPAY_WEBHOOK_SECRET`
- `ZUMBOPAY_WALLET_MPESA`
- `ZUMBOPAY_WALLET_EMOLA`
- `ZUMBOPAY_WALLET_CARD`

As variáveis `ZUMBOPAY_RETURN_URL` e `ZUMBOPAY_CANCEL_URL` ainda **não são usadas** pelo código (ver CORRECOES.md).

Fluxo:
- M-Pesa/e-Mola: o backend cria um STK push em `POST /charges` e acompanha a confirmação por webhook.
- Visa Card: o backend cria um checkout hospedado em `POST /payments` e redireciona o cliente para `checkout_url`.
- O pedido só passa para pago depois da confirmação do gateway.
- Se uma cobrança falhar/cancelar/reembolsar, o stock reservado é devolvido uma única vez.
- O webhook `POST /api/webhooks/zumbopay` valida `x-zumbopay-signature` com HMAC-SHA256.

## Administração

Abra `/admin`. Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_SESSION_SECRET` no backend.

O painel inclui:
- visão geral de transações e receita confirmada;
- lista filtrável de transações;
- detalhe de cada operação e resposta do gateway;
- centro de notificações para novos pedidos e mudanças de pagamento;
- estado da integração ZumboPay e das três wallets.

A documentação atual da ZumboPay indica que a API deve ser chamada apenas pelo servidor, usa Bearer API key + `X-Merchant-Id`, exige `wallet_id` nas cobranças e disponibiliza webhooks assinados por HMAC-SHA256. [[documentação oficial]](https://zumbopay.com/documentacao)
