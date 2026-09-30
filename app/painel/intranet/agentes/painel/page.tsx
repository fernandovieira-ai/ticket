import { redirect } from 'next/navigation';

// O Painel de Erros agora é a tela principal de Agentes
export default function PainelErrosPage() {
  redirect('/painel/intranet/agentes');
}
