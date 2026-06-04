
# Plano Revendedor + Integração InfinitePay

## 1. Landing page (`src/routes/index.tsx`)

Nova seção **"Plano Revenda — Renda Extra"** logo abaixo dos planos atuais (ou substituindo a seção de planos se você preferir só um bloco extra — vou colocar como bloco adicional).

Conteúdo:
- Título: **"Revenda Sites e Fature mais de R$ 3.000/mês"**
- Comparativo destacado com o mercado:
  - Hospedagem tradicional: R$ 40/mês
  - Domínio próprio: R$ 40/ano
  - Designer/gestor para site pronto: R$ 700+
  - Mensalidade recorrente: R$ 40/mês
  - **Nossa solução:** pagamento único anual, hospedagem + domínio inclusos
- Caixa de lucro:
  - Você paga **R$ 36 por site**
  - Vende a empresa por **R$ 297/ano**
  - **Lucro líquido R$ 261 por site**
  - **10 sites = R$ 2.610 líquidos**
- Preço destacado: **R$ 297** ou **12x de R$ 30**
- Inclui: 10 contas de cliente, hospedagem, domínio `slug.mro.bio`, suporte
- Formulário inline: **Nome, Email, WhatsApp** → botão "Pagar e começar agora"

## 2. Fluxo de checkout InfinitePay

Endpoint atual: `POST https://api.checkout.infinitepay.io/links` (URL nova).
Handle: `paguemro`.

Fluxo:
1. Usuário preenche nome/email/whatsapp e clica em pagar.
2. Server fn `createResellerCheckout({ name, email, whatsapp })`:
   - Valida com Zod.
   - Cria registro em nova tabela `reseller_orders` com status `pending`, gera `order_nsu` único (uuid).
   - Chama InfinitePay com:
     - `handle: "paguemro"`
     - `items: [{ quantity: 1, price: 29700, description: "Plano Revenda Anual — 10 sites mro.bio" }]`
     - `order_nsu`
     - `customer: { name, email, phone_number: whatsapp }`
     - `redirect_url: https://mro.bio/ob/obrigado?order={order_nsu}`
     - `webhook_url: https://mro.bio/api/public/webhooks/infinitepay`
   - Retorna a URL do checkout retornada pela InfinitePay.
3. Frontend faz `window.location.href = url`.

## 3. Webhook + Polling

**Webhook** `src/routes/api/public/webhooks/infinitepay.ts`:
- Recebe POST, valida payload, busca `reseller_orders` por `order_nsu`.
- Se aprovado e ainda `pending`: marca `paid`, dispara provisionamento.

**Polling de segurança (8s)** — como você pediu:
- Componente na página `/ob/obrigado` chama `checkResellerOrder({ order_nsu })` a cada 8s.
- Server fn faz `POST https://api.checkout.infinitepay.io/payment_check` e, se pago, faz o mesmo provisionamento (idempotente via status).

**Provisionamento automático:**
- Cria user no Supabase Auth via `supabaseAdmin.auth.admin.createUser` com email confirmado e senha aleatória.
- Atualiza `profiles`: `max_sites=10`, `is_reseller=true`, `created_by_admin=true`, assinatura ativa por 365 dias.
- Gera token em `activation_tokens` (purpose=`password_reset`) e enfileira email com link `/redefinir-senha/{token}` (template já existe: `password_reset`).
- Marca `reseller_orders.status='provisioned'`, salva `user_id`.

## 4. Banco de dados

Nova tabela `reseller_orders`:
- `order_nsu` (text, unique)
- `name`, `email`, `whatsapp`
- `amount_cents` (default 29700)
- `status` (`pending` | `paid` | `provisioned` | `failed`)
- `checkout_url`, `transaction_nsu`, `invoice_slug`, `receipt_url`
- `user_id` (uuid nullable)
- `paid_at`, `provisioned_at`, `last_check_at`
- `raw_webhook` (jsonb), `last_error` (text)

GRANTs apenas para `service_role`; RLS bloqueando acesso direto (acesso via server fn admin).

## 5. Aba "Pagamentos/Usuários" no `/administracao`

Nova aba ao lado das existentes:
- **Tentativas (pending/failed):** quem preencheu mas não pagou.
- **Pagos (paid):** pagaram mas ainda não foram provisionados (raro, transitório).
- **Provisionados:** lista com email enviado, link de acesso, data, valor.
- Filtros simples + busca por email.
- Ações: reenviar email de acesso (re-enfileira `password_reset`), marcar como pago manualmente, ver payload bruto do webhook.

Server fns no `admin.functions.ts`:
- `adminListResellerOrders({ token, status? })`
- `adminResendResellerAccess({ token, orderId })`
- `adminMarkResellerPaid({ token, orderId })`

## 6. Template de email

Adicionar template `reseller_welcome` em `email-templates.server.ts`:
- Assunto: "Seu acesso ao MRO.BIO — Plano Revenda"
- Conteúdo: parabéns, 10 sites disponíveis, link para criar senha (`/redefinir-senha/{token}`), dicas de uso.

## 7. Secrets necessários

Nenhum novo segredo obrigatório — InfinitePay Checkout Integrado é público com `handle`. Caso depois você queira assinar webhook, adicionamos `INFINITEPAY_WEBHOOK_SECRET`.

## Detalhes técnicos

- Server fns em `src/lib/reseller.functions.ts` (público, sem `requireSupabaseAuth`).
- Server fn de provisionamento dentro do handler para garantir idempotência por `order_nsu`.
- Página `/ob/obrigado` mostra estado: "Aguardando confirmação", "Pago! Enviando seu acesso…", "Pronto! Enviamos o link para {email}".
- Tudo em pt-BR, mantendo o design system existente.

Posso seguir com a implementação?
