'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Headphones, Loader2 } from 'lucide-react'

// Para trocar a imagem do painel esquerdo do cadastro, substitua: /public/cadastro-bg.jpg
const CADASTRO_BG = '/api/assets/cadastro-bg.jpg'
const LOGO = '/api/assets/logo.png'

export default function ClienteCadastroPage() {
  const router = useRouter()
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [filial, setFilial] = useState('')
  const [grupoWhatsapp, setGrupoWhatsapp] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [bgError, setBgError] = useState(false)
  const [logoError, setLogoError] = useState(false)

  function formatCnpj(value: string) {
    return value
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 18)
  }

  function formatTelefone(value: string) {
    return value
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{4})$/, '$1-$2')
      .slice(0, 15)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/cliente/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, telefone, email, password, filial, grupoWhatsapp, cnpj }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao criar conta')
        return
      }

      router.push('/portal/meus-tickets')
      router.refresh()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ─── Painel esquerdo ─── */}
      <div className="hidden lg:flex lg:w-[40%] relative overflow-hidden bg-gray-100">
        {!bgError && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={CADASTRO_BG}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setBgError(true)}
          />
        )}
      </div>

      {/* ─── Painel direito ─── */}
      <div className="flex-1 flex flex-col bg-white overflow-y-auto">

        {/* Logo mobile */}
        <div className="lg:hidden flex items-center gap-2.5 px-8 pt-8">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Headphones className="w-4 h-4 text-white" />
          </div>
          <span className="text-gray-900 font-semibold">DigitalRF Help</span>
        </div>

        {/* Formulário */}
        <div className="flex-1 flex items-center justify-center px-8 py-10">
          <div className="w-full max-w-[560px]">

            {/* Logo */}
            <div className="mb-8">
              {!logoError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={LOGO}
                  alt="Logo"
                  className="max-h-[80px] w-auto mb-5"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Headphones className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-gray-900 font-bold text-lg">DigitalRF Help</span>
                </div>
              )}
              <h2 className="text-2xl font-bold text-gray-900">Criar Conta</h2>
              <p className="text-gray-500 text-sm mt-1">Preencha os dados abaixo para criar sua conta.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Nome + Telefone */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nome" className="text-sm font-medium text-gray-700">Nome</Label>
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Informe seu nome"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    required
                    autoComplete="name"
                    className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="telefone" className="text-sm font-medium text-gray-700">Telefone</Label>
                  <Input
                    id="telefone"
                    type="tel"
                    placeholder="Telefone de contato"
                    value={telefone}
                    onChange={e => setTelefone(formatTelefone(e.target.value))}
                    autoComplete="tel"
                    className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email para login</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Informe seu email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                />
              </div>

              {/* Senha + Confirmação */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Sua senha"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirmação de senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repita a senha"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Filial */}
              <div className="space-y-1.5">
                <Label htmlFor="filial" className="text-sm font-medium text-gray-700">
                  Informe a Filial <span className="text-gray-400 font-normal">(caso tenha)</span>
                </Label>
                <Input
                  id="filial"
                  type="text"
                  placeholder=""
                  value={filial}
                  onChange={e => setFilial(e.target.value)}
                  className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                />
              </div>

              {/* Grupo WhatsApp */}
              <div className="space-y-1.5">
                <Label htmlFor="grupoWhatsapp" className="text-sm font-medium text-gray-700">Nome do Grupo Whatsapp</Label>
                <Input
                  id="grupoWhatsapp"
                  type="text"
                  placeholder=""
                  value={grupoWhatsapp}
                  onChange={e => setGrupoWhatsapp(e.target.value)}
                  className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                />
              </div>

              {/* CNPJ */}
              <div className="space-y-1.5">
                <Label htmlFor="cnpj" className="text-sm font-medium text-gray-700">CNPJ</Label>
                <Input
                  id="cnpj"
                  type="text"
                  placeholder=""
                  value={cnpj}
                  onChange={e => setCnpj(formatCnpj(e.target.value))}
                  className="h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                />
              </div>

              {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando conta...
                  </>
                ) : (
                  'Criar Conta'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm text-gray-500">
              Já possui conta?{' '}
              <a href="/cliente/login" className="text-blue-600 font-medium hover:underline">
                Fazer login
              </a>
            </div>

          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-center gap-4 px-8 pb-6 text-xs text-gray-400">
          <span>Privacidade</span>
          <span>·</span>
          <span>Termos</span>
        </div>

      </div>
    </div>
  )
}
