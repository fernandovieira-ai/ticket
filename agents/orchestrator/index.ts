import { createHash } from 'node:crypto';
import { analisarErro } from '../analyzer';
import { criarProposta, obterCliente, registrarContextoProposta } from '../core/db';
import { mesclarInvestigacoes } from '../core/investigar';
import type { AnalisarErroInput, ProcessarErroResult } from '../core/types';

export async function processarErro(input: AnalisarErroInput): Promise<ProcessarErroResult> {
  // Carrega cliente se informado, para incluir no contexto e na proposta
  const clientePromise = input.cliente_id
    ? obterCliente(input.cliente_id, input.empresa_id)
    : Promise.resolve(null);

  const [analise, cliente] = await Promise.all([
    analisarErro(input),
    clientePromise,
  ]);

  const proposta = await criarProposta(
    input.empresa_id,
    input.descricao_erro,
    analise,
    cliente ? { id: cliente.id, nome: cliente.nome } : null,
    input.erro_hash,
    input.codigo_painel,
  );

  // Guarda os dados reais coletados na investigação, para o "Refinar" não refazer tudo
  if (input.dados_reais?.trim()) {
    await registrarContextoProposta(proposta.id, input.empresa_id, {
      dados_investigacao: mesclarInvestigacoes(null, input.dados_reais),
    });
  }

  // Toda proposta nasce "aguardando" o operador. A aprovação automática por tipo de correção
  // (agente_config.auto_aprovar_tipos) foi desativada: o que roda sozinho são os tipos de erro que o
  // operador marca ao aplicar uma proposta (ver tentarAutoAplicar em core/autonomia.ts).
  return { proposta, auto_aprovada: false };
}
