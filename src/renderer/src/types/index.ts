export interface Estabelecimento {
  id: string
  nome: string
  cnpj?: string
  endereco?: string
  telefone?: string
  ativo: number
}

export interface FaixaIntermediaria {
  ate_minutos: number
  valor: number
}

export interface ConfiguracaoPreco {
  id: string
  estabelecimento_id: string
  nome: string
  idade_min?: number | null
  idade_max?: number | null
  valor_base: number
  minutos_base: number
  faixas_intermediarias: string  // JSON: FaixaIntermediaria[]
  franquia_minutos: number
  valor_bloco: number
  minutos_por_bloco: number
  ativo: number
}

export interface Operador {
  id: string
  estabelecimento_id: string
  nome: string
  login: string
  nivel_acesso: 'operador' | 'supervisor' | 'admin'
  ativo: number
}

export interface UsuarioItem {
  id: string
  nome: string
  login: string
  perfil: 'admin' | 'operador'
  master: number
  ativo: number
}

export interface Responsavel {
  id: string
  estabelecimento_id: string
  nome: string
  cpf?: string
  telefone?: string
  email?: string
}

export interface Crianca {
  id: string
  estabelecimento_id: string
  responsavel_id?: string
  nome: string
  data_nascimento?: string
  cpf?: string
  observacoes?: string
  responsavel_nome?: string
  responsavel_cpf?: string
  responsavel_telefone?: string
  responsavel_email?: string
  ultima_visita?: string
}

export interface ChildWithStats {
  id: string
  estabelecimento_id?: string
  nome: string
  data_nascimento?: string
  cpf?: string
  observacoes?: string
  responsavel_id?: string
  responsavel_nome?: string
  responsavel_cpf?: string
  responsavel_telefone?: string
  responsavel_email?: string
  total_visitas: number
  ultima_visita?: string
  total_gasto: number
  visita_ativa: number
}

export interface Visita {
  id: string
  estabelecimento_id: string
  crianca_id: string
  responsavel_id?: string
  operador_id?: string
  entrada_em: string
  saida_em?: string
  valor_total?: number
  valor_original?: number
  desconto_tipo?: 'percentual' | 'fixo'
  desconto_valor?: number
  motivo_desconto?: string
  status: 'ativa' | 'finalizada' | 'cancelada'
  ticket_numero?: number
  forma_pagamento?: string
  crianca_nome?: string
  responsavel_nome?: string
  responsavel_telefone?: string
  data_nascimento?: string
}

export interface VisitaDetalhe extends Visita {
  minutos?: number
}

export interface CheckoutResult {
  visita_id: string
  entrada_em: string
  saida_em: string
  minutos: number
  valor_total: number
  valor_original?: number
  desconto_tipo?: 'percentual' | 'fixo'
  desconto_valor?: number
  motivo_desconto?: string
  ticket_numero?: number
  forma_pagamento?: string
  configuracao?: ConfiguracaoPreco
}

export interface RankingVisita {
  id: string
  crianca_nome: string
  responsavel_nome?: string
  total_visitas: number
  ultima_visita?: string
}

export interface RankingGasto {
  id: string
  crianca_nome: string
  responsavel_nome?: string
  total_gasto: number
  total_visitas: number
  ticket_medio: number
  ultima_visita?: string
}

export interface FechamentoCaixa {
  id: string
  estabelecimento_id: string
  operador_id?: string
  operador_nome?: string
  abertura_em: string
  fechamento_em?: string
  total_entradas: number
  total_valor: number
  status: 'aberto' | 'fechado'
  suprimento_inicial?: number
}

export interface GuardianSearchResult {
  id: string
  nome: string
  cpf?: string
  telefone?: string
  email?: string
  total_criancas: number
}

export interface GuardianWithStats extends GuardianSearchResult {
  total_visitas: number
  total_gasto: number
  ultima_visita?: string
}

export interface CriancaComStatus {
  id: string
  nome: string
  data_nascimento?: string
  cpf?: string
  observacoes?: string
  responsavel_id?: string
  ultima_visita?: string
  total_visitas: number
  total_gasto: number
  visita_ativa: number
}

export interface GroupCheckoutResult {
  resultados: Array<{
    visita_id: string
    crianca_id: string
    entrada_em: string
    saida_em: string
    minutos: number
    valor_total: number
    ticket_numero?: number
    forma_pagamento?: string
  }>
  valor_total_grupo: number
  forma_pagamento?: string
}

export interface SyncStatus {
  pendentes: {
    estabelecimentos: number
    configuracoes_preco: number
    operadores: number
    responsaveis: number
    criancas: number
    visitas: number
    visita_faixas_aplicadas: number
    fechamentos_caixa: number
    logs: number
  }
}

export interface SyncPushResult {
  success: boolean
  pushed: {
    estabelecimentos: number
    operadores: number
    responsaveis: number
    criancas: number
    visitas: number
    visita_faixas_aplicadas: number
    fechamentos_caixa: number
    logs: number
  }
  errors: string[]
}
