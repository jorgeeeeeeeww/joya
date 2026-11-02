// Borrar con "Deshacer": en lugar de preguntar "¿seguro?", se borra al instante y durante unos
// segundos aparece un aviso para recuperarlo. Más rápido y sin miedo a equivocarse.
import type { CollectionName, ID } from './types'
import { db } from './store'
import { toast } from '@/components/ui'

/** Elimina un registro y ofrece recuperarlo. `what` = "La reserva de Ana", "El proveedor Flores Lupita"… */
export function removeWithUndo(col: CollectionName, id: ID, what: string) {
  if (!db.get(col, id)) return
  db.remove(col, id)
  toast.undo(`${what} se eliminó`, () => {
    db.patch(col, id, { deleted: false } as never)
    toast.success('Recuperado', what)
  })
}

/**
 * Para cambios dentro de un registro (quitar un invitado de la lista, una partida de la cotización):
 * haz el cambio y pasa cómo revertirlo.
 */
export function withUndo(message: string, undo: () => void, body?: string) {
  toast.undo(message, undo, body)
}
