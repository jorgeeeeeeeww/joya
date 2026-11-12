// Si una pantalla falla, se ve un aviso con «Volver a intentar» en lugar de una ventana vacía.
import { Component, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from './ui'
import { Loto } from './Loto'

export class Tropiezo extends Component<{ children: ReactNode; llave?: string }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidUpdate(prev: { llave?: string }) {
    if (prev.llave !== this.props.llave && this.state.error) this.setState({ error: null })
  }
  componentDidCatch(error: Error) {
    console.error('La Joya:', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center p-10 text-center">
        <Loto size={48} hueco="var(--paper)" />
        <p className="mt-5 text-[17px] font-medium">Algo falló en esta pantalla</p>
        <p className="mt-1 max-w-md text-[13px] text-ink-soft">{this.state.error.message}</p>
        <Button className="mt-5" variant="outline" icon={<RotateCcw size={15} />} onClick={() => this.setState({ error: null })}>
          Volver a intentar
        </Button>
      </div>
    )
  }
}
