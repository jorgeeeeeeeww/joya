// Mensajes de WhatsApp ya escritos para el huésped, según cómo va su reservación.
// Se abren en WhatsApp con un clic: el dueño los revisa y los manda él.
import type { Ajustes, Detalle } from './tipos'
import { mxn } from './dinero'
import { noches, plural, rango } from './fechas'
import { saldo } from './estados'

export function numeroWhatsApp(tel: string | null) {
  const d = (tel ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length === 10) return '52' + d
  return d
}

export function mensajePara(r: Detalle, a: Ajustes) {
  const nombre = r.nombre.split(' ')[0]
  const estancia = `${r.cabana}, ${rango(r.llegada, r.salida)} (${plural(noches(r.llegada, r.salida), 'noche', 'noches')})`
  const liga = r.liga ? `\n\nAquí puedes ver tu reservación: ${r.liga}` : ''
  const llegada = a.hora_llegada ? ` La llegada es a partir de las ${a.hora_llegada}${a.hora_salida ? ` y la salida a las ${a.hora_salida}` : ''}.` : ''
  const falta = Math.max(0, r.anticipo - r.pagado)
  switch (r.estado) {
    case 'solicitud': {
      const pago =
        falta > 0 && a.clabe
          ? `\n\nPara apartar tus fechas, transfiere el anticipo de ${mxn(falta)}:\nBanco: ${a.banco ?? ''}\nCLABE: ${a.clabe}\nA nombre de: ${a.titular ?? ''}\nReferencia: ${r.codigo}\n\nCuando la hagas, mándanos tu comprobante por aquí.`
          : ''
      return `Hola ${nombre}, recibimos tu solicitud ${r.codigo} para ${estancia}. ¡Con gusto te esperamos!${pago}${liga}`
    }
    case 'confirmada': {
      const pendiente = saldo(r)
      return `Hola ${nombre}, tu reservación ${r.codigo} en ${estancia} está confirmada.${llegada}${pendiente > 0 ? ` Saldo pendiente: ${mxn(pendiente)}.` : ''}${liga}`
    }
    case 'pagada':
      return `Hola ${nombre}, todo listo para tu estancia en ${estancia}.${llegada} ¡Te esperamos!${liga}`
    case 'cancelada':
      return `Hola ${nombre}, tu reservación ${r.codigo} (${estancia}) quedó cancelada. Si quieres buscar otras fechas, aquí estamos.`
  }
}

export function ligaWhatsApp(r: Detalle, a: Ajustes) {
  const n = numeroWhatsApp(r.telefono)
  if (!n) return null
  return `https://wa.me/${n}?text=${encodeURIComponent(mensajePara(r, a))}`
}
