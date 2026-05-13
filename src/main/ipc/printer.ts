import { IpcMain } from 'electron'
import Database from 'better-sqlite3'
import { exec } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer'

interface FaixaIntermediaria {
  ate_minutos: number
  valor: number
}

interface ConfigPreco {
  nome: string
  idade_min: number | null
  idade_max: number | null
  valor_base: number
  minutos_base: number
  faixas_intermediarias: string
  franquia_minutos: number
  valor_bloco: number
  minutos_por_bloco: number
}

interface TicketSettings {
  nome: string
  unidade: string
  tel1: string
  tel2: string
  rodape1: string
  rodape2: string
  exibirCodigo: boolean
  exibirEntrada: boolean
  exibirTabela: boolean
}

const W = 48
const FIXED_FOOTER = 'Desenvolvido por Set Tecnologia'

function center(s: string): string {
  const t = s.slice(0, W)
  const sp = Math.floor((W - t.length) / 2)
  return ' '.repeat(sp < 0 ? 0 : sp) + t
}

function hr(): string { return '-'.repeat(W) }
function HR(): string { return '='.repeat(W) }

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw
}
function brl(v: number): string { return `R$ ${v.toFixed(2).replace('.', ',')}` }
function brlPad(v: number): string { return `R$ ${v.toFixed(2).replace('.', ',').padStart(6)}` }
// SQLite datetime('now') stores UTC without timezone marker; ensure correct local-time display
function parseUtcDate(s: string): Date { return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z') }

function addMinStr(base: Date, minutes: number): string {
  const d = new Date(base.getTime() + minutes * 60000)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function buildScheduleLines(dt: Date, config: ConfigPreco): string[] {
  const lines: string[] = []
  const faixas: FaixaIntermediaria[] = JSON.parse(config.faixas_intermediarias || '[]')
  faixas.sort((a, b) => a.ate_minutos - b.ate_minutos)

  lines.push(`ATÉ AS ${addMinStr(dt, config.minutos_base)} - ${brl(config.valor_base)}`)

  let prevMin = config.minutos_base
  for (let i = 0; i < faixas.length; i++) {
    const faixa = faixas[i]
    const isLast = i === faixas.length - 1
    const displayEnd = isLast ? Math.min(faixa.ate_minutos, config.franquia_minutos - 1) : faixa.ate_minutos
    lines.push(`DAS ${addMinStr(dt, prevMin + 1)} ATÉ ${addMinStr(dt, displayEnd)} - ${brl(faixa.valor)}`)
    prevMin = faixa.ate_minutos
  }

  const h = Math.floor(config.franquia_minutos / 60)
  const m = config.franquia_minutos % 60
  const franquiaLonga = h > 0 && m === 0
    ? (h === 1 ? '1 HORA' : `${h} HORAS`)
    : h > 0
      ? `${h === 1 ? '1 HORA' : `${h} HORAS`} E ${m} MINUTOS`
      : `${config.franquia_minutos} MINUTOS`
  const acresceText = `A PARTIR DE ${franquiaLonga} ACRESCE ${brl(config.valor_bloco)} A CADA ${config.minutos_por_bloco} MINUTOS`
  const words = acresceText.split(' ')
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= W) { line = candidate } else { lines.push(line); line = word }
  }
  if (line) lines.push(line)

  return lines
}

function getSettings(db: Database.Database): TicketSettings {
  const get = (k: string, def: string): string => {
    const r = db.prepare('SELECT valor FROM configuracoes_sistema WHERE chave = ?').get(k) as any
    return r?.valor ?? def
  }
  return {
    nome: get('estabelecimento_nome', 'PLAYKIDS'),
    unidade: get('ticket_unidade', ''),
    tel1: formatPhone(get('estabelecimento_telefone1', '')),
    tel2: formatPhone(get('estabelecimento_telefone2', '')),
    rodape1: get('rodape_ticket', 'Agradecemos sua visita!'),
    rodape2: get('ticket_rodape2', ''),
    exibirCodigo: get('ticket_exibir_codigo', 'true') !== 'false',
    exibirEntrada: get('ticket_exibir_entrada', 'true') !== 'false',
    exibirTabela: get('ticket_exibir_tabela', 'true') !== 'false',
  }
}

