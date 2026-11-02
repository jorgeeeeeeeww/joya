# Pasar el sistema a la red local (iMac en la oficina del rancho)

Hoy el sistema vive en la nube. Cuando la iMac esté en la oficina del rancho, se puede alojar ahí y funcionar por la red local, **sin reprogramar nada**: la app solo necesita otra dirección de Supabase.

## Por qué ya está listo

- La app guarda todo primero en cada dispositivo y luego sincroniza con *un* Supabase. No le importa si ese Supabase está en la nube o en la iMac.
- Supabase es de código abierto y se instala con Docker. La migración SQL y las funciones son las mismas.

## Requisitos

- La iMac siempre encendida en el rancho, sin reposo, con encendido automático después de apagones y conectada al router por cable.
- Un no-break (UPS) para la iMac y el router.
- Red Wi-Fi en malla que cubra salón, cabañas y casas, con una red **Staff** separada de la de huéspedes.

## Pasos

1. **Instalar Docker Desktop** en la iMac.
2. **Levantar Supabase:**
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase
   cd supabase/docker
   cp .env.example .env    # cambia TODAS las contraseñas y llaves de ejemplo
   docker compose up -d
   ```
3. **Cargar el esquema:** abre el Studio local (`http://localhost:8000`) → SQL Editor y ejecuta `supabase/migrations/20261101000000_la_joya.sql`.
4. **Mover los datos:**
   - Opción A: en un dispositivo conectado a la nube, ve a *Ajustes → Respaldos → Descargar respaldo*. Luego conéctalo a la iMac y usa *Restaurar* y después *Subir todo*.
   - Opción B: `pg_dump` desde la nube y `pg_restore` en la iMac.
5. **HTTPS en la red local.** Es necesario para instalar la app y usar la cámara.
   - Recomendado: un dominio propio (por ejemplo `rancho.lajoya.mx`) con certificado de Let's Encrypt por DNS (Caddy lo hace automáticamente), y que el router resuelva ese nombre a la IP fija de la iMac.
   - Alternativa: certificado propio con `mkcert`, instalado una vez en cada celular.
6. **Publicar la app en la iMac:** copia la carpeta `dist/` y sírvela con Caddy junto a Supabase.
7. En cada dispositivo, ve a *Ajustes → Nube*, cambia la URL por la de la iMac y conecta.

## Acceso desde fuera del rancho

Instala **Tailscale** en la iMac y en el celular del dueño. Es gratis para uso personal, el túnel va cifrado y no hay que abrir puertos en el router.

## Respaldo en red local

- Programa `pg_dump` diario en la iMac con `launchd` hacia un disco externo, y también Time Machine.
- Sube una copia cifrada semanal a la nube (iCloud Drive o Google Drive) para cumplir la regla 3-2-1.
