-- Los 16 hospedajes reales del rancho (3 cabañas, 4 casitas y 9 habitaciones), con los mismos nombres que usa la web (web/src/data/lugares.ts),
-- para que la web y la app de la Mac hablen de lo mismo. Se puede correr varias veces: no duplica ni pisa
-- lo que el dueño ya cambió en la app.
-- Capacidades: las que dio Jorge el 10 nov 2026. Precios: vacíos, los captura el rancho en la app.
-- Habitaciones 11 a 16: sin capacidad real todavía; quedan con 1 provisional y SIN publicar hasta que el
-- dueño ponga la suya (la base exige un número).
insert into public.cabanas (slug, nombre, tipo, resumen, capacidad, publicada, orden, notas) values
  ('sabas', 'Sabas', 'cabana', 'Dos pisos de ladrillo con balcón y techos de bóveda.', 6, true, 1, 'Al fondo del jardín, entre pinos. Falta capturar precios.'),
  ('cabana-san-miguel', 'Cabaña San Miguel', 'cabana', 'Dos pisos de piedra, con balcón y puerta de arco.', 10, true, 2, 'Junto al andador. Falta capturar precios.'),
  ('cabana-elena', 'Cabaña Elena', 'cabana', 'Ladrillo bajo la enredadera, con sala y techo de madera.', 4, true, 3, 'Junto al andador. Falta capturar precios.'),
  ('habitacion-11', 'Habitación 11', 'habitacion', 'Frente al andador', 1, false, 4, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('habitacion-12', 'Habitación 12', 'habitacion', 'Frente al andador', 1, false, 5, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('habitacion-13', 'Habitación 13', 'habitacion', 'Frente al andador', 1, false, 6, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('habitacion-14', 'Habitación 14', 'habitacion', 'Frente al andador', 1, false, 7, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('habitacion-15', 'Habitación 15', 'habitacion', 'Frente al andador', 1, false, 8, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('habitacion-16', 'Habitación 16', 'habitacion', 'Frente al andador', 1, false, 9, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('habitacion-1', 'Habitación 1', 'habitacion', 'Junto al estacionamiento', 2, true, 10, 'Falta capturar precios.'),
  ('habitacion-2', 'Habitación 2', 'habitacion', 'Junto al estacionamiento', 2, true, 11, 'Falta capturar precios.'),
  ('habitacion-3', 'Habitación 3', 'habitacion', 'Junto al estacionamiento', 2, true, 12, 'Falta capturar precios.'),
  ('casita-1', 'Casita 1', 'casa', 'Del lado oeste del jardín', 1, false, 13, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('casita-2', 'Casita 2', 'casa', 'Del lado oeste del jardín', 1, false, 14, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('casita-3', 'Casita 3', 'casa', 'Del lado oeste del jardín', 1, false, 15, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.'),
  ('casita-4', 'Casita 4', 'casa', 'Del lado oeste del jardín', 1, false, 16, 'FALTA la capacidad real (quedó 1 provisional) y los precios. Cámbiala y enciende Publicada.')
on conflict (slug) do nothing
returning nombre;
