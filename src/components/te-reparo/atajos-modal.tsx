'use client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from './kbd'
import {
  ATAJOS_FORMULARIOS,
  ATAJOS_GLOBAL,
  ATAJOS_POS,
  ATAJOS_TABLAS,
  NOTA_CTRL_C,
  NOTA_CTRL_N,
  NOTA_CTRL_TAB,
  TITULO_AMBITO,
  type DefAtajo,
} from '@/lib/atajos'

function Grupo({ titulo, atajos }: { titulo: string; atajos: DefAtajo[] }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-brand-red mb-2">{titulo}</h3>
      <ul className="space-y-1.5">
        {atajos.map((a) => (
          <li key={a.teclas + a.descripcion} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-foreground/90">{a.descripcion}</span>
            <Kbd className="shrink-0">{a.teclas}</Kbd>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Modal con la lista completa de atajos (se abre con Shift + ?). */
export function AtajosModal({ abierto, onAbrirCambio }: { abierto: boolean; onAbrirCambio: (a: boolean) => void }) {
  return (
    <Dialog open={abierto} onOpenChange={onAbrirCambio}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            El sistema está optimizado para operar sin ratón, incluido el lector de códigos de barras (teclado HID).
          </DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-6 pt-1">
          <Grupo titulo={TITULO_AMBITO.global} atajos={ATAJOS_GLOBAL} />
          <Grupo titulo={TITULO_AMBITO.pos} atajos={ATAJOS_POS} />
          <Grupo titulo={TITULO_AMBITO.formularios} atajos={ATAJOS_FORMULARIOS} />
          <Grupo titulo={TITULO_AMBITO.tablas} atajos={ATAJOS_TABLAS} />
        </div>
        <p className="text-xs text-muted-foreground border-t pt-3 mt-1">{NOTA_CTRL_TAB}</p>
        <p className="text-xs text-muted-foreground">{NOTA_CTRL_N}</p>
        <p className="text-xs text-muted-foreground">{NOTA_CTRL_C}</p>
        <p className="text-xs text-muted-foreground">
          Los atajos con <Kbd>Alt</Kbd> funcionan incluso mientras escribe en un campo de texto.
        </p>
      </DialogContent>
    </Dialog>
  )
}
