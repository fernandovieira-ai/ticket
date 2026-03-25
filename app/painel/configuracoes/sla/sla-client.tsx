'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Clock, Loader2, ChevronRight, X, AlertTriangle, Timer } from 'lucide-react'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Prioridade {
  id: string
  codigo: string
  nome: string
  cor: string
  icone: string | null
  ordem: number
  sistema: boolean
  ativo: boolean
  sla_primeira_resposta_min: number
  sla_resolucao_min: number
  sla_alerta_pct: number
}

interface HorarioComercial {
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  ativo: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

function minToDisplay(min: number): string {
  if (!min || min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

function minToHM(min: number): { h: number; m: number } {
  return { h: Math.floor(min / 60), m: Math.round(min % 60) }
}

function hmToMin(h: number, m: number): number {
  return h * 60 + m
}

const HORARIO_PADRAO: HorarioComercial[] = Array.from({ length: 7 }, (_, i) => ({
  dia_semana: i,
  hora_inicio: '08:00',
  hora_fim: '18:00',
  ativo: i >= 1 && i <= 5,
}))

type Aba = 'prioridades' | 'horario'

// ─── Component ────────────────────────────────────────────────────────────────

export function SlaClient() {
  const [aba, setAba] = useState<Aba>('prioridades')

  // Prioridades
  const [prioridades, setPrioridades] = useState<Prioridade[]>([])
  const [loadingPrio, setLoadingPrio] = useState(true)
  const [selecionado, setSelecionado] = useState<Prioridade | null>(null)
  const [painelAberto, setPainelAberto] = useState(false)
  const [salvandoPrio, setSalvandoPrio] = useState(false)
  const [erroPrio, setErroPrio] = useState('')
  const [formPrio, setFormPrio] = useState({
    hrPrimResp: 0,
    minPrimResp: 0,
    hrResolucao: 0,
    minResolucao: 0,
    alertaPct: 80,
  })

  // Horário comercial
  const [horarios, setHorarios] = useState<HorarioComercial[]>(HORARIO_PADRAO)
  const [loadingHorario, setLoadingHorario] = useState(true)
  const [salvandoHorario, setSalvandoHorario] = useState(false)

  // ─── Load data ──────────────────────────────────────────────────────────────

  const carregarPrioridades = useCallback(async () => {
    setLoadingPrio(true)
    try {
      const res = await fetch('/api/sla/prioridades')
      const data = await res.json()
      setPrioridades(Array.isArray(data) ? data : [])
    } finally {
      setLoadingPrio(false)
    }
  }, [])

  const carregarHorario = useCallback(async () => {
    setLoadingHorario(true)
    try {
      const res = await fetch('/api/sla/horario-comercial')
      const data: HorarioComercial[] = await res.json()
      // Merge with defaults for any missing day
      const merged = Array.from({ length: 7 }, (_, i) => {
        const found = data.find((d) => d.dia_semana === i)
        return found ?? { dia_semana: i, hora_inicio: '08:00', hora_fim: '18:00', ativo: i >= 1 && i <= 5 }
      })
      setHorarios(merged)
    } finally {
      setLoadingHorario(false)
    }
  }, [])

  useEffect(() => {
    carregarPrioridades()
    carregarHorario()
  }, [carregarPrioridades, carregarHorario])

  // ─── Prioridades handlers ────────────────────────────────────────────────────

  function abrirPrioridade(p: Prioridade) {
    setSelecionado(p)
    const pr = minToHM(p.sla_primeira_resposta_min)
    const re = minToHM(p.sla_resolucao_min)
    setFormPrio({
      hrPrimResp: pr.h,
      minPrimResp: pr.m,
      hrResolucao: re.h,
      minResolucao: re.m,
      alertaPct: p.sla_alerta_pct,
    })
    setErroPrio('')
    setPainelAberto(true)
  }

  async function salvarPrioridade() {
    if (!selecionado) return
    const primMin = hmToMin(formPrio.hrPrimResp, formPrio.minPrimResp)
    const resolMin = hmToMin(formPrio.hrResolucao, formPrio.minResolucao)

    if (primMin <= 0) { setErroPrio('Prazo de primeira resposta deve ser maior que zero'); return }
    if (resolMin <= 0) { setErroPrio('Prazo de resolução deve ser maior que zero'); return }
    if (formPrio.alertaPct < 50 || formPrio.alertaPct > 100) { setErroPrio('Alerta deve ser entre 50 e 100'); return }

    setSalvandoPrio(true)
    setErroPrio('')
    try {
      const res = await fetch(`/api/sla/prioridades/${selecionado.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sla_primeira_resposta_min: primMin,
          sla_resolucao_min: resolMin,
          sla_alerta_pct: formPrio.alertaPct,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErroPrio(data.error ?? 'Erro ao salvar'); return }
      toast.success('SLA da prioridade atualizado com sucesso!')
      await carregarPrioridades()
      setSelecionado((prev) => prev ? { ...prev, sla_primeira_resposta_min: primMin, sla_resolucao_min: resolMin, sla_alerta_pct: formPrio.alertaPct } : null)
    } finally {
      setSalvandoPrio(false)
    }
  }

  // ─── Horário handlers ────────────────────────────────────────────────────────

  function toggleDia(dia: number) {
    setHorarios((h) => h.map((d) => (d.dia_semana === dia ? { ...d, ativo: !d.ativo } : d)))
  }

  function updateHorario(dia: number, field: 'hora_inicio' | 'hora_fim', value: string) {
    setHorarios((h) => h.map((d) => (d.dia_semana === dia ? { ...d, [field]: value } : d)))
  }

  async function salvarHorario() {
    setSalvandoHorario(true)
    try {
      const res = await fetch('/api/sla/horario-comercial', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(horarios),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Erro ao salvar horário')
        return
      }
      toast.success('Horário comercial salvo com sucesso!')
    } finally {
      setSalvandoHorario(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const primResp = hmToMin(formPrio.hrPrimResp, formPrio.minPrimResp)
  const resolMin = hmToMin(formPrio.hrResolucao, formPrio.minResolucao)

  return (
    <div className="flex flex-col h-full -mx-6 -mb-6">
      {/* Abas */}
      <div className="flex border-b border-gray-200 bg-white px-6 flex-shrink-0">
        <button
          onClick={() => setAba('prioridades')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            aba === 'prioridades'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Prioridades
        </button>
        <button
          onClick={() => setAba('horario')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            aba === 'horario'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Horário Comercial
        </button>
      </div>

      {/* ── Aba: Prioridades ──────────────────────────────────────────────────── */}
      {aba === 'prioridades' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Lista */}
          <div
            className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-300 ${
              painelAberto ? 'w-72 min-w-[288px]' : 'flex-1'
            }`}
          >
            <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">
                Clique em uma prioridade para configurar seus prazos de SLA.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingPrio ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50">
                    <div className="w-3 h-3 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-gray-100 rounded animate-pulse w-1/3" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                    </div>
                  </div>
                ))
              ) : prioridades.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Timer size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-xs">Nenhuma prioridade encontrada</p>
                </div>
              ) : (
                prioridades.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => abrirPrioridade(p)}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 text-left border-b border-gray-50 transition-colors group ${
                      selecionado?.id === p.id && painelAberto
                        ? 'bg-blue-50 border-r-2 border-r-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
                      style={{ backgroundColor: p.cor }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-semibold ${
                          selecionado?.id === p.id && painelAberto ? 'text-blue-700' : 'text-gray-900'
                        }`}
                      >
                        {p.nome}
                      </p>
                      <div className="flex gap-3 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-gray-400">
                          1ª resp:{' '}
                          <span className="font-medium text-gray-600">
                            {minToDisplay(p.sla_primeira_resposta_min)}
                          </span>
                        </span>
                        <span className="text-[10px] text-gray-400">
                          Resolução:{' '}
                          <span className="font-medium text-gray-600">
                            {minToDisplay(p.sla_resolucao_min)}
                          </span>
                        </span>
                        <span className="text-[10px] text-gray-400">
                          Alerta:{' '}
                          <span className="font-medium text-gray-600">{p.sla_alerta_pct}%</span>
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Painel de edição */}
          <div
            className={`flex flex-col bg-gray-50 transition-all duration-300 overflow-hidden ${
              painelAberto ? 'flex-1' : 'w-0'
            }`}
          >
            {painelAberto && selecionado && (
              <>
                {/* Cabeçalho */}
                <div className="flex items-start justify-between px-6 py-5 bg-white border-b border-gray-100">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div
                        className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm"
                        style={{ backgroundColor: selecionado.cor }}
                      />
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                        EDITANDO SLA
                      </p>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900 leading-tight">
                      {selecionado.nome}
                    </h2>
                  </div>
                  <button
                    onClick={() => { setPainelAberto(false); setSelecionado(null) }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 mt-0.5"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Campos */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
                  {/* Primeira resposta */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Clock size={12} />
                      Prazo de Primeira Resposta
                    </Label>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Input
                          type="number"
                          min={0}
                          value={formPrio.hrPrimResp}
                          onChange={(e) =>
                            setFormPrio((f) => ({ ...f, hrPrimResp: Math.max(0, Number(e.target.value)) }))
                          }
                          className="h-9 bg-white text-center"
                        />
                        <p className="text-[10px] text-gray-400 text-center">horas</p>
                      </div>
                      <span className="text-gray-400 font-bold mb-5">:</span>
                      <div className="flex-1 space-y-1">
                        <Input
                          type="number"
                          min={0}
                          max={59}
                          value={formPrio.minPrimResp}
                          onChange={(e) =>
                            setFormPrio((f) => ({
                              ...f,
                              minPrimResp: Math.min(59, Math.max(0, Number(e.target.value))),
                            }))
                          }
                          className="h-9 bg-white text-center"
                        />
                        <p className="text-[10px] text-gray-400 text-center">minutos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                      <Clock size={11} className="text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-500">
                        Total:{' '}
                        <span className="font-semibold text-gray-700">{minToDisplay(primResp)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Resolução */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Clock size={12} />
                      Prazo de Resolução
                    </Label>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1 space-y-1">
                        <Input
                          type="number"
                          min={0}
                          value={formPrio.hrResolucao}
                          onChange={(e) =>
                            setFormPrio((f) => ({ ...f, hrResolucao: Math.max(0, Number(e.target.value)) }))
                          }
                          className="h-9 bg-white text-center"
                        />
                        <p className="text-[10px] text-gray-400 text-center">horas</p>
                      </div>
                      <span className="text-gray-400 font-bold mb-5">:</span>
                      <div className="flex-1 space-y-1">
                        <Input
                          type="number"
                          min={0}
                          max={59}
                          value={formPrio.minResolucao}
                          onChange={(e) =>
                            setFormPrio((f) => ({
                              ...f,
                              minResolucao: Math.min(59, Math.max(0, Number(e.target.value))),
                            }))
                          }
                          className="h-9 bg-white text-center"
                        />
                        <p className="text-[10px] text-gray-400 text-center">minutos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                      <Clock size={11} className="text-gray-400 flex-shrink-0" />
                      <p className="text-xs text-gray-500">
                        Total:{' '}
                        <span className="font-semibold text-gray-700">{minToDisplay(resolMin)}</span>
                      </p>
                    </div>
                  </div>

                  {/* Alerta */}
                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      Percentual de Alerta
                    </Label>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min={50}
                        max={100}
                        value={formPrio.alertaPct}
                        onChange={(e) =>
                          setFormPrio((f) => ({
                            ...f,
                            alertaPct: Math.min(100, Math.max(50, Number(e.target.value))),
                          }))
                        }
                        className="h-9 bg-white w-24 text-center"
                      />
                      <span className="text-sm text-gray-600 font-semibold">%</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug">
                      Alerta é disparado quando{' '}
                      <span className="font-semibold text-gray-600">{formPrio.alertaPct}%</span> do
                      prazo for consumido.
                    </p>
                  </div>

                  {erroPrio && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {erroPrio}
                    </p>
                  )}
                </div>

                {/* Rodapé */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 bg-white border-t border-gray-100">
                  <Button
                    variant="outline"
                    onClick={() => { setPainelAberto(false); setSelecionado(null) }}
                    className="h-9"
                  >
                    Cancelar
                  </Button>
                  <Button onClick={salvarPrioridade} disabled={salvandoPrio} className="h-9 min-w-[90px]">
                    {salvandoPrio && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    Salvar
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Aba: Horário Comercial ────────────────────────────────────────────── */}
      {aba === 'horario' && (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-lg mx-auto px-6 py-6">
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-800">Horário de funcionamento</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                O SLA é calculado apenas dentro do horário comercial configurado.
              </p>
            </div>

            {loadingHorario ? (
              <div className="space-y-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[160px_1fr_1fr_52px] gap-3 items-center px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50">
                    <div className="h-3.5 bg-gray-200 rounded animate-pulse w-24" />
                    <div className="h-7 bg-gray-200 rounded animate-pulse" />
                    <div className="h-7 bg-gray-200 rounded animate-pulse" />
                    <div className="h-5 w-9 bg-gray-200 rounded-full animate-pulse mx-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Cabeçalho da grade */}
                <div className="grid grid-cols-[160px_1fr_1fr_52px] gap-3 px-3 pb-1">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Dia</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Início</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Fim</span>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-center">Ativo</span>
                </div>

                {horarios.map((h) => (
                  <div
                    key={h.dia_semana}
                    className={`grid grid-cols-[160px_1fr_1fr_52px] gap-3 items-center px-3 py-2.5 rounded-xl border transition-all ${
                      h.ativo
                        ? 'bg-white border-gray-200'
                        : 'bg-gray-50 border-gray-100 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
                          h.ativo ? 'bg-green-400' : 'bg-gray-300'
                        }`}
                      />
                      <span className="text-sm font-medium text-gray-700">{DIAS[h.dia_semana]}</span>
                    </div>
                    <Input
                      type="time"
                      value={h.hora_inicio}
                      onChange={(e) => updateHorario(h.dia_semana, 'hora_inicio', e.target.value)}
                      disabled={!h.ativo}
                      className="h-8 text-sm disabled:opacity-40"
                    />
                    <Input
                      type="time"
                      value={h.hora_fim}
                      onChange={(e) => updateHorario(h.dia_semana, 'hora_fim', e.target.value)}
                      disabled={!h.ativo}
                      className="h-8 text-sm disabled:opacity-40"
                    />
                    {/* Toggle */}
                    <div className="flex justify-center">
                      <button
                        onClick={() => toggleDia(h.dia_semana)}
                        className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                          h.ativo ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                        aria-label={h.ativo ? 'Desativar dia' : 'Ativar dia'}
                      >
                        <div
                          className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-transform ${
                            h.ativo ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end pt-4 border-t border-gray-100 mt-4">
                  <Button onClick={salvarHorario} disabled={salvandoHorario} className="h-9">
                    {salvandoHorario && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                    Salvar horário
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
