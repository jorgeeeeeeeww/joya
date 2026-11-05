// Función pública «reservar»: la web crea aquí la solicitud de reservación.
// Secretos: SB_SECRET_KEY (o la de servicio), TURNSTILE_SECRET (anti-robots de Cloudflare)
// y RESERVAS_ORIGENES (direcciones de la web separadas por coma, por ejemplo https://jardineslajoya.mx).
// En supabase/config.toml va sin verificación de JWT: es pública a propósito y se cuida con Turnstile
// y con el límite de solicitudes por dirección de internet que aplica la base.
import { manejarReserva } from './handler.ts'
import { secretKey } from '../_shared/admin.ts'

const origenes = (Deno.env.get('RESERVAS_ORIGENES') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

Deno.serve((req) =>
  manejarReserva(req, {
    url: Deno.env.get('SUPABASE_URL')!,
    llaveSecreta: secretKey(),
    turnstileSecreto: Deno.env.get('TURNSTILE_SECRET') || undefined,
    origenes,
  }),
)
