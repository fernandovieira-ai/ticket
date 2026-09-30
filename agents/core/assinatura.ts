// Assinatura de um erro: a descrição com os valores específicos (números, datas, UUIDs, textos
// entre aspas) trocados por marcadores. Dois erros da mesma "família" — ex: "código IBGE 4217204
// não encontrado" e "código IBGE 3550308 não encontrado" — geram a MESMA assinatura, enquanto
// o hash da descrição literal (hashErro) difere. É a chave da confiança e dos casos análogos.
import { createHash } from 'node:crypto';

// pattern em agente_regras guarda descricao.slice(0, 500); normalizar sempre sobre o mesmo recorte
// garante que a assinatura calculada da descrição completa e a da regra salva sejam iguais.
const MAX_CHARS = 500;

export function normalizarErro(descricao: string): string {
  return descricao
    .slice(0, MAX_CHARS)
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}(?:[ t]\d{1,2}:\d{2}(?::\d{2})?)?/g, '<data>')
    .replace(/'[^']*'|"[^"]*"/g, '<txt>')
    .replace(/\d+(?:[.,]\d+)*/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function assinaturaErro(descricao: string): { hash: string; normalizada: string } {
  const normalizada = normalizarErro(descricao);
  return { hash: createHash('sha256').update(normalizada).digest('hex').slice(0, 32), normalizada };
}

/** Hash da descrição LITERAL do erro (ocorrência exata) — chave das regras e das propostas. */
export function hashErro(descricao: string): string {
  return createHash('sha256').update(descricao.trim().toLowerCase()).digest('hex').slice(0, 32);
}
