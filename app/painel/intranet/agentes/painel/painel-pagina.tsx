"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Bot } from "lucide-react";
import { PainelClient } from "./painel-client";
import s from "./painel-erros.module.css";

interface BaseInfo { id: string; nome: string }

/** Painel de UMA base, em página própria (não mais modal) — com botão de Voltar para a tela principal. */
export function PainelPagina({ base }: { base: BaseInfo }) {
  const router = useRouter();
  const header = (
    <div className={s.top}>
      <div className={s.titulo}>
        <div className={s.icone}><Bot size={22} style={{ color: "var(--nav-active-text, #0E1326)" }} /></div>
        <div>
          <h1 className={s.h1}>Painel de Erros · {base.nome}</h1>
          <p className={s.sub}>Erros pendentes no painel EMSys Gestão desta base</p>
        </div>
      </div>
      <div className={s.acoes}>
        <button type="button" className={s.btn} onClick={() => router.push("/painel/intranet/agentes")}>
          <ArrowLeft size={14} /> Voltar
        </button>
      </div>
    </div>
  );
  return <PainelClient bases={[base]} header={header} />;
}
