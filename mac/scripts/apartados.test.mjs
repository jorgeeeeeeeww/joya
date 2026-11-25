// Fechas que aparta el dueño: se guardan como cierre con motivo «Apartado» o «Apartado: nota».
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apartadosVigentes, esApartado, etiquetaApartado, MAX_NOTA, motivoApartado, notaDe } from '../src/lib/apartados.ts'
import { delAl } from '../src/lib/fechas.ts'

test('el motivo guarda la nota y se reconoce como apartado', () => {
  assert.equal(motivoApartado('  Familia   Ramírez '), 'Apartado: Familia Ramírez')
  assert.equal(motivoApartado(''), 'Apartado')
  assert.ok(esApartado({ motivo: 'Apartado' }))
  assert.ok(esApartado({ motivo: 'Apartado: Familia Ramírez' }))
  assert.equal(notaDe({ motivo: 'Apartado: Familia Ramírez' }), 'Familia Ramírez')
  assert.equal(notaDe({ motivo: 'Apartado' }), null)
  assert.equal(etiquetaApartado({ motivo: 'Apartado: Juan' }), 'Apartado · Juan')
  assert.equal(etiquetaApartado({ motivo: 'Apartado' }), 'Apartado')
})

test('los cierres de siempre no son apartados', () => {
  for (const motivo of ['Mantenimiento', 'Uso propio', 'Evento en el salón', 'Apartado para la boda', null]) {
    assert.equal(esApartado({ motivo }), false, String(motivo))
    assert.equal(notaDe({ motivo }), null)
  }
})

test('la nota cabe en el motivo de la nube (120 letras)', () => {
  const m = motivoApartado('x'.repeat(500))
  assert.equal(m.length, 'Apartado: '.length + MAX_NOTA)
  assert.ok(m.length <= 120)
})

test('la lista muestra solo los apartados que no han terminado, del más cercano al más lejano', () => {
  const d = {
    hoy: '2026-11-25',
    bloqueos: [
      { id: 'a', cabana_id: 'c1', inicio: '2026-12-11', fin: '2026-12-13', motivo: 'Apartado: Familia Ramírez' },
      { id: 'b', cabana_id: 'c2', inicio: '2026-11-24', fin: '2026-11-26', motivo: 'Apartado' },
      { id: 'c', cabana_id: 'c1', inicio: '2026-11-20', fin: '2026-11-25', motivo: 'Apartado' },
      { id: 'd', cabana_id: 'c1', inicio: '2026-11-27', fin: '2026-11-28', motivo: 'Mantenimiento' },
    ],
  }
  assert.deepEqual(apartadosVigentes(d).map((b) => b.id), ['b', 'a'])
})

test('las fechas se dicen completas, en palabras', () => {
  assert.equal(delAl('2026-12-11', '2026-12-13'), 'Del viernes 11 al domingo 13 de diciembre')
  assert.equal(delAl('2026-12-30', '2027-01-02'), 'Del miércoles 30 de diciembre al sábado 2 de enero')
})
