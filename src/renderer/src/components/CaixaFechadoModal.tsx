import { Lock } from 'lucide-react'
import { Dialog, DialogContent } from './ui/dialog'
import { Button } from './ui/button'

interface Props {
  open: boolean
  onClose: () => void
}

export function CaixaFechadoModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xs text-center px-8 py-8">
        <div className="flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">Caixa fechado</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              O caixa precisa estar aberto para registrar entradas. Acesse o{' '}
              <span className="font-medium text-foreground">Dashboard</span> para abrir o caixa.
            </p>
          </div>

          <Button onClick={onClose} className="w-full bg-violet-600 hover:bg-violet-700">
            Entendido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
