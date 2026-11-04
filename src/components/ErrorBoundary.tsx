// Red de seguridad: si una pantalla falla, se muestra un aviso tranquilo en lugar de una página en blanco.
// Los datos no se pierden (viven en el almacén local); se puede reintentar o volver al inicio.
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw, Home, RefreshCw } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Vignette } from './scenes'

const isChunkError = (e: Error) => /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError/i.test(e.message)

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error?: Error; showDetail: boolean }> {
  state: { error?: Error; showDetail: boolean } = { showDetail: false }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pantalla con error', error, info.componentStack)
    try {
      useStore.getState().syncLog('error', `Pantalla: ${error.message}`.slice(0, 200))
    } catch {
      /* sin almacén */
    }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: undefined, showDetail: false })
  }

  render() {
    const { error, showDetail } = this.state
    if (!error) return this.props.children
    const chunk = isChunkError(error)
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
        <Vignette kind="error" />
        <h2 className="heading mt-6 text-[1.7rem]">{chunk ? 'Hay una versión nueva' : 'Algo se atoró en esta pantalla'}</h2>
        <p className="mt-2 text-[15px] text-ink-soft">{chunk ? 'Se actualizó la app mientras la usabas. Recarga para seguir con la versión nueva.' : 'Tus datos están a salvo. Puedes intentar de nuevo o volver al inicio.'}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {chunk ? (
            <button onClick={() => location.reload()} className="pressable inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-medium text-on-primary">
              <RefreshCw size={17} strokeWidth={1.7} /> Recargar
            </button>
          ) : (
            <>
              <button onClick={() => this.setState({ error: undefined, showDetail: false })} className="pressable inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 font-medium text-on-primary">
                <RotateCcw size={17} strokeWidth={1.7} /> Intentar de nuevo
              </button>
              <button onClick={() => location.assign('/')} className="pressable inline-flex h-11 items-center gap-2 rounded-full px-5 font-medium text-ink ring-1 ring-line-strong ring-inset hover:bg-wash">
                <Home size={17} strokeWidth={1.7} /> Ir al inicio
              </button>
            </>
          )}
        </div>
        {!chunk && (
          <button onClick={() => this.setState({ showDetail: !showDetail })} className="mt-6 text-xs text-ink-3 underline underline-offset-2">
            {showDetail ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}
          </button>
        )}
        {showDetail && <pre className="mt-3 max-w-full overflow-auto rounded-[12px] bg-sunken p-3 text-left text-[11px] whitespace-pre-wrap text-detail">{error.message}</pre>}
      </div>
    )
  }
}
