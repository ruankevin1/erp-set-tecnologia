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

const W = 48   // ESC/POS e preview UI
const GW = 32  // Daruma GDI — fonte maior exige menos chars por linha
const FIXED_FOOTER = 'Desenvolvido por Set Tecnologia'

function isGdiPrint(iface: string, brand: string): boolean {
  return iface.startsWith('printer:') && brand === 'daruma'
}

function center(s: string, w = W): string {
  const t = s.slice(0, w)
  const sp = Math.floor((w - t.length) / 2)
  return ' '.repeat(sp < 0 ? 0 : sp) + t
}

function hr(w = W): string { return '-'.repeat(w) }
function HR(w = W): string { return '='.repeat(w) }

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

function buildScheduleLines(dt: Date, config: ConfigPreco, w = W): string[] {
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
  const acresceText = `APOS ${franquiaLonga}: +${brl(config.valor_bloco)}/CADA ${config.minutos_por_bloco}MIN`
  const words = acresceText.split(' ')
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length <= w) { line = candidate } else { lines.push(line); line = word }
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

function buildFooter(s: TicketSettings, w = W): string[] {
  const lines: string[] = [HR(w)]
  if (s.rodape1) lines.push(center(s.rodape1, w))
  if (s.rodape2) lines.push(center(s.rodape2, w))
  lines.push(center(FIXED_FOOTER, w), HR(w))
  return lines
}

function buildEntradaText(
  data: { criancaNome: string; responsavelNome?: string; responsavelTelefone?: string; entradaEm: string; ticketNumero: number },
  configs: ConfigPreco[],
  s: TicketSettings,
  w = W
): string {
  const dt = new Date(data.entradaEm)
  const dataStr = dt.toLocaleDateString('pt-BR')
  const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const tels = [s.tel1, s.tel2].filter(Boolean).join('  ')

  const lines: string[] = [
    HR(w),
    center(s.nome.toUpperCase(), w),
    ...(s.unidade ? [center(s.unidade, w)] : []),
    ...(tels ? [center(tels, w)] : []),
    HR(w),
  ]

  const headerParts: string[] = ['ENTRADA']
  if (s.exibirCodigo) headerParts.push(`#${String(data.ticketNumero).padStart(3, '0')}`)
  if (s.exibirEntrada) headerParts.push(`${dataStr}  ${hora}`)
  lines.push(center(headerParts.join('  '), w))

  lines.push(
    hr(w),
    `Criança: ${data.criancaNome}`.slice(0, w),
  )
  if (data.responsavelNome) {
    lines.push(`Resp.:   ${data.responsavelNome}`.slice(0, w))
    if (data.responsavelTelefone) lines.push(`         ${data.responsavelTelefone}`.slice(0, w))
  }
  lines.push(hr(w))

  if (s.exibirTabela && configs.length > 0) {
    for (const cfg of configs) {
      if (configs.length > 1) {
        const ageLabel = cfg.idade_min != null && cfg.idade_max != null
          ? `${cfg.nome} (${cfg.idade_min}-${cfg.idade_max} anos)`
          : cfg.nome
        lines.push(center(`-- ${ageLabel} --`, w))
      }
      lines.push(...buildScheduleLines(dt, cfg, w))
    }
  }

  lines.push(...buildFooter(s, w))
  return lines.join('\n')
}

function col(left: string, right: string, w = W): string {
  const space = w - left.length - right.length
  return (left + ' '.repeat(Math.max(1, space)) + right).slice(0, w)
}

function buildBreakdown(minutos: number, config: ConfigPreco, w = W): string[] {
  const faixas: FaixaIntermediaria[] = JSON.parse(config.faixas_intermediarias || '[]')
  faixas.sort((a, b) => a.ate_minutos - b.ate_minutos)

  if (minutos <= config.minutos_base) {
    return [col(`Ate ${config.minutos_base}min`, brl(config.valor_base), w)]
  }

  for (const faixa of faixas) {
    if (minutos <= faixa.ate_minutos) {
      return [col(`Ate ${faixa.ate_minutos}min`, brl(faixa.valor), w)]
    }
  }

  const valorBase = faixas.length > 0 ? faixas[faixas.length - 1].valor : config.valor_base
  const labelBase = faixas.length > 0
    ? `Ate ${faixas[faixas.length - 1].ate_minutos}min`
    : `Ate ${config.minutos_base}min`

  const extra = minutos - config.franquia_minutos
  if (extra <= 0) return [col(labelBase, brl(valorBase), w)]

  const blocos = Math.ceil(extra / config.minutos_por_bloco)
  const valorExtra = blocos * config.valor_bloco

  return [
    col(labelBase, brl(valorBase), w),
    col(`+${extra}min (${blocos}x R$${config.valor_bloco.toFixed(0)})`, brl(valorExtra), w),
  ]
}