function getPrinterBrand(db: Database.Database): string {
  const r = db.prepare("SELECT valor FROM configuracoes_sistema WHERE chave = 'printer_brand'").get() as any
  return r?.valor ?? 'epson'
}

function getPricing(db: Database.Database, estabId: string): ConfigPreco[] {
  return db.prepare(
    'SELECT * FROM configuracoes_preco WHERE estabelecimento_id = ? AND ativo = 1 ORDER BY idade_min'
  ).all(estabId) as ConfigPreco[]
}

function getIface(db: Database.Database): string {
  const r = db.prepare("SELECT valor FROM configuracoes_sistema WHERE chave = 'printer_interface'").get() as any
  return r?.valor || process.env.PRINTER_INTERFACE || 'tcp://127.0.0.1:9100'
}

function buildFooter(s: TicketSettings): string[] {
  const lines: string[] = [HR()]
  if (s.rodape1) lines.push(center(s.rodape1))
  if (s.rodape2) lines.push(center(s.rodape2))
  lines.push(center(FIXED_FOOTER), HR())
  return lines
}

function buildEntradaText(
  data: { criancaNome: string; responsavelNome?: string; responsavelTelefone?: string; entradaEm: string; ticketNumero: number },
  configs: ConfigPreco[],
  s: TicketSettings
): string {
  const dt = new Date(data.entradaEm)
  const dataStr = dt.toLocaleDateString('pt-BR')
  const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const tels = [s.tel1, s.tel2].filter(Boolean).join('  ')

  const lines: string[] = [
    HR(),
    center(s.nome.toUpperCase()),
    ...(s.unidade ? [center(s.unidade)] : []),
    ...(tels ? [center(tels)] : []),
    HR(),
  ]

  const headerParts: string[] = ['ENTRADA']
  if (s.exibirCodigo) headerParts.push(`#${String(data.ticketNumero).padStart(3, '0')}`)
  if (s.exibirEntrada) headerParts.push(`${dataStr}  ${hora}`)
  lines.push(headerParts.join('  '))

  lines.push(
    hr(),
    `Criança: ${data.criancaNome}`.slice(0, W),
  )
  if (data.responsavelNome) {
    lines.push(`Resp.:   ${data.responsavelNome}`.slice(0, W))
    if (data.responsavelTelefone) lines.push(`         ${data.responsavelTelefone}`.slice(0, W))
  }
  lines.push(hr())

  if (s.exibirTabela && configs.length > 0) {
    for (const cfg of configs) {
      if (configs.length > 1) {
        const ageLabel = cfg.idade_min != null && cfg.idade_max != null
          ? `${cfg.nome} (${cfg.idade_min}-${cfg.idade_max} anos)`
          : cfg.nome
        lines.push(center(`-- ${ageLabel} --`))
      }
      lines.push(...buildScheduleLines(dt, cfg))
    }
  }

  lines.push(...buildFooter(s))
  return lines.join('\n')
}

function col(left: string, right: string): string {
  const space = W - left.length - right.length
  return (left + ' '.repeat(Math.max(1, space)) + right).slice(0, W)
}

function buildBreakdown(minutos: number, config: ConfigPreco): string[] {
  const faixas: FaixaIntermediaria[] = JSON.parse(config.faixas_intermediarias || '[]')
  faixas.sort((a, b) => a.ate_minutos - b.ate_minutos)

  if (minutos <= config.minutos_base) {
    return [col(`Ate ${config.minutos_base}min`, brl(config.valor_base))]
  }

  for (const faixa of faixas) {
    if (minutos <= faixa.ate_minutos) {
      return [col(`Ate ${faixa.ate_minutos}min`, brl(faixa.valor))]
    }
  }

  const valorBase = faixas.length > 0 ? faixas[faixas.length - 1].valor : config.valor_base
  const labelBase = faixas.length > 0
    ? `Ate ${faixas[faixas.length - 1].ate_minutos}min`
    : `Ate ${config.minutos_base}min`

  const extra = minutos - config.franquia_minutos
  if (extra <= 0) return [col(labelBase, brl(valorBase))]

  const blocos = Math.ceil(extra / config.minutos_por_bloco)
  const valorExtra = blocos * config.valor_bloco

  return [
    col(labelBase, brl(valorBase)),
    col(`+${extra}min (${blocos}x R$${config.valor_bloco.toFixed(0)})`, brl(valorExtra)),
  ]
}

