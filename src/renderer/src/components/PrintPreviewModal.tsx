import { Printer } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface PrintPreviewModalProps {
  open: boolean
  onClose: () => void
  content: string
  title?: string
}

export function PrintPreviewModal({ open, onClose, content, title = 'Preview do Ticket' }: PrintPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-auto max-w-[90vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Printer className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 overflow-y-auto">
          <div
            className="bg-white text-black border border-gray-200 shadow-md rounded px-3 py-3"
            style={{
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: '13px',
              lineHeight: '1.6',
              whiteSpace: 'pre',
              display: 'inline-block',
            }}
          >
            {content}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} className="w-full text-muted-foreground">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
