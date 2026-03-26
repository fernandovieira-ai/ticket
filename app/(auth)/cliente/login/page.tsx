'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Headphones, Loader2, Mail, Lock } from 'lucide-react'

// Para trocar a imagem do portal do cliente, coloque: /public/login-bg-portal.jpg
// Para trocar a imagem do painel admin, coloque: /public/login-bg.jpg
// Para trocar a logo, substitua: /public/logo.png
const LOGIN_BG = '/api/assets/login-bg-portal.jpg'
const LOGO = '/api/assets/logo.png'

export default function ClienteLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [logoError, setLogoError] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/cliente/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Erro ao fazer login')
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
    <div className="h-screen flex overflow-hidden">

      {/* ─── Painel esquerdo ─── */}
      <div
        className="hidden lg:flex lg:w-[55%] relative flex-col items-center justify-center overflow-hidden"
        style={{ backgroundColor: "#0f1923" }}
      >
        {/* Imagem de fundo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGIN_BG}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain"
        />
        {/* Overlay escuro sobre a imagem */}
        <div className="absolute inset-0 bg-[#0f1923]/70" />
      </div>

      {/* ─── Painel direito ─── */}
      <div className="flex-1 flex flex-col bg-white">

        {/* Logo mobile */}
        <div className="lg:hidden flex items-center gap-2.5 px-8 pt-8">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Headphones className="w-4 h-4 text-white" />
          </div>
          <span className="text-gray-900 font-semibold">DigitalRF Help</span>
        </div>

        {/* Formulário centralizado */}
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          <div className="w-full max-w-[360px]">

            {/* Logo */}
            <div className="mb-8">
              {!logoError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={LOGO}
                  alt="Logo"
                  className="max-h-[100px] w-auto mb-6"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Headphones className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-gray-900 font-bold text-lg">DigitalRF Help</span>
                </div>
              )}
              <h2 className="text-2xl font-bold text-gray-900">Portal do Cliente</h2>
              <p className="text-gray-500 text-sm mt-1">
                Por favor insira seus dados para fazer login.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Digite seu e-mail..."
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="pl-10 h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Digite sua senha..."
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pl-10 h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                  />
                </div>
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
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>

              <a
                href="/cliente/cadastro"
                className="flex items-center justify-center w-full h-11 mt-3 border border-gray-200 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Criar Conta
              </a>
            </form>

            <div className="mt-4 text-center text-sm text-gray-500">
              Esqueceu sua senha?{' '}
              <a href="/cliente/recuperar-senha" className="text-blue-600 font-medium hover:underline">
                Recuperar senha
              </a>
            </div>


          </div>
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-center gap-4 px-8 pb-8 text-xs text-gray-400">
          <span>Privacidade</span>
          <span>·</span>
          <span>Termos</span>
        </div>

      </div>
    </div>
  )
}