function buildSaidaText(
  data: {
    criancaNome: string; responsavelNome?: string; entradaEm: string; saidaEm: string
    minutos: number; valorTotal: number; valorOriginal?: number; descontoValor?: number
    motivoDesconto?: string; formaPagamento?: string; ticketNumero?: number
    configuracao?: ConfigPreco
  },
  s: TicketSettings,
  w = W
): string {
  const entrada = new Date(data.entradaEm)
  const saida = new Date(data.saidaEm)
  const h = Math.floor(data.minutos / 60)
  const m = data.minutos % 60
  const dur = h > 0 ? `${h}h ${m}min` : `${m}min`
  const dataStr = saida.toLocaleDateString('pt-BR')
  const tels = [s.tel1, s.tel2].filter(Boolean).join('  ')
  const hasDesconto = data.descontoValor && data.descontoValor > 0

  const breakdown = data.configuracao ? buildBreakdown(data.minutos, data.configuracao, w) : []
  const descontoMonetario = (data.valorOriginal ?? data.valorTotal) - data.valorTotal

  const lines: string[] = [
    HR(w),
    center(s.nome.toUpperCase(), w),
    ...(s.unidade ? [center(s.unidade, w)] : []),
    ...(tels ? [center(tels, w)] : []),
    HR(w),
    ...(data.ticketNumero ? [center(`COMPROVANTE #${String(data.ticketNumero).padStart(3, '0')}`, w)] : []),
    center(dataStr, w),
    hr(w),
    `Criança: ${data.criancaNome}`.slice(0, w),
    ...(data.responsavelNome ? [`Resp.:   ${data.responsavelNome}`.slice(0, w)] : []),
    hr(w),
    `Entrada:  ${entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    `Saída:    ${saida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    `Duração:  ${dur}`,
    hr(w),
    ...breakdown,
    ...(breakdown.length ? [hr(w)] : []),
    ...(hasDesconto ? [
      col('VALOR ORIGINAL:', brl(data.valorOriginal ?? data.valorTotal), w),
      col('DESCONTO:',       `-${brl(descontoMonetario)}`, w),
      hr(w),
      center(`TOTAL PAGO ${brl(data.valorTotal)}`, w),
      ...(data.motivoDesconto ? [`Motivo: ${data.motivoDesconto}`.slice(0, w)] : []),
    ] : [
      center(`PAGO ${brl(data.valorTotal)}`, w),
    ]),
    ...(data.formaPagamento ? [`Pgto: ${data.formaPagamento}`.slice(0, w)] : []),
    ...buildFooter(s, w),
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

// GDI para Daruma DR800 Spooler (driver GDI — não aceita RAW ESC/POS).
// Renderiza texto num bitmap em memória, detecta se o driver espelha (ScaleX < 0),
// pré-inverte o bitmap se necessário → driver espelha de volta → saída correta.
// Epson/Bematech/TCP não usam esta função.
async function sendGdiTextToWindowsPrinter(printerName: string, text: string, lineWidth = 48): Promise<void> {
  const tmpTxt = path.join(os.tmpdir(), `receipt_${Date.now()}.txt`)
  await fs.promises.writeFile(tmpTxt, text, 'utf8')

  const escapedTxt = tmpTxt.replace(/\\/g, '\\\\')
  const escapedPrinter = printerName.replace(/"/g, '\\"')

  const ps = [
    'Add-Type -AssemblyName System.Drawing',
    `$lines = [System.IO.File]::ReadAllLines("${escapedTxt}", [System.Text.Encoding]::UTF8)`,
    '$doc = New-Object System.Drawing.Printing.PrintDocument',
    `$doc.PrinterSettings.PrinterName = "${escapedPrinter}"`,
    '$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)',
    '$doc.add_PrintPage({',
    '  param($s,$e)',
    '  # DPI real da impressora (Daruma DR800 = 203 dpi normalmente)',
    '  $dpiX = if ($e.Graphics.DpiX -gt 10) { [float]$e.Graphics.DpiX } else { [float]203 }',
    '  $dpiY = if ($e.Graphics.DpiY -gt 10) { [float]$e.Graphics.DpiY } else { [float]203 }',
    '  # Largura do bitmap em pixels do dispositivo: PageBounds esta em 1/100 pol, dpi converte para pixels',
    '  $bmpW = [int][Math]::Max([int]($e.PageBounds.Width * $dpiX / 100.0), 300)',
    `  # Auto-sizing: encontra o maior tamanho de fonte onde ${lineWidth} chars cabem em 90% da largura da pagina`,
    '  $targetW = [float]($bmpW * 0.90)',
    `  $ruler   = [string]::new([char]"M", ${lineWidth})`,
    '  $fontSize = [float]11',
    '  $font = $null; $lh = [float]0',
    '  do {',
    '    if ($font) { $font.Dispose() }',
    '    $font = New-Object System.Drawing.Font("Courier New", $fontSize, [System.Drawing.FontStyle]::Bold)',
    '    $t1 = New-Object System.Drawing.Bitmap(1,1); $t1.SetResolution($dpiX,$dpiY)',
    '    $t2 = [System.Drawing.Graphics]::FromImage($t1)',
    '    $measW = $t2.MeasureString($ruler, $font).Width',
    '    $lh    = [float]($font.GetHeight($t2) + 3)',
    '    $t2.Dispose(); $t1.Dispose()',
    '    if ($measW -le $targetW) { break }',
    '    $fontSize -= [float]0.5',
    '  } while ($fontSize -ge 6)',
    '  $bmpH = [int][Math]::Max($lh * $lines.Count + 40, 100)',
    '  # Bitmap na resolucao da impressora: DrawImage 1:1 = escala correta no papel',
    '  $bmp = New-Object System.Drawing.Bitmap($bmpW, $bmpH)',
    '  $bmp.SetResolution($dpiX, $dpiY)',
    '  $g2  = [System.Drawing.Graphics]::FromImage($bmp)',
    '  $g2.Clear([System.Drawing.Color]::White)',
    '  $g2.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::SingleBitPerPixelGridFit',
    '  $sf  = [System.Drawing.StringFormat]::GenericTypographic',
    '  $brush = [System.Drawing.Brushes]::Black',
    '  $y2 = [float]0',
    '  foreach ($line in $lines) {',
    '    $g2.DrawString($line, $font, $brush, [float]0, $y2, $sf)',
    '    $y2 += $lh',
    '  }',
    '  $g2.Dispose()',
    '  # Se o driver espelha (ScaleX < 0), pre-inverte o bitmap',
    '  $elems = $e.Graphics.Transform.Elements',
    '  if ($elems[0] -lt 0) {',
    '    $bmp.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX)',
    '  }',
    '  # DrawImage sem rect: bitmap na resolucao da impressora = 1:1, sem distorcao',
    '  $e.Graphics.DrawImage($bmp, [float]0, [float]0)',
    '  $bmp.Dispose()',
    '  $font.Dispose()',
    '})',
    'try { $doc.Print() } catch { Write-Error $_.Exception.Message; exit 1 } finally { $doc.Dispose() }',
    `Remove-Item "${escapedTxt}" -Force -ErrorAction SilentlyContinue`,
  ].join('\n')

  const tmpPs = path.join(os.tmpdir(), `gdi_${Date.now()}.ps1`)
  await fs.promises.writeFile(tmpPs, ps, 'utf8')

  return new Promise((resolve, reject) => {
    exec(`powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File "${tmpPs}"`, (err, _stdout, stderr) => {
      fs.promises.unlink(tmpPs).catch(() => {})
      if (err) reject(new Error(stderr || err.message))
      else resolve()
    })
  })
}

// Envia bytes ESC/POS direto pro spooler Windows via Win32 RAW API
// Para drivers que aceitam RAW (Epson, Bematech) — NÃO funciona com drivers GDI como Daruma Spooler
async function sendRawToWindowsPrinter(printerName: string, data: Buffer): Promise<void> {
  const tmpBin = path.join(os.tmpdir(), `receipt_${Date.now()}.bin`)
  await fs.promises.writeFile(tmpBin, data)

  const escapedBin = tmpBin.replace(/\\/g, '\\\\')
  const escapedPrinter = printerName.replace(/'/g, "''").replace(/"/g, '\\"')

  const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    public string pDocName = "Receipt";
    public string pOutputFile = null;
    public string pDataType = "RAW";
  }
  [DllImport("winspool.drv", CharSet=CharSet.Ansi)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv")] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv")] public static extern bool StartDocPrinter(IntPtr h, int lv, [In] DOCINFOA di);
  [DllImport("winspool.drv")] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv")] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv")] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv")] public static extern bool WritePrinter(IntPtr h, byte[] b, int cb, out int written);
  public static bool Print(string printerName, byte[] data) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    StartDocPrinter(hPrinter, 1, new DOCINFOA());
    StartPagePrinter(hPrinter);
    int written;
    WritePrinter(hPrinter, data, data.Length, out written);
    EndPagePrinter(hPrinter);
    EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    return true;
  }
}
"@ -Language CSharp
\$bytes = [System.IO.File]::ReadAllBytes("${escapedBin}")
\$ok = [RawPrint]::Print("${escapedPrinter}", \$bytes)
Remove-Item "${escapedBin}" -Force -ErrorAction SilentlyContinue
if (-not \$ok) { throw "Falha ao abrir impressora: ${escapedPrinter}" }
`

  const tmpPs = path.join(os.tmpdir(), `rawprint_${Date.now()}.ps1`)
  await fs.promises.writeFile(tmpPs, ps, 'utf8')

  return new Promise((resolve, reject) => {
    exec(`powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -NonInteractive -File "${tmpPs}"`, (err, _stdout, stderr) => {
      fs.promises.unlink(tmpPs).catch(() => {})
      if (err) {
        console.error('[rawprint] stderr:', stderr)
        reject(new Error(stderr || err.message))
      } else {
        resolve()
      }
    })
  })
}

async function executePrint(printer: ThermalPrinter, iface: string, brand?: string, plainText?: string, lineWidth = W): Promise<void> {
  if (iface.startsWith('printer:')) {
    const name = iface.replace('printer:', '')
    if (brand === 'daruma') {
      // Daruma DR800 Spooler é driver GDI — não aceita RAW ESC/POS.
      const text = plainText ?? ''
      await sendGdiTextToWindowsPrinter(name, text, lineWidth)
    } else {
      // Outros drivers Windows (Epson, Bematech) — tenta RAW ESC/POS via Win32
      const buf: Buffer = (printer as any).getBuffer()
      await sendRawToWindowsPrinter(name, buf)
    }
  } else {
    // TCP / USB direto — ESC/POS padrão
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
    const iface = getIface(db)
    const brand = getPrinterBrand(db)
    const w = isGdiPrint(iface, brand) ? GW : W
    const preview = buildEntradaText(data, configs, s, w)

    try {
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
          for (const line of buildScheduleLines(dt, cfg, W)) printer.println(line)
        }
      }

      printFooter(printer, s)
      await executePrint(printer, iface, brand, preview, w)
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
    const iface = getIface(db)
    const brand = getPrinterBrand(db)
    const w = isGdiPrint(iface, brand) ? GW : W
    const preview = buildSaidaText(data, s, w)

    try {
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
      await executePrint(printer, iface, brand, preview, w)
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

  ipcMain.handle('printer:print-test', async (_event, interfaceUrl?: string) => {
    const iface = interfaceUrl || getIface(db)
    const s = getSettings(db)
    const now = new Date().toLocaleString('pt-BR')
    const preview = [
      HR(),
      center(s.nome.toUpperCase()),
      HR(),
      center('IMPRESSAO DE TESTE'),
      center(now),
      hr(),
      'Texto normal',
      'Acentuacao: a e i o u',
      'Especiais: a o u c A E I O U',
      hr(),
      center('Impressora OK!'),
      HR(),
    ].join('\n')

    try {
      const brand = getPrinterBrand(db)
      const w = isGdiPrint(iface, brand) ? GW : W
      const printer = makePrinter(iface, brand)
      const connected = await isConnected(printer, iface)
      if (!connected) return { success: false, error: 'Impressora não conectada' }

      printer.alignCenter()
      printer.bold(true)
      printer.setTextSize(1, 1)
      printer.println(s.nome.toUpperCase())
      printer.setTextNormal()
      printer.bold(false)
      printer.drawLine()
      printer.println('IMPRESSAO DE TESTE')
      printer.println(now)
      printer.drawLine()
      printer.alignLeft()
      printer.println('Texto normal')
      printer.println('Acentuacao: a e i o u')
      printer.println('Especiais: a o u c A E I O U')
      printer.drawLine()
      printer.alignCenter()
      printer.println('Impressora OK!')
      printer.drawLine()
      printer.cut()

      await executePrint(printer, iface, brand, preview, w)
      return { success: true }
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
    const iface = getIface(db)
    const brand = getPrinterBrand(db)
    const w = isGdiPrint(iface, brand) ? GW : W
    const saida = new Date(data.saidaEm)
    const dataStr = saida.toLocaleDateString('pt-BR')
    const tels = [s.tel1, s.tel2].filter(Boolean).join('  ')

    const lines: string[] = [
      HR(w), center(s.nome.toUpperCase(), w),
      ...(s.unidade ? [center(s.unidade, w)] : []),
      ...(tels ? [center(tels, w)] : []),
      HR(w), center('COMPROVANTE GRUPO', w), center(dataStr, w), hr(w),
      ...(data.responsavelNome ? [`Resp.: ${data.responsavelNome}`.slice(0, w)] : []),
      hr(w),
    ]

    for (const c of data.criancas) {
      const entrada = new Date(c.entradaEm)
      const h = Math.floor(c.minutos / 60)
      const m = c.minutos % 60
      const dur = h > 0 ? `${h}h ${m}min` : `${m}min`
      lines.push(
        c.nome.slice(0, w),
        `Entrada: ${entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}  Saida: ${saida.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
        `Duracao: ${dur}   Valor: ${brl(c.valorTotal)}`,
        hr(w),
      )
    }

    lines.push(
      center(`TOTAL ${brl(data.valorTotalGrupo)}`, w),
      ...(data.formaPagamento ? [`FORMA: ${data.formaPagamento.toUpperCase()}`] : []),
      ...buildFooter(s, w),
    )
    const preview = lines.join('\n')

    try {
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
      await executePrint(printer, iface, brand, preview, w)
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

    const iface = getIface(db)
    const brand = getPrinterBrand(db)
    const w = isGdiPrint(iface, brand) ? GW : W

    const lines: string[] = [
      HR(w),
      center(s.nome.toUpperCase(), w),
      ...(s.unidade ? [center(s.unidade, w)] : []),
      HR(w),
      center('ABERTURA DE CAIXA', w),
      center(`${dataStr} - ${hora}`, w),
      hr(w),
      `Operador: ${data.operador_nome}`.slice(0, w),
      col('Suprimento inicial:', brlPad(data.suprimento_inicial), w),
      ...buildFooter(s, w),
    ]
    const preview = lines.join('\n')

    try {
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
      await executePrint(printer, iface, brand, preview, w)
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

    const iface = getIface(db)
    const brand = getPrinterBrand(db)
    const w = isGdiPrint(iface, brand) ? GW : W

    const lines: string[] = [
      HR(w),
      center(s.nome.toUpperCase(), w),
      ...(s.unidade ? [center(s.unidade, w)] : []),
      HR(w),
      center('FECHAMENTO DE CAIXA', w),
      center(`${dataStr} - ${horaFechamento}`, w),
      hr(w),
      `Operador: ${data.operador_nome}`.slice(0, w),
      col('Abertura:', horaAbertura, w),
      col('Fechamento:', horaFechamento, w),
      hr(w),
      center('RESUMO DO DIA', w),
      hr(w),
      col('Total de visitas:', String(data.total_entradas), w),
      col('Tempo medio:', mediaStr, w),
      hr(w),
      center('FORMAS DE PAGAMENTO', w),
      hr(w),
      ...FORMAS.map(forma => col(`${forma}:`, brlPad(formaMap[forma.toLowerCase()] ?? 0), w)),
      hr(w),
      col('TOTAL BRUTO:', brlPad(totalBruto), w),
      col('Descontos:', totalDescontos > 0 ? `-${brlPad(totalDescontos)}` : brlPad(0), w),
      col('TOTAL LIQUIDO:', brlPad(totalLiquido), w),
      ...(motivosDesconto.length > 0 ? [
        hr(w),
        center('DESCONTOS POR MOTIVO', w),
        hr(w),
        ...motivosDesconto.map(d => col(`${d.motivo}:`, brlPad(d.total), w)),
      ] : []),
      hr(w),
      center('CONFERENCIA DO CAIXA', w),
      hr(w),
      col('Suprimento inicial:', brlPad(data.suprimento_inicial), w),
      col('Total em dinheiro:', brlPad(totalDinheiro), w),
      col('Total esperado:', brlPad(totalEsperado), w),
      ...buildFooter(s, w),
    ]
    const preview = lines.join('\n')

    try {
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
      await executePrint(printer, iface, brand, preview, w)
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
