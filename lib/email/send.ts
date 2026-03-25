import { resend, EMAIL_FROM, EMAIL_REPLY_TO } from "./resend";
import {
  templateAberturaTicket,
  templateNovaResposta,
  templateMudancaStatus,
  templateFechamentoTicket,
  templateTransferenciaTicket,
  templateRecuperacaoSenha,
} from "./templates";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function emailAberturaTicket(dados: {
  emailCliente: string;
  nomeCliente: string;
  ticketId: string;
  numeroTicket: string;
  titulo: string;
  descricao: string;
  prioridade: string;
}) {
  const { subject, html } = templateAberturaTicket({
    nomeCliente: dados.nomeCliente,
    numeroTicket: dados.numeroTicket,
    titulo: dados.titulo,
    descricao: dados.descricao,
    prioridade: dados.prioridade,
    urlTicket: `${BASE_URL}/portal/meus-tickets/${dados.ticketId}`,
  });

  return resend.emails.send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to: dados.emailCliente,
    subject,
    html,
  });
}

export async function emailNovaResposta(dados: {
  emailDestinatario: string;
  nomeDestinatario: string;
  ticketId: string;
  numeroTicket: string;
  titulo: string;
  nomeRemetente: string;
  mensagem: string;
  perfil: string;
}) {
  const urlTicket =
    dados.perfil === "cliente"
      ? `${BASE_URL}/portal/meus-tickets/${dados.ticketId}`
      : `${BASE_URL}/painel/tickets/${dados.ticketId}`;

  const { subject, html } = templateNovaResposta({
    nomeDestinatario: dados.nomeDestinatario,
    numeroTicket: dados.numeroTicket,
    titulo: dados.titulo,
    nomeRemetente: dados.nomeRemetente,
    mensagem: dados.mensagem,
    urlTicket,
  });

  return resend.emails.send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to: dados.emailDestinatario,
    subject,
    html,
  });
}

export async function emailMudancaStatus(dados: {
  emailCliente: string;
  nomeCliente: string;
  ticketId: string;
  numeroTicket: string;
  titulo: string;
  statusAnterior: string;
  statusNovo: string;
  encerra: boolean;
}) {
  if (dados.encerra) {
    const { subject, html } = templateFechamentoTicket({
      nomeCliente: dados.nomeCliente,
      numeroTicket: dados.numeroTicket,
      titulo: dados.titulo,
      urlAvaliacao: `${BASE_URL}/portal/meus-tickets/${dados.ticketId}/avaliar`,
    });
    return resend.emails.send({
      from: EMAIL_FROM,
      replyTo: EMAIL_REPLY_TO,
      to: dados.emailCliente,
      subject,
      html,
    });
  }

  const { subject, html } = templateMudancaStatus({
    nomeCliente: dados.nomeCliente,
    numeroTicket: dados.numeroTicket,
    titulo: dados.titulo,
    statusAnterior: dados.statusAnterior,
    statusNovo: dados.statusNovo,
    urlTicket: `${BASE_URL}/portal/meus-tickets/${dados.ticketId}`,
  });

  return resend.emails.send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to: dados.emailCliente,
    subject,
    html,
  });
}

export async function emailRecuperacaoSenha(dados: {
  emailCliente: string;
  nomeCliente: string;
  urlRedefinir: string;
}) {
  const { subject, html } = templateRecuperacaoSenha({
    nomeCliente: dados.nomeCliente,
    urlRedefinir: dados.urlRedefinir,
  });

  return resend.emails.send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to: dados.emailCliente,
    subject,
    html,
  });
}

export async function emailTransferenciaTicket(dados: {
  emailAtendente: string;
  nomeAtendente: string;
  ticketId: string;
  numeroTicket: string;
  titulo: string;
  prioridade: string;
  transferidoPorNome: string;
}) {
  const { subject, html } = templateTransferenciaTicket({
    nomeAtendente: dados.nomeAtendente,
    numeroTicket: dados.numeroTicket,
    titulo: dados.titulo,
    prioridade: dados.prioridade,
    transferidoPorNome: dados.transferidoPorNome,
    urlTicket: `${BASE_URL}/painel/tickets/${dados.ticketId}`,
  });

  return resend.emails.send({
    from: EMAIL_FROM,
    replyTo: EMAIL_REPLY_TO,
    to: dados.emailAtendente,
    subject,
    html,
  });
}
