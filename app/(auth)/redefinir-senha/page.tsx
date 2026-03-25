'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Headphones, Loader2, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react'

const LOGIN_BG = '/api/assets/login-bg.jpg'
const LOGO = '/api/assets/logo.png'

function RedefinirSenhaForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [bgError, setBgError] = useState(false)
  const [logoError, setLogoError] = useState(false)

  useEffect(() => {
    if (!token) setError('Link inválido. Solicite um novo link de recuperação.')
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não conferem.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/redefinir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao redefinir senha.')
        return
      }
      setSucesso(true)
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ─── Painel esquerdo ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col items-center justify-center bg-[#0f1923] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!bgError && <img src={LOGIN_BG} alt="" className="absolute inset-0 w-full h-full object-cover" onError={() => setBgError(true)} />}
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
                <img src={LOGO} alt="Logo" className="max-h-[100px] w-auto mb-6" onError={() => setLogoError(true)} />
              ) : (
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Headphones className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-gray-900 font-bold text-lg">DigitalRF Help</span>
                </div>
              )}
              <h2 className="text-2xl font-bold text-gray-900">Nova Senha</h2>
              <p className="text-gray-500 text-sm mt-1">Digite e confirme sua nova senha abaixo.</p>
            </div>

            {sucesso ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="text-gray-700 font-medium">Senha redefinida com sucesso!</p>
                <p className="text-gray-500 text-sm">Agora você pode fazer login com sua nova senha.</p>
                <Button className="mt-2 w-full h-11 bg-blue-600 hover:bg-blue-700" onClick={() => router.push('/login')}>
                  Ir para o login
                </Button>
              </div>
            ) : !token ? (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <AlertCircle className="w-12 h-12 text-red-400" />
                <p className="text-gray-700 font-medium">Link inválido</p>
                <p className="text-gray-500 text-sm">Este link é inválido ou expirou. Solicite um novo link de recuperação.</p>
                <a href="/recuperar-senha" className="text-blue-600 text-sm font-medium hover:underline mt-2">
                  Solicitar novo link
                </a>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-sm font-medium text-gray-700">Nova senha</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Mínimo 6 caracteres"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        className="pr-10 h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirmar nova senha</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Repita a senha"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        required
                        className="pr-10 h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={loading || !token}
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold mt-2"
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
                    ) : (
                      'Salvar nova senha'
                    )}
                  </Button>
                </form>

                <div className="mt-4 text-center text-sm text-gray-500">
                  <a href="/login" className="text-blue-600 font-medium hover:underline">
                    Voltar ao login
                  </a>
                </div>
              </>
            )}

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

export default function RedefinirSenhaOperadorPage() {
  return (
    <Suspense>
      <RedefinirSenhaForm />
    </Suspense>
  )
}
