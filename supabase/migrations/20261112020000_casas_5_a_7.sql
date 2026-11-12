-- Las casas 5 a 7 del lado oeste del jardín (en total son 7), como hospedajes propios (tipo «casa»).
-- Igual que las primeras: SIN publicar y con capacidad 1 provisional; el dueño pone nombre, capacidad y precios en la app.
-- Se puede correr varias veces: no duplica ni pisa lo que el dueño ya cambió.
insert into public.cabanas (slug, nombre, tipo, resumen, capacidad, publicada, orden, notas) values
  ('casa-5', 'Casa 5', 'casa', 'Del lado oeste del jardín', 1, false, 17, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('casa-6', 'Casa 6', 'casa', 'Del lado oeste del jardín', 1, false, 18, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('casa-7', 'Casa 7', 'casa', 'Del lado oeste del jardín', 1, false, 19, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.')
on conflict (slug) do nothing;
