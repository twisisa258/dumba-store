-- Produtos de exemplo. Pode executar de novo sem duplicar (usa o slug).
insert into products (slug, category, name_pt, name_en, description_pt, description_en, price_mzn, stock, image_url) values
('smartwatch-preto','electronics','Smartwatch preto','Black smartwatch',
 'Relógio digital com ecrã LED e bracelete de silicone confortável.',
 'Digital LED watch with a comfortable silicone strap.', 650, 10, '/products/smartwatch-preto.jpg'),
('tenis-casual-masculino','shoes','Ténis casual masculino','Men''s casual sneakers',
 'Conforto para o dia a dia, com sola leve e boa aderência.',
 'Everyday comfort with a light sole and solid grip.', 2200, 8, '/products/tenis-casual-masculino.jpg'),
('auriculares-sem-fios','electronics','Auriculares sem fios','Wireless earbuds',
 'Bluetooth com estojo carregador e microfone para chamadas.',
 'Bluetooth earbuds with a charging case and call microphone.', 1200, 12, '/products/auriculares-sem-fios.jpg'),
('mochila-urbana','bags','Mochila urbana','Urban backpack',
 'Espaçosa, com bolsos organizadores. Ideal para trabalho e estudo.',
 'Roomy, with organizer pockets. Great for work and study.', 1400, 6, '/products/mochila-urbana.jpg'),
('samsung-galaxy-a04','electronics','Samsung Galaxy A04','Samsung Galaxy A04',
 'Smartphone com ecrã de 6,5 polegadas, câmara principal de 50 MP e bateria de 5.000 mAh. Escolha a cor nos detalhes.',
 '6.5-inch smartphone with a 50 MP main camera and 5,000 mAh battery. Choose the colour in details.', 8500, 12, '/products/samsung-galaxy-a04.jpg'),
('headphones-over-ear','electronics','Headphones sem fios','Wireless headphones',
 'Almofadas macias para horas de conforto, com ligação Bluetooth.',
 'Soft cushions for hours of comfort, with Bluetooth connection.', 2900, 5, '/products/headphones-over-ear.jpg'),
('bone-preto','accessories','Boné preto','Black cap',
 'Clássico, ajustável e combina com tudo.',
 'Classic, adjustable and goes with everything.', 350, 20, '/products/bone-preto.jpg')
on conflict (slug) do update set
  category = excluded.category, name_pt = excluded.name_pt, name_en = excluded.name_en,
  description_pt = excluded.description_pt, description_en = excluded.description_en,
  price_mzn = excluded.price_mzn, image_url = excluded.image_url;


-- Variantes de cor da oferta Dumba. A disponibilidade real de cores pode variar por mercado/fornecedor.
insert into product_variants (product_id, name_pt, name_en, color, stock, image_url)
select p.id, v.name_pt, v.name_en, v.color, v.stock, '/products/samsung-galaxy-a04.jpg'
from products p
cross join (values
  ('Vermelho','Red','vermelho',2),
  ('Azul','Blue','azul',2),
  ('Branco','White','branco',2),
  ('Laranja','Orange','laranja',2),
  ('Rosa','Pink','rosa',2),
  ('Preto','Black','preto',2)
) as v(name_pt,name_en,color,stock)
where p.slug = 'samsung-galaxy-a04'
on conflict (product_id, name_pt) do update set
  name_en = excluded.name_en, color = excluded.color, stock = excluded.stock, image_url = excluded.image_url;
