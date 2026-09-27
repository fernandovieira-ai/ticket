// Criptografia simétrica (AES-256-GCM) para segredos armazenados no banco — hoje usada
// só para db_senha em agente_clientes/agente_clientes_bases (credenciais de conexão com
// os bancos dos clientes). Nunca gravar essas senhas em texto plano.
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITMO = 'aes-256-gcm';
const IV_BYTES = 12; // tamanho recomendado de IV para GCM

// Prefixo do valor gravado: permite (1) distinguir de senhas antigas em texto plano
// gravadas antes desta criptografia existir — nunca tiveram esse prefixo — e (2)
// versionar o esquema no futuro (ex: "enc:v2:") sem quebrar dados já gravados com v1.
const PREFIXO = 'enc:v1:';

function obterChave(): Buffer {
  const hex = process.env.AGENTE_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'AGENTE_ENCRYPTION_KEY não configurada — necessária para criptografar/descriptografar ' +
      'senhas de banco dos clientes do Agentes IA.',
    );
  }
  const chave = Buffer.from(hex, 'hex');
  if (chave.length !== 32) {
    throw new Error('AGENTE_ENCRYPTION_KEY deve ser uma string hexadecimal de 64 caracteres (32 bytes).');
  }
  return chave;
}

export function estaCriptografado(valor: string): boolean {
  return valor.startsWith(PREFIXO);
}

export function criptografar(textoPlano: string): string {
  const chave = obterChave();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, chave, iv);
  const ciphertext = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIXO}${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Descriptografa um valor gravado por criptografar(). Se o valor não tiver o prefixo
 * esperado, assume que é uma senha antiga (gravada antes desta criptografia existir) e
 * devolve como está — evita quebrar clientes cadastrados antes da migração. Rodar o
 * script de migração para criptografar o que ainda estiver em texto plano.
 */
export function descriptografar(valor: string): string {
  if (!estaCriptografado(valor)) return valor;

  const chave = obterChave();
  const partes = valor.slice(PREFIXO.length).split(':');
  if (partes.length !== 3) {
    throw new Error('Formato de valor criptografado inválido.');
  }
  const [ivHex, tagHex, ciphertextHex] = partes;

  const decipher = createDecipheriv(ALGORITMO, chave, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const textoPlano = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return textoPlano.toString('utf8');
}
