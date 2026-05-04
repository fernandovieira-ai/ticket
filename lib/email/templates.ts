export function emailBase(content: string, titulo: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1a3c34;padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:bold;">DigitalRF Help</span>
            <span style="color:#7fc9a8;font-size:14px;margin-left:8px;">Central de Atendimento</span>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:32px;">
            ${content}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:20px 32px;border-top:1px solid #eeeeee;">
            <p style="margin:0;font-size:12px;color:#999999;text-align:center;">
              Este é um email automático do sistema DigitalRF Help.<br/>
              Não responda diretamente a este email. Use o portal para interagir com seu chamado.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `.trim();
}

export function templateAberturaTicket(dados: {
  nomeCliente: string;
  numeroTicket: string;
  titulo: string;
  descricao: string;
  prioridade: string;
  urlTicket: string;
}): { subject: string; html: string } {
  const content = `
    <h2 style="margin:0 0 8px;color:#1a3c34;font-size:22px;">Chamado aberto com sucesso!</h2>
    <p style="margin:0 0 24px;color:#666666;">Olá, <strong>${dados.nomeCliente}</strong>. Seu chamado foi registrado e nossa equipe irá analisá-lo em breve.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f4;border-radius:6px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Número do Chamado</p>
          <p style="margin:0 0 16px;font-size:24px;font-weight:bold;color:#1a3c34;">#${dados.numeroTicket}</p>

          <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Assunto</p>
          <p style="margin:0 0 16px;font-size:15px;color:#333333;">${dados.titulo}</p>

          <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Prioridade</p>
          <p style="margin:0;font-size:14px;color:#333333;">${dados.prioridade}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:13px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Descrição</p>
    <p style="margin:0 0 24px;font-size:15px;color:#333333;line-height:1.6;padding:16px;background:#fafafa;border-left:3px solid #1a3c34;border-radius:0 4px 4px 0;">${dados.descricao}</p>

    <a href="${dados.urlTicket}" style="display:inline-block;background:#1a3c34;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;">
      Acompanhar Chamado
    </a>
  `;

  return {
    subject: `[#${dados.numeroTicket}] ${dados.titulo} — Chamado aberto`,
    html: emailBase(content, `Chamado #${dados.numeroTicket}`),
  };
}

export function templateNovaResposta(dados: {
  nomeDestinatario: string;
  numeroTicket: string;
  titulo: string;
  nomeRemetente: string;
  mensagem: string;
  urlTicket: string;
}): { subject: string; html: string } {
  const content = `
    <h2 style="margin:0 0 8px;color:#1a3c34;font-size:20px;">Nova resposta no chamado #${dados.numeroTicket}</h2>
    <p style="margin:0 0 24px;color:#666666;">Olá, <strong>${dados.nomeDestinatario}</strong>. <strong>${dados.nomeRemetente}</strong> respondeu ao seu chamado.</p>

    <p style="margin:0 0 8px;font-size:13px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Assunto</p>
    <p style="margin:0 0 20px;font-size:15px;color:#333333;font-weight:bold;">${dados.titulo}</p>

    <p style="margin:0 0 8px;font-size:13px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Mensagem</p>
    <div style="margin:0 0 24px;font-size:15px;color:#333333;line-height:1.6;padding:16px;background:#fafafa;border-left:3px solid #1a3c34;border-radius:0 4px 4px 0;">
      ${dados.mensagem}
    </div>

    <a href="${dados.urlTicket}" style="display:inline-block;background:#1a3c34;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;">
      Ver Resposta Completa
    </a>
  `;

  return {
    subject: `[#${dados.numeroTicket}] Nova resposta — ${dados.titulo}`,
    html: emailBase(content, `Resposta no Chamado #${dados.numeroTicket}`),
  };
}

