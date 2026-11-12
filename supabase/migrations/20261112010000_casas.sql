-- Las 4 casas del lado oeste del jardín, como hospedajes propios (tipo «casa»), listas para la app y la web.
-- Quedan SIN publicar y con capacidad 1 provisional: el dueño pone el nombre, la capacidad y los precios en la app
-- y enciende «Publicada». Se puede correr varias veces: no duplica ni pisa lo que el dueño ya cambió.
insert into public.cabanas (slug, nombre, tipo, resumen, capacidad, publicada, orden, notas) values
  ('casa-1', 'Casa 1', 'casa', 'Del lado oeste del jardín', 1, false, 13, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('casa-2', 'Casa 2', 'casa', 'Del lado oeste del jardín', 1, false, 14, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('casa-3', 'Casa 3', 'casa', 'Del lado oeste del jardín', 1, false, 15, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('casa-4', 'Casa 4', 'casa', 'Del lado oeste del jardín', 1, false, 16, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.')
on conflict (slug) do nothing;
