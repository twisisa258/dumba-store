-- Dumba: variantes de produto (cor, tamanho, modelo, etc.)
create table if not exists product_variants (
  id              serial primary key,
  product_id      integer not null references products(id) on delete cascade,
  name_pt         text not null,
  name_en         text not null,
  color           text,
  stock           integer not null default 0 check (stock >= 0),
  image_url       text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique(product_id, name_pt)
);
create index if not exists idx_product_variants_product on product_variants(product_id, active, id);
alter table order_items add column if not exists variant_id integer references product_variants(id);