export function templateMudancaStatus(dados: {
  nomeCliente: string;
  numeroTicket: string;
  titulo: string;
  statusAnterior: string;
  statusNovo: string;
  urlTicket: string;
}): { subject: string; html: string } {
  const coresStatus: Record<string, string> = {
    Aberto: "#2563eb",
    "Em andamento": "#d97706",
    "Aguardando cliente": "#7c3aed",
    Resolvido: "#16a34a",
    Fechado: "#6b7280",
  };

  const cor = coresStatus[dados.statusNovo] ?? "#1a3c34";

  const content = `
    <h2 style="margin:0 0 8px;color:#1a3c34;font-size:20px;">Status do chamado atualizado</h2>
    <p style="margin:0 0 24px;color:#666666;">Olá, <strong>${dados.nomeCliente}</strong>. O status do seu chamado foi atualizado.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f4;border-radius:6px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Chamado</p>
          <p style="margin:0 0 16px;font-size:16px;font-weight:bold;color:#1a3c34;">#${dados.numeroTicket} — ${dados.titulo}</p>

          <p style="margin:0 0 8px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Novo Status</p>
          <span style="display:inline-block;background:${cor};color:#ffffff;padding:6px 16px;border-radius:20px;font-size:14px;font-weight:bold;">
            ${dados.statusNovo}
          </span>
        </td>
      </tr>
    </table>

    <a href="${dados.urlTicket}" style="display:inline-block;background:#1a3c34;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;">
      Ver Chamado
    </a>
  `;

  return {
    subject: `[#${dados.numeroTicket}] Status atualizado: ${dados.statusNovo}`,
    html: emailBase(
      content,
      `Chamado #${dados.numeroTicket} — ${dados.statusNovo}`,
    ),
  };
}

export function templateFechamentoTicket(dados: {
  nomeCliente: string;
  numeroTicket: string;
  titulo: string;
  urlAvaliacao: string;
}): { subject: string; html: string } {
  const content = `
    <h2 style="margin:0 0 8px;color:#1a3c34;font-size:20px;">Chamado encerrado</h2>
    <p style="margin:0 0 24px;color:#666666;">Olá, <strong>${dados.nomeCliente}</strong>. Seu chamado foi encerrado. Esperamos ter ajudado!</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f4;border-radius:6px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Chamado encerrado</p>
          <p style="margin:0;font-size:16px;font-weight:bold;color:#1a3c34;">#${dados.numeroTicket} — ${dados.titulo}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px;color:#333333;">Sua opinião é muito importante para nós. Avalie o atendimento:</p>

    <a href="${dados.urlAvaliacao}" style="display:inline-block;background:#1a3c34;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;">
      Avaliar Atendimento
    </a>
  `;

  return {
    subject: `[#${dados.numeroTicket}] Chamado encerrado — ${dados.titulo}`,
    html: emailBase(content, `Chamado #${dados.numeroTicket} encerrado`),
  };
}

export function templateRecuperacaoSenha(dados: {
  nomeCliente: string;
  urlRedefinir: string;
}): { subject: string; html: string } {
  const content = `
    <h2 style="margin:0 0 8px;color:#1a3c34;font-size:20px;">Recuperação de senha</h2>
    <p style="margin:0 0 24px;color:#666666;">Olá, <strong>${dados.nomeCliente}</strong>. Recebemos uma solicitação para redefinir a senha da sua conta.</p>

    <p style="margin:0 0 16px;color:#333333;">Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>1 hora</strong>.</p>

    <a href="${dados.urlRedefinir}" style="display:inline-block;background:#1a3c34;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;">
      Redefinir Senha
    </a>

    <p style="margin:24px 0 0;font-size:13px;color:#999999;">Se você não solicitou a recuperação de senha, ignore este e-mail. Sua senha não será alterada.</p>
  `;

  return {
    subject: 'Recuperação de senha — DigitalRF Help',
    html: emailBase(content, 'Recuperação de Senha'),
  };
}

export function templateTransferenciaTicket(dados: {
  nomeAtendente: string;
  numeroTicket: string;
  titulo: string;
  prioridade: string;
  transferidoPorNome: string;
  urlTicket: string;
}): { subject: string; html: string } {
  const content = `
    <h2 style="margin:0 0 8px;color:#1a3c34;font-size:20px;">Chamado atribuído a você</h2>
    <p style="margin:0 0 24px;color:#666666;">Olá, <strong>${dados.nomeAtendente}</strong>. O chamado abaixo foi atribuído a você por <strong>${dados.transferidoPorNome}</strong>.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f4;border-radius:6px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Número do Chamado</p>
          <p style="margin:0 0 16px;font-size:24px;font-weight:bold;color:#1a3c34;">#${dados.numeroTicket}</p>

          <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Assunto</p>
          <p style="margin:0 0 16px;font-size:15px;color:#333333;">${dados.titulo}</p>

          <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:1px;">Prioridade</p>
          <p style="margin:0;font-size:14px;color:#333333;">${dados.prioridade}</p>
        </td>
      </tr>
    </table>

    <a href="${dados.urlTicket}" style="display:inline-block;background:#1a3c34;color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:bold;">
      Abrir Chamado
    </a>
  `;

  return {
    subject: `[#${dados.numeroTicket}] Chamado atribuído: ${dados.titulo}`,
    html: emailBase(content, `Chamado #${dados.numeroTicket} — Atribuído`),
  };
}
