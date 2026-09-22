-- Dumba: pagamentos ZumboPay, transações administrativas e notificações
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('mpesa','emola','visa_card'));

alter table orders add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending','processing','paid','failed','refunded','cancelled'));
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists stock_released_at timestamptz;

create table if not exists payment_transactions (
  id                  bigserial primary key,
  order_id            integer not null references orders(id) on delete cascade,
  provider            text not null default 'zumbopay',
  method              text not null check (method in ('mpesa','emola','visa_card')),
  amount_mzn          integer not null check (amount_mzn >= 0),
  currency            text not null default 'MZN',
  status              text not null default 'pending'
                      check (status in ('pending','processing','succeeded','failed','refunded','cancelled')),
  provider_reference  text,
  checkout_url        text,
  failure_code        text,
  failure_message     text,
  raw_response        jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz,
  unique(provider, provider_reference)
);

create index if not exists idx_payment_transactions_created on payment_transactions(created_at desc);
create index if not exists idx_payment_transactions_status on payment_transactions(status, created_at desc);
create index if not exists idx_payment_transactions_order on payment_transactions(order_id);

create table if not exists payment_webhook_events (
  id              bigserial primary key,
  provider        text not null default 'zumbopay',
  event_id        text,
  event_type      text not null,
  provider_ref    text,
  signature       text,
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  processing_error text,
  unique(provider, event_id)
);

create index if not exists idx_payment_webhook_ref on payment_webhook_events(provider_ref, received_at desc);

create table if not exists notifications (
  id              bigserial primary key,
  audience        text not null default 'admin' check (audience in ('admin','customer')),
  type            text not null,
  title           text not null,
  message         text not null,
  order_id        integer references orders(id) on delete cascade,
  transaction_id  bigint references payment_transactions(id) on delete cascade,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_notifications_admin on notifications(audience, read_at, created_at desc);
create index if not exists idx_notifications_order on notifications(order_id, created_at desc);

create or replace function set_payment_transaction_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_transaction_updated_at on payment_transactions;
create trigger trg_payment_transaction_updated_at
before update on payment_transactions
for each row execute function set_payment_transaction_updated_at();
