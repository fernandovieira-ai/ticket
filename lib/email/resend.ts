import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY não configurada");
}

export const resend = new Resend(process.env.RESEND_API_KEY);

export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "DigitalRF Help <noreply@digitalrf.com.br>";
export const EMAIL_REPLY_TO =
  process.env.EMAIL_REPLY_TO ?? "suporte@digitalrf.com.br";