function buildSaidaText(
  data: {
    criancaNome: string; responsavelNome?: string; entradaEm: string; saidaEm: string
    minutos: number; valorTotal: number; valorOriginal?: number; descontoValor?: number
    motivoDesconto?: string; formaPagamento?: string; ticketNumero?: number
    configuracao?: ConfigPreco
  },
  s: TicketSettings
): string {
  const entrada = new Date(data.entradaEm)
  const saida = new Date(data.saidaEm)
  const h = Math.floor(data.minutos / 60)
  const m = data.minutos % 60
  const dur = h > 0 ? `${h}h ${m}min` : `${m}min`
  const dataStr = saida.toLocaleDateString('pt-BR')
  const tels = [s.tel1, s.tel2].filter(Boolean).join('  ')
  const hasDesconto = data.descontoValor && data.descontoValor > 0

  const breakdown = data.configuracao ? buildBreakdown(data.minutos, data.configuracao) : []
  const descontoMonetario = (data.valorOriginal ?? data.valorTotal) - data.valorTotal

  const lines: string[] = [
    HR(),
    center(s.nome.toUpperCase()),
    ...(s.unidade ? [center(s.unidade)] : []),
    ...(tels ? [center(tels)] : []),
    HR(),
    ...(data.ticketNumero ? [center(`COMPROVANTE #${String(data.ticketNumero).padStart(3, '0')}`)] : []),
    center(dataStr),
    hr(),
    `Criança: ${data.criancaNome}`.slice(0, W),
    ...(data.responsavelNome ? [`Resp.:   ${data.responsavelNome}`.slice(0, W)] : []),
    hr(),
    `Entrada:  ${entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    `Saída:    ${saida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    `Duração:  ${dur}`,
    hr(),
    ...breakdown,
    ...(breakdown.length ? [hr()] : []),
    ...(hasDesconto ? [
      col('VALOR ORIGINAL:', brl(data.valorOriginal ?? data.valorTotal)),
      col('DESCONTO:',       `-${brl(descontoMonetario)}`),
      hr(),
      center(`TOTAL PAGO ${brl(data.valorTotal)}`),
      ...(data.motivoDesconto ? [`Motivo: ${data.motivoDesconto}`.slice(0, W)] : []),
    ] : [
      center(`PAGO ${brl(data.valorTotal)}`),
    ]),
    ...(data.formaPagamento ? [`Pgto: ${data.formaPagamento}`.slice(0, W)] : []),
    ...buildFooter(s),
  ]
  return lines.join('\n')
}

function makePrinter(iface: string, brand = 'epson'): ThermalPrinter {
  const effectiveIface = iface.startsWith('printer:') ? 'tcp://127.0.0.1:9100' : iface
  // Daruma DR800 suporta ESC/POS padrão — usar EPSON para compatibilidade
  // A diferença está apenas no character set para acentuação correta
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: effectiveIface,
    characterSet: brand === 'daruma' ? CharacterSet.PC860_PORTUGUESE : CharacterSet.PC850_MULTILINGUAL,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    options: { timeout: 5000 }
  })
}

async function isConnected(printer: ThermalPrinter, iface: string): Promise<boolean> {
  if (iface.startsWith('printer:')) {
    const name = iface.replace('printer:', '')
    return new Promise(resolve => {
      exec('wmic printer get name', (err, stdout) => {
        if (err) { resolve(false); return }
        resolve(stdout.toLowerCase().includes(name.toLowerCase()))
      })
    })
  }
  return printer.isPrinterConnected()
}

