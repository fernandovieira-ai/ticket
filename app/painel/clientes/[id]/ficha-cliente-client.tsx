'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ArrowLeft, Pencil, Plus, Star, Loader2 } from 'lucide-react'
import type { Cliente, ContatoCliente } from '@/types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  cliente: Cliente & { contatos: ContatoCliente[] }
}

export function FichaClienteClient({ cliente: clienteInicial }: Props) {
  const router = useRouter()
  const [cliente, setCliente] = useState(clienteInicial)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [dialogContatoOpen, setDialogContatoOpen] = useState(false)
  const [salvandoContato, setSalvandoContato] = useState(false)

  const [form, setForm] = useState({
    nome_razao: cliente.nome_razao,
    documento: cliente.documento ?? '',
    email: cliente.email ?? '',
    telefone: cliente.telefone ?? '',
    segmento: cliente.segmento ?? '',
    observacoes: cliente.observacoes ?? '',
  })

  const [formContato, setFormContato] = useState({
    nome: '',
    cargo: '',
    email: '',
    telefone: '',
    principal: false,
  })

  async function salvarCliente() {
    setSalvando(true)
    try {
      const res = await fetch(`/api/clientes/${cliente.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_razao: form.nome_razao,
          documento: form.documento || null,
          email: form.email || null,
          telefone: form.telefone || null,
          segmento: form.segmento || null,
          observacoes: form.observacoes || null,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setCliente((c) => ({ ...c, ...updated }))
        setEditando(false)
      }
    } finally {
      setSalvando(false)
    }
  }

  async function salvarContato() {
    if (!formContato.nome) return
    setSalvandoContato(true)
    try {
      const res = await fetch(`/api/clientes/${cliente.id}/contatos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formContato),
      })
      if (res.ok) {
        const novo = await res.json()
        setCliente((c) => ({ ...c, contatos: [...c.contatos, novo] }))
        setDialogContatoOpen(false)
        setFormContato({ nome: '', cargo: '', email: '', telefone: '', principal: false })
      }
    } finally {
      setSalvandoContato(false)
    }
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/painel/clientes')}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900">{cliente.nome_razao}</h2>
          <p className="text-gray-500 text-sm">
            Cliente desde {format(new Date(cliente.criado_em), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
        <Badge variant={cliente.ativo ? 'default' : 'secondary'}>
          {cliente.ativo ? 'Ativo' : 'Inativo'}
        </Badge>
        {!editando && (
          <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
            <Pencil size={14} className="mr-1.5" />
            Editar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dados principais */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700">Dados gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {editando ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Nome / Razão Social</Label>
                    <Input
                      value={form.nome_razao}
                      onChange={(e) => setForm((f) => ({ ...f, nome_razao: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>CNPJ / CPF</Label>
                      <Input
                        value={form.documento}
                        onChange={(e) => setForm((f) => ({ ...f, documento: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        Telefone
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#25D366" className="w-3.5 h-3.5">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                      </Label>
                      <Input
                        value={form.telefone}
                        onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>E-mail</Label>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Segmento</Label>
                      <Input
                        value={form.segmento}
                        onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observações</Label>
                    <Textarea
                      value={form.observacoes}
                      onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={salvarCliente} disabled={salvando}>
                      {salvando ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                      Salvar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditando(false)}>
                      Cancelar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {[
                    { label: 'CNPJ / CPF', value: cliente.documento },
                    { label: 'E-mail', value: cliente.email },
                    { label: 'Telefone', value: cliente.telefone },
                    { label: 'Segmento', value: cliente.segmento },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-gray-500 text-xs">{label}</p>
                      <p className="text-gray-900 font-medium">{value ?? '—'}</p>
                    </div>
                  ))}
                  {cliente.observacoes && (
                    <div className="col-span-2">
                      <p className="text-gray-500 text-xs">Observações</p>
                      <p className="text-gray-900">{cliente.observacoes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Contatos */}
        <div>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700">Contatos</CardTitle>
              <button
                onClick={() => setDialogContatoOpen(true)}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
              >
                <Plus size={14} />
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {cliente.contatos.length === 0 ? (
                <p className="text-gray-400 text-xs text-center py-4">Nenhum contato</p>
              ) : (
                cliente.contatos.map((c, i) => (
                  <div key={c.id}>
                    {i > 0 && <Separator className="my-2" />}
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-gray-900">{c.nome}</p>
                          {c.principal && <Star size={11} className="text-amber-400 fill-amber-400" />}
                        </div>
                        {c.cargo && <p className="text-xs text-gray-500">{c.cargo}</p>}
                        {c.email && <p className="text-xs text-blue-600">{c.email}</p>}
                        {c.telefone && <p className="text-xs text-gray-500">{c.telefone}</p>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog novo contato */}
      <Dialog open={dialogContatoOpen} onOpenChange={setDialogContatoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo contato</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={formContato.nome}
                onChange={(e) => setFormContato((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do contato"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Input
                value={formContato.cargo}
                onChange={(e) => setFormContato((f) => ({ ...f, cargo: e.target.value }))}
                placeholder="Ex: Gerente TI"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={formContato.email}
                onChange={(e) => setFormContato((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Telefone
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#25D366" className="w-3.5 h-3.5">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
              </Label>
              <Input
                value={formContato.telefone}
                onChange={(e) => setFormContato((f) => ({ ...f, telefone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogContatoOpen(false)}>Cancelar</Button>
            <Button onClick={salvarContato} disabled={salvandoContato}>
              {salvandoContato ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
