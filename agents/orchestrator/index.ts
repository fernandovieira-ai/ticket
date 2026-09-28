import { createHash } from 'node:crypto';
import { analisarErro } from '../analyzer';
import { criarProposta, obterConfig, obterCliente, atualizarStatusProposta, registrarContextoProposta } from '../core/db';
import { mesclarInvestigacoes } from '../core/investigar';
import type { AnalisarErroInput, ProcessarErroResult } from '../core/types';

export async function processarErro(input: AnalisarErroInput): Promise<ProcessarErroResult> {
  // Carrega cliente se informado, para incluir no contexto e na proposta
  const clientePromise = input.cliente_id
    ? obterCliente(input.cliente_id, input.empresa_id)
    : Promise.resolve(null);

  const [analise, config, cliente] = await Promise.all([
    analisarErro(input),
    obterConfig(input.empresa_id),
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

  // Auto-aprova se configurado para este tipo E risco nao for critico
  const deveAutoAprovar =
    config?.ativo === true &&
    analise.nivel_risco !== 'critico' &&
    config.auto_aprovar_tipos.includes(analise.tipo);

  if (deveAutoAprovar) {
    const propostaAprovada = await atualizarStatusProposta(
      proposta.id,
      input.empresa_id,
      'aprovada',
    );
    return { proposta: propostaAprovada ?? proposta, auto_aprovada: true };
  }

  return { proposta, auto_aprovada: false };
}
