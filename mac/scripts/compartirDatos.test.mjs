import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compartirDatos } from '../src/lib/compartirDatos.ts'

const datos = { hoy: '2026-11-14', ahora: '2026-11-14T12:00:00Z', desde: '2026-07-01', hasta: '2028-01-01', es_admin: true, ajustes: { reservas_web: true }, cabanas: [{ id: 'c1' }], reservaciones: Array.from({ length: 1000 }, (_, id) => ({ id: String(id), estado: 'confirmada', pagado: 0 })), temporadas: [], bloqueos: [], avisos_sin_enviar: 0 }
test('el sondeo con reloj nuevo conserva datos y las 1000 reservaciones sin cambios', () => {
  const respuesta = structuredClone(datos)
  respuesta.ahora = '2026-11-14T12:00:30Z'
  assert.equal(compartirDatos(datos, respuesta), datos)
})
test('un pago nuevo se publica conservando hospedajes y ajustes sin cambios', () => {
  const respuesta = structuredClone(datos)
  respuesta.reservaciones[500].pagado = 1200
  const resultado = compartirDatos(datos, respuesta)
  assert.notEqual(resultado, datos)
  assert.equal(resultado.cabanas, datos.cabanas)
  assert.equal(resultado.ajustes, datos.ajustes)
  assert.equal(resultado.reservaciones[500].pagado, 1200)
  assert.equal(datos.reservaciones[500].pagado, 0)
})
test('cambio de día e indicadores también actualizan la app', () => {
  for (const cambio of [{ hoy: '2026-11-15' }, { avisos_sin_enviar: 2 }, { bloqueos: [{ id: 'b1' }] }]) {
    assert.notEqual(compartirDatos(datos, { ...datos, ...cambio }), datos)
  }
  assert.equal(compartirDatos(null, datos), datos)
})
