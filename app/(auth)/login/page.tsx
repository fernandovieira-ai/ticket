"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Headphones, Loader2, Mail, Lock } from "lucide-react";

// Para trocar a imagem do painel esquerdo, substitua: /public/login-bg.jpg
// Para trocar a logo, substitua: /public/logo.png
const LOGIN_BG = "/api/assets/login-bg.jpg";
const LOGO = "/api/assets/logo.png";

const LS_EMAIL = "drfh_remember_email";
const LS_PWD = "drfh_remember_pwd";
const LS_FLAG = "drfh_remember";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [connectAuto, setConnectAuto] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [bgError, setBgError] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Carrega credenciais salvas ao montar o componente
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(LS_FLAG);
    if (saved === "1") {
      setRememberMe(true);
      const savedEmail = localStorage.getItem(LS_EMAIL) ?? "";
      const savedPwd = atob(localStorage.getItem(LS_PWD) ?? "");
      setEmail(savedEmail);
      setPassword(savedPwd);
    }
  }, []);

  useEffect(() => {
    async function checkSession() {
      let res = await fetch("/api/auth/me");
      if (res.status === 401) {
        // Tenta renovar via refresh token
        const refreshRes = await fetch("/api/auth/refresh", { method: "POST" });
        if (refreshRes.ok) res = await fetch("/api/auth/me");
      }
      if (res.ok) router.replace("/painel/dashboard");
    }
    checkSession();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, connectAuto }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Erro ao fazer login");
        return;
      }

      // Persiste ou limpa credenciais conforme a flag
      if (rememberMe) {
        localStorage.setItem(LS_FLAG, "1");
        localStorage.setItem(LS_EMAIL, email);
        localStorage.setItem(LS_PWD, btoa(password));
      } else {
        localStorage.removeItem(LS_FLAG);
        localStorage.removeItem(LS_EMAIL);
        localStorage.removeItem(LS_PWD);
      }

      router.push("/painel/dashboard");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ─── Painel esquerdo ─── */}
      <div className="hidden lg:flex lg:w-[55%] relative flex-col items-center justify-center bg-[#0f1923] overflow-hidden">
        {/* Imagem de fundo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!bgError && (
          <img
            src={LOGIN_BG}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setBgError(true)}
          />
        )}

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
                  <span className="text-gray-900 font-bold text-lg">
                    DigitalRF Help
                  </span>
                </div>
              )}
              <h2 className="text-2xl font-bold text-gray-900">Bem-vindo</h2>
              <p className="text-gray-500 text-sm mt-1">
                Por favor insira seus dados para fazer login.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-gray-700"
                >
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="Digite seu e-mail..."
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="pl-10 h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="password"
                  className="text-sm font-medium text-gray-700"
                >
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Digite sua senha..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pl-10 h-11 border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
                />
                <span className="text-sm text-gray-500">Lembrar acesso</span>
              </label>

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
                  "Entrar"
                )}
              </Button>

              <label className="flex items-center gap-2 cursor-pointer select-none mt-3">
                <input
                  type="checkbox"
                  checked={connectAuto}
                  onChange={(e) => setConnectAuto(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
                />
                <span className="text-sm text-gray-500">
                  Conectar automaticamente
                </span>
              </label>

              <div className="text-center mt-1">
                <a
                  href="/recuperar-senha"
                  className="text-blue-600 text-sm font-medium hover:underline"
                >
                  Esqueceu sua senha?
                </a>
              </div>
            </form>
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
  );
}
