-- Datos de PRUEBA para la nube local (npm run nube:ejemplo). Nunca se suben a Supabase.
-- Los nombres, capacidades y precios son de prueba: los reales los captura el rancho en la app.
insert into public.cabanas (slug, nombre, tipo, resumen, capacidad, recamaras, camas, banos, amenidades, precio_noche, precio_fin_semana, publicada, orden)
values
  ('cabana-de-prueba-a', 'Cabaña de prueba A', 'cabana', 'Cabaña de prueba para la nube local', 4, 2, '1 matrimonial y 2 individuales', 1, '{Wi-Fi,Estacionamiento,Asador}', 1000, 1200, true, 1),
  ('cabana-de-prueba-b', 'Cabaña de prueba B', 'cabana', 'Otra cabaña de prueba', 2, 1, '1 matrimonial', 1, '{Wi-Fi}', 800, 950, true, 2),
  ('casa-de-prueba', 'Casa de prueba', 'casa', 'Casa amueblada de prueba', 6, 3, '2 matrimoniales y 2 individuales', 2, '{Wi-Fi,Cocina,Estacionamiento}', 1800, 2100, true, 3),
  ('habitacion-de-prueba', 'Habitación de prueba', 'habitacion', 'Habitación de hotel de prueba', 2, 1, '1 king size', 1, '{Wi-Fi,Aire acondicionado}', 700, 850, true, 4)
on conflict (slug) do nothing;

update public.hospedaje_ajustes set
  reservas_web = true,
  anticipo_pct = coalesce(nullif(anticipo_pct, 0), 50),
  hora_llegada = coalesce(hora_llegada, '15:00'),
  hora_salida = coalesce(hora_salida, '12:00'),
  url_web = coalesce(url_web, 'http://localhost:4321'),
  correo_avisos = coalesce(correo_avisos, 'dueno@lajoya.local'),
  banco = coalesce(banco, 'Banco de prueba'),
  clabe = coalesce(clabe, '000000000000000000'),
  titular = coalesce(titular, 'Cuenta de prueba')
where id;
