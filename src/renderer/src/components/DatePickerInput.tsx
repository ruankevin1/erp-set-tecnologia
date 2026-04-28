import { useState, useEffect } from 'react'
import { format, parse, isValid } from 'date-fns'
import { ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

function parseDisplay(display: string): string | null {
  if (display.length !== 10) return null
  const parsed = parse(display, 'dd/MM/yyyy', new Date())
  if (!isValid(parsed)) return null
  if (format(parsed, 'dd/MM/yyyy') !== display) return null
  return format(parsed, 'yyyy-MM-dd')
}

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

interface MiniCalProps {
  selected: Date | undefined
  onSelect: (d: Date) => void
  fromYear: number
  toYear: number
}

function MiniCal({ selected, onSelect, fromYear, toYear }: MiniCalProps) {
  const [view, setView] = useState(() => {
    const base = selected ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  useEffect(() => {
    if (selected) setView(new Date(selected.getFullYear(), selected.getMonth(), 1))
  }, [selected])

  const year = view.getFullYear()
  const month = view.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const totalDays = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const canPrev = year > fromYear || (year === fromYear && month > 0)
  const canNext = year < toYear || (year === toYear && month < 11)

  function isSelected(day: number) {
    return !!selected &&
      selected.getFullYear() === year &&
      selected.getMonth() === month &&
      selected.getDate() === day
  }

  function isToday(day: number) {
    const t = new Date()
    return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day
  }

  return (
    <div className="p-3 w-[280px] select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setView(new Date(year, month - 1, 1))}
          disabled={!canPrev}
          className="h-7 w-7 rounded-md flex items-center justify-center border border-border bg-background hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">{MESES[month]} {year}</span>
        <button
          type="button"
          onClick={() => setView(new Date(year, month + 1, 1))}
          disabled={!canNext}
          className="h-7 w-7 rounded-md flex items-center justify-center border border-border bg-background hover:bg-accent disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="flex items-center justify-center h-7 text-[11px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => (
          <div key={i} className="flex items-center justify-center">
            {day !== null && (
              <button
                type="button"
                onClick={() => onSelect(new Date(year, month, day))}
                className={cn(
                  'h-8 w-8 rounded-md text-sm transition-colors',
                  isSelected(day)
                    ? 'bg-violet-600 text-white hover:bg-violet-700 font-semibold'
                    : isToday(day)
                    ? 'text-violet-600 font-bold hover:bg-accent'
                    : 'hover:bg-accent font-normal'
                )}
              >
                {day}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface DatePickerInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  fromYear?: number
  toYear?: number
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = 'DD/MM/AAAA',
  className,
  fromYear = 2010,
  toYear = new Date().getFullYear(),
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false)
  const [display, setDisplay] = useState(() => isoToDisplay(value))

  useEffect(() => {
    setDisplay(isoToDisplay(value))
  }, [value])

  function handleText(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskDate(e.target.value)
    setDisplay(masked)
    const iso = parseDisplay(masked)
    onChange(iso ?? (masked === '' ? '' : value))
  }

  function handleSelect(date: Date) {
    const iso = format(date, 'yyyy-MM-dd')
    onChange(iso)
    setDisplay(`${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`)
    setOpen(false)
  }

  const selected = value
    ? (() => { const d = parse(value, 'yyyy-MM-dd', new Date()); return isValid(d) ? d : undefined })()
    : undefined

  return (
    <div className={cn('flex gap-1', className)}>
      <Input
        value={display}
        onChange={handleText}
        placeholder={placeholder}
        maxLength={10}
        className="flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon" className="shrink-0">
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="p-0 w-auto"
          align="end"
          side="bottom"
          avoidCollisions
          collisionPadding={8}
          sideOffset={6}
        >
          <MiniCal
            selected={selected}
            onSelect={handleSelect}
            fromYear={fromYear}
            toYear={toYear}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