async function sendRawToWindowsPrinter(printerName: string, data: Buffer): Promise<void> {
  const tmpBin = path.join(os.tmpdir(), `pos_${Date.now()}.bin`)
  await fs.promises.writeFile(tmpBin, data)

  const escapedBin = tmpBin.replace(/\\/g, '\\\\')
  const ps = [
    `$bytes = [System.IO.File]::ReadAllBytes("${escapedBin}")`,
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public class RawPrint {',
    '  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]',
    '  public class DOCINFOA { public string pDocName; public string pOutputFile; public string pDataType; }',
    '  [DllImport("winspool.Drv")] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr p);',
    '  [DllImport("winspool.Drv")] public static extern bool ClosePrinter(IntPtr h);',
    '  [DllImport("winspool.Drv")] public static extern int StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA d);',
    '  [DllImport("winspool.Drv")] public static extern bool EndDocPrinter(IntPtr h);',
    '  [DllImport("winspool.Drv")] public static extern bool StartPagePrinter(IntPtr h);',
    '  [DllImport("winspool.Drv")] public static extern bool EndPagePrinter(IntPtr h);',
    '  [DllImport("winspool.Drv")] public static extern bool WritePrinter(IntPtr h, IntPtr p, int c, out int w);',
    '}',
    '"@',
    '$h = [IntPtr]::Zero',
    `[RawPrint]::OpenPrinter("${printerName}", [ref]$h, [IntPtr]::Zero) | Out-Null`,
    '$di = New-Object RawPrint+DOCINFOA; $di.pDocName = "RAW"; $di.pDataType = "RAW"',
    '[RawPrint]::StartDocPrinter($h, 1, $di) | Out-Null',
    '[RawPrint]::StartPagePrinter($h) | Out-Null',
    '$ptr = [System.Runtime.InteropServices.Marshal]::AllocCoTaskMem($bytes.Length)',
    '[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)',
    '$written = 0',
    '[RawPrint]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written) | Out-Null',
    '[System.Runtime.InteropServices.Marshal]::FreeCoTaskMem($ptr)',
    '[RawPrint]::EndPagePrinter($h) | Out-Null',
    '[RawPrint]::EndDocPrinter($h) | Out-Null',
    '[RawPrint]::ClosePrinter($h) | Out-Null',
    `Remove-Item "${escapedBin}" -Force -ErrorAction SilentlyContinue`,
  ].join('\n')
  const tmpPs = path.join(os.tmpdir(), `pos_${Date.now()}.ps1`)
  await fs.promises.writeFile(tmpPs, ps, 'utf8')

  return new Promise((resolve, reject) => {
    exec(`powershell.exe -ExecutionPolicy Bypass -File "${tmpPs}"`, (err) => {
      fs.promises.unlink(tmpPs).catch(() => {})
      if (err) reject(err)
      else resolve()
    })
  })
}

async function executePrint(printer: ThermalPrinter, iface: string): Promise<void> {
  if (iface.startsWith('printer:')) {
    const name = iface.replace('printer:', '')
    const buf: Buffer = (printer as any).getBuffer()
    await sendRawToWindowsPrinter(name, buf)
  } else {
    await printer.execute()
  }
}

function printHeader(printer: ThermalPrinter, s: TicketSettings): void {
  const tels = [s.tel1, s.tel2].filter(Boolean).join('  ')
  printer.alignCenter()
  printer.bold(true)
  printer.setTextSize(1, 1)
  printer.println(s.nome.toUpperCase())
  printer.bold(false)
  printer.setTextNormal()
  if (s.unidade) printer.println(s.unidade)
  if (tels) printer.println(tels)
  printer.drawLine()
}

function printFooter(printer: ThermalPrinter, s: TicketSettings): void {
  printer.drawLine()
  printer.alignCenter()
  if (s.rodape1) printer.println(s.rodape1)
  if (s.rodape2) printer.println(s.rodape2)
  printer.println(FIXED_FOOTER)
  printer.cut()
}

export function registerPrinterHandlers(ipcMain: IpcMain, db: Database.Database): void {
  ipcMain.handle('printer:entrada', async (_event, data: {
    criancaNome: string
    responsavelNome?: string
    responsavelTelefone?: string
    entradaEm: string
    ticketNumero: number
    estabelecimentoId: string
  }) => {
    const s = getSettings(db)
    const configs = getPricing(db, data.estabelecimentoId)
    const preview = buildEntradaText(data, configs, s)

    try {
      const iface = getIface(db)
      const brand = getPrinterBrand(db)
      const printer = makePrinter(iface, brand)
      const connected = await isConnected(printer, iface)
      if (!connected) return { success: false, preview, error: 'Impressora não conectada' }

      const dt = new Date(data.entradaEm)
      printHeader(printer, s)
      printer.alignLeft()

      const headerParts: string[] = ['ENTRADA']
      if (s.exibirCodigo) headerParts.push(`#${String(data.ticketNumero).padStart(3, '0')}`)
      if (s.exibirEntrada) {
        headerParts.push(`${dt.toLocaleDateString('pt-BR')}`)
        headerParts.push(`${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
      }
      printer.println(headerParts.join('  '))

      printer.drawLine()
      printer.println(`CRIANÇA: ${data.criancaNome}`)
      if (data.responsavelNome) printer.println(`RESP:    ${data.responsavelNome}`)
      if (data.responsavelTelefone) printer.println(`TEL:     ${data.responsavelTelefone}`)

      if (s.exibirTabela && configs.length > 0) {
        printer.drawLine()
        for (const cfg of configs) {
          if (configs.length > 1) printer.println(cfg.nome)
          for (const line of buildScheduleLines(dt, cfg)) printer.println(line)
        }
      }

      printFooter(printer, s)
      await executePrint(printer, iface)
      return { success: true, preview }
    } catch (err: any) {
      return { success: false, preview, error: err.message }
    }
  })

  ipcMain.handle('printer:ticket', async (_event, data: {
    criancaNome: string
    responsavelNome?: string
    entradaEm: string
    saidaEm: string
    minutos: number
    valorTotal: number
    valorOriginal?: number
    descontoValor?: number
    motivoDesconto?: string
    formaPagamento?: string
    ticketNumero?: number
    configuracao?: ConfigPreco
    estabelecimentoId?: string
  }) => {
    const s = getSettings(db)
    const preview = buildSaidaText(data, s)

    try {
      const iface = getIface(db)
      const brand = getPrinterBrand(db)
      const printer = makePrinter(iface, brand)
      const connected = await isConnected(printer, iface)
      if (!connected) return { success: false, preview, error: 'Impressora não conectada' }

      const entrada = new Date(data.entradaEm)
      const saida = new Date(data.saidaEm)
      const h = Math.floor(data.minutos / 60)
      const m = data.minutos % 60
      const hasDesconto = data.descontoValor && data.descontoValor > 0

      printHeader(printer, s)
      printer.alignLeft()
      if (data.ticketNumero) {
        printer.alignCenter()
        printer.println(`COMPROVANTE #${String(data.ticketNumero).padStart(3, '0')}`)
        printer.println(saida.toLocaleDateString('pt-BR'))
        printer.alignLeft()
      }
      printer.drawLine()
      printer.println(`CRIANÇA: ${data.criancaNome}`)
      if (data.responsavelNome) printer.println(`RESP: ${data.responsavelNome}`)
      printer.drawLine()
      printer.println(`ENTRADA: ${entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
      printer.println(`SAÍDA:   ${saida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
      printer.println(`TEMPO:   ${h > 0 ? `${h}h ` : ''}${m}min`)
      printer.drawLine()
      if (data.configuracao) {
        for (const line of buildBreakdown(data.minutos, data.configuracao)) printer.println(line)
        printer.drawLine()
      }
      if (hasDesconto) {
        const descontoMon = (data.valorOriginal ?? data.valorTotal) - data.valorTotal
        printer.alignLeft()
        printer.println(col('VALOR ORIGINAL:', brl(data.valorOriginal ?? data.valorTotal)))
        printer.println(col('DESCONTO:', `-${brl(descontoMon)}`))
        printer.drawLine()
      }
      printer.bold(true)
      printer.alignCenter()
      printer.setTextSize(1, 1)
      printer.println(`${hasDesconto ? 'TOTAL PAGO' : 'PAGO'} ${brl(data.valorTotal)}`)
      printer.setTextNormal()
      printer.bold(false)
      printer.alignLeft()
      if (hasDesconto && data.motivoDesconto) printer.println(`Motivo: ${data.motivoDesconto}`)
      if (data.formaPagamento) printer.println(`Pgto: ${data.formaPagamento}`)

      printFooter(printer, s)
      await executePrint(printer, iface)
      return { success: true, preview }
    } catch (err: any) {
      return { success: false, preview, error: err.message }
    }
  })

  ipcMain.handle('printer:test', async (_event, interfaceUrl?: string) => {
    const iface = interfaceUrl || getIface(db)
    try {
      const brand = getPrinterBrand(db)
      const printer = makePrinter(iface, brand)
      const connected = await isConnected(printer, iface)
      return { success: connected }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('printer:ticket-grupo', async (_event, data: {
    responsavelNome?: string
    saidaEm: string
    criancas: Array<{ nome: string; entradaEm: string; minutos: number; valorTotal: number; ticketNumero?: number }>
    valorTotalGrupo: number
    formaPagamento?: string
    estabelecimentoId: string
  }) => {
    const s = getSettings(db)
    const saida = new Date(data.saidaEm)
    const dataStr = saida.toLocaleDateString('pt-BR')
    const tels = [s.tel1, s.tel2].filter(Boolean).join('  ')

    const lines: string[] = [
      HR(), center(s.nome.toUpperCase()),
      ...(s.unidade ? [center(s.unidade)] : []),
      ...(tels ? [center(tels)] : []),
      HR(), center('COMPROVANTE GRUPO'), center(dataStr), hr(),
      ...(data.responsavelNome ? [`Resp.: ${data.responsavelNome}`.slice(0, W)] : []),
      hr(),
    ]

    for (const c of data.criancas) {
      const entrada = new Date(c.entradaEm)
      const h = Math.floor(c.minutos / 60)
      const m = c.minutos % 60
      const dur = h > 0 ? `${h}h ${m}min` : `${m}min`
      lines.push(
        c.nome.slice(0, W),
        `Entrada: ${entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}  Saída: ${saida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        `Duração: ${dur}   Valor: ${brl(c.valorTotal)}`,
        hr(),
      )
    }

    lines.push(
      center(`TOTAL ${brl(data.valorTotalGrupo)}`),
      ...(data.formaPagamento ? [`FORMA: ${data.formaPagamento.toUpperCase()}`] : []),
      ...buildFooter(s),
    )
    const preview = lines.join('\n')

    try {
      const iface = getIface(db)
      const brand = getPrinterBrand(db)
      const printer = makePrinter(iface, brand)
      const connected = await isConnected(printer, iface)
      if (!connected) return { success: false, preview, error: 'Impressora não conectada' }

      printHeader(printer, s)
      printer.alignCenter()
      printer.println('COMPROVANTE GRUPO')
      printer.println(dataStr)
      printer.alignLeft()
      printer.drawLine()
      if (data.responsavelNome) printer.println(`RESP: ${data.responsavelNome}`)
      printer.drawLine()

      for (const c of data.criancas) {
        const entrada = new Date(c.entradaEm)
        const h = Math.floor(c.minutos / 60)
        const m = c.minutos % 60
        printer.println(`CRIANÇA: ${c.nome}`)
        printer.println(`ENTRADA: ${entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}  SAÍDA: ${saida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)
        printer.println(`TEMPO: ${h > 0 ? `${h}h ` : ''}${m}min   VALOR: ${brl(c.valorTotal)}`)
        printer.drawLine()
      }

      printer.bold(true)
      printer.alignCenter()
      printer.setTextSize(1, 1)
      printer.println(`TOTAL ${brl(data.valorTotalGrupo)}`)
      printer.setTextNormal()
      printer.bold(false)
      if (data.formaPagamento) {
        printer.alignLeft()
        printer.println(`FORMA: ${data.formaPagamento.toUpperCase()}`)
      }
      printFooter(printer, s)
      await executePrint(printer, iface)
      return { success: true, preview }
    } catch (err: any) {
      return { success: false, preview, error: err.message }
    }
  })

  ipcMain.handle('printer:caixa-abertura', async (_event, data: {
    operador_nome: string
    suprimento_inicial: number
    abertura_em: string
  }) => {
    const s = getSettings(db)
    const dt = parseUtcDate(data.abertura_em)
    const dataStr = dt.toLocaleDateString('pt-BR')
    const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    const lines: string[] = [
      HR(),
      center(s.nome.toUpperCase()),
      ...(s.unidade ? [center(s.unidade)] : []),
      HR(),
      center('ABERTURA DE CAIXA'),
      center(`${dataStr} - ${hora}`),
      hr(),
      `Operador: ${data.operador_nome}`.slice(0, W),
      col('Suprimento inicial:', brlPad(data.suprimento_inicial)),
      ...buildFooter(s),
    ]
    const preview = lines.join('\n')

    try {
      const iface = getIface(db)
      const brand = getPrinterBrand(db)
      const printer = makePrinter(iface, brand)
      const connected = await isConnected(printer, iface)
      if (!connected) return { success: false, preview, error: 'Impressora não conectada' }

      printHeader(printer, s)
      printer.alignCenter()
      printer.println('ABERTURA DE CAIXA')
      printer.println(`${dataStr} - ${hora}`)
      printer.alignLeft()
      printer.drawLine()
      printer.println(`Operador: ${data.operador_nome}`)
      printer.println(col('Suprimento inicial:', brlPad(data.suprimento_inicial)))
      printFooter(printer, s)
      await executePrint(printer, iface)
      return { success: true, preview }
    } catch (err: any) {
      return { success: false, preview, error: err.message }
    }
  })

  ipcMain.handle('printer:caixa-fechamento', async (_event, data: {
    operador_nome: string
    abertura_em: string
    fechamento_em: string
    total_entradas: number
    media_minutos: number
    por_forma: Array<{ forma: string; total: number }>
    suprimento_inicial: number
    total_descontos?: number
    total_bruto?: number
    descontos_por_motivo?: Array<{ motivo: string; total: number }>
  }) => {
    const s = getSettings(db)
    const abertura = parseUtcDate(data.abertura_em)
    const fechamento = parseUtcDate(data.fechamento_em)
    const dataStr = fechamento.toLocaleDateString('pt-BR')
    const horaFechamento = fechamento.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const horaAbertura = abertura.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

    const formaMap: Record<string, number> = {}
    for (const f of data.por_forma) {
      if (f.forma) formaMap[f.forma.toLowerCase()] = (formaMap[f.forma.toLowerCase()] ?? 0) + f.total
    }
    const FORMAS = ['Dinheiro', 'PIX', 'Cartão Débito', 'Cartão Crédito', 'Cortesia']
    let totalDinheiro = 0
    for (const [k, v] of Object.entries(formaMap)) {
      if (k.includes('dinheiro')) totalDinheiro += v
    }
    const totalBruto = data.total_bruto ?? data.por_forma.reduce((acc, f) => acc + f.total, 0)
    const totalDescontos = data.total_descontos ?? 0
    const totalLiquido = totalBruto - totalDescontos
    const totalEsperado = data.suprimento_inicial + totalDinheiro
    const h = Math.floor(data.media_minutos / 60)
    const m = data.media_minutos % 60
    const mediaStr = h > 0 ? `${h}h ${m}min` : `${m}min`
    const motivosDesconto = data.descontos_por_motivo ?? []

    const lines: string[] = [
      HR(),
      center(s.nome.toUpperCase()),
      ...(s.unidade ? [center(s.unidade)] : []),
      HR(),
      center('FECHAMENTO DE CAIXA'),
      center(`${dataStr} - ${horaFechamento}`),
      hr(),
      `Operador: ${data.operador_nome}`.slice(0, W),
      col('Abertura:', horaAbertura),
      col('Fechamento:', horaFechamento),
      hr(),
      center('RESUMO DO DIA'),
      hr(),
      col('Total de visitas:', String(data.total_entradas)),
      col('Tempo médio:', mediaStr),
      hr(),
      center('FORMAS DE PAGAMENTO'),
      hr(),
      ...FORMAS.map(forma => col(`${forma}:`, brlPad(formaMap[forma.toLowerCase()] ?? 0))),
      hr(),
      col('TOTAL BRUTO:', brlPad(totalBruto)),
      col('Descontos:', totalDescontos > 0 ? `-${brlPad(totalDescontos)}` : brlPad(0)),
      col('TOTAL LÍQUIDO:', brlPad(totalLiquido)),
      ...(motivosDesconto.length > 0 ? [
        hr(),
        center('DESCONTOS POR MOTIVO'),
        hr(),
        ...motivosDesconto.map(d => col(`${d.motivo}:`, brlPad(d.total))),
      ] : []),
      hr(),
      center('CONFERÊNCIA DO CAIXA'),
      hr(),
      col('Suprimento inicial:', brlPad(data.suprimento_inicial)),
      col('Total em dinheiro:', brlPad(totalDinheiro)),
      col('Total esperado:', brlPad(totalEsperado)),
      ...buildFooter(s),
    ]
    const preview = lines.join('\n')

    try {
      const iface = getIface(db)
      const brand = getPrinterBrand(db)
      const printer = makePrinter(iface, brand)
      const connected = await isConnected(printer, iface)
      if (!connected) return { success: false, preview, error: 'Impressora não conectada' }

      printHeader(printer, s)
      printer.alignCenter()
      printer.println('FECHAMENTO DE CAIXA')
      printer.println(`${dataStr} - ${horaFechamento}`)
      printer.alignLeft()
      printer.drawLine()
      printer.println(`Operador: ${data.operador_nome}`)
      printer.println(col('Abertura:', horaAbertura))
      printer.println(col('Fechamento:', horaFechamento))
      printer.drawLine()
      printer.alignCenter()
      printer.println('RESUMO DO DIA')
      printer.alignLeft()
      printer.drawLine()
      printer.println(col('Total de visitas:', String(data.total_entradas)))
      printer.println(col('Tempo médio:', mediaStr))
      printer.drawLine()
      printer.alignCenter()
      printer.println('FORMAS DE PAGAMENTO')
      printer.alignLeft()
      printer.drawLine()
      for (const forma of FORMAS) {
        printer.println(col(`${forma}:`, brlPad(formaMap[forma.toLowerCase()] ?? 0)))
      }
      printer.drawLine()
      printer.println(col('TOTAL BRUTO:', brlPad(totalBruto)))
      printer.println(col('Descontos:', totalDescontos > 0 ? `-${brlPad(totalDescontos)}` : brlPad(0)))
      printer.bold(true)
      printer.println(col('TOTAL LÍQUIDO:', brlPad(totalLiquido)))
      printer.bold(false)
      if (motivosDesconto.length > 0) {
        printer.drawLine()
        printer.alignCenter()
        printer.println('DESCONTOS POR MOTIVO')
        printer.alignLeft()
        printer.drawLine()
        for (const d of motivosDesconto) {
          printer.println(col(`${d.motivo}:`, brlPad(d.total)))
        }
      }
      printer.drawLine()
      printer.alignCenter()
      printer.println('CONFERÊNCIA DO CAIXA')
      printer.alignLeft()
      printer.drawLine()
      printer.println(col('Suprimento inicial:', brlPad(data.suprimento_inicial)))
      printer.println(col('Total em dinheiro:', brlPad(totalDinheiro)))
      printer.bold(true)
      printer.println(col('Total esperado:', brlPad(totalEsperado)))
      printer.bold(false)
      printFooter(printer, s)
      await executePrint(printer, iface)
      return { success: true, preview }
    } catch (err: any) {
      return { success: false, preview, error: err.message }
    }
  })

  ipcMain.handle('printer:list-usb', async () => {
    return new Promise<string[]>((resolve) => {
      const cmd = process.platform === 'win32'
        ? 'wmic printer get name'
        : 'lpstat -a'
      exec(cmd, (err, stdout) => {
        if (err) { resolve([]); return }
        const lines = stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0)
        if (process.platform === 'win32') {
          // First line is "Name" header — skip it
          resolve(lines.slice(1).filter(l => l.length > 0))
        } else {
          // lpstat format: "PrinterName accepting requests since..."
          resolve(lines.map(l => l.split(' ')[0]).filter(l => l.length > 0))
        }
      })
    })
  })
}
