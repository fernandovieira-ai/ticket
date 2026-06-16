import { query } from './db-unified';

export interface MonitoradorData {
  nomeRede: string;
  empresas: Array<{
    machine_uuid: string;
    machine_id: string;
    machine_ip: string;
    nome_rede: string;
    cnpj: string;
    razao_social: string;
    nome_fantasia: string;
    situacao_cadastral: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    municipio: string;
    uf: string;
    cep: string;
    configurado_em: string;
    atualizado_em: string;
    heartbeat?: {
      machine_uuid: string;
      machine_id: string;
      machine_ip: string;
      ultimo_contato: string;
      cpu_percent: number;
      mem_percent: number;
      total_processos: number;
      proc_rodando: number;
      proc_parado: number;
      status: string;
    };
    processos: Array<{
      id: number;
      machine_uuid: string;
      machine_id: string;
      process_local_id: string;
      process_name: string;
      process_label: string;
      watch_type: string;
      auto_restart: boolean;
      log_enabled: boolean;
      log_path: string | null;
      log_timeout_min: number;
      ativo: boolean;
      configurado_em: string;
      atualizado_em: string;
    }>;
  }>;
}

/**
 * Busca dados do monitorador de forma otimizada
 * - Executa queries em paralelo
 * - Processa dados em memória eficientemente
 * - Retorna estrutura hierárquica: Rede > Empresa > Processos
 */
export async function getMonitoradorData(): Promise<MonitoradorData[]> {
  // Executa todas as queries em paralelo para reduzir latência
  const [redesResult, heartbeatResult, processosResult] = await Promise.all([
    // Query 1: Dados das redes/empresas
    query(`
      SELECT
        machine_uuid,
        machine_id,
        machine_ip,
        nome_rede,
        cnpj,
        razao_social,
        nome_fantasia,
        situacao_cadastral,
        logradouro,
        numero,
        complemento,
        bairro,
        municipio,
        uf,
        cep,
        configurado_em,
        atualizado_em
      FROM drf_monitor_rede
      ORDER BY nome_rede, cnpj
    `),

    // Query 2: Heartbeat com detecção automática de perda de comunicação
    query(`
      SELECT
        machine_uuid,
        machine_id,
        machine_ip,
        ultimo_contato,
        cpu_percent,
        mem_percent,
        total_processos,
        proc_rodando,
        proc_parado,
        CASE
          WHEN ultimo_contato < NOW() - INTERVAL '3 minutes' THEN 'sem_sinal'
          ELSE status
        END AS status
      FROM drf_monitor_heartbeat
    `),

    // Query 3: Todos os processos (ativos e inativos)
    query(`
      SELECT
        id,
        machine_uuid,
        machine_id,
        process_local_id,
        process_name,
        process_label,
        watch_type,
        auto_restart,
        log_enabled,
        log_path,
        log_timeout_min,
        ativo,
        configurado_em,
        atualizado_em
      FROM drf_monitor_processos
      ORDER BY ativo DESC, process_label
    `),
  ]);

  // Indexa heartbeats por machine_uuid usando Map (O(1) lookup)
  const heartbeatsMap = new Map(
    heartbeatResult.rows.map((h: any) => [
      h.machine_uuid,
      {
        machine_uuid: h.machine_uuid,
        machine_id: h.machine_id,
        machine_ip: h.machine_ip,
        ultimo_contato: h.ultimo_contato,
        cpu_percent: Number(h.cpu_percent || 0),
        mem_percent: Number(h.mem_percent || 0),
        total_processos: Number(h.total_processos || 0),
        proc_rodando: Number(h.proc_rodando || 0),
        proc_parado: Number(h.proc_parado || 0),
        status: h.status,
      },
    ])
  );

  // Agrupa processos por machine_uuid usando Map (O(n))
  const processosPorMachine = new Map<string, any[]>();
  processosResult.rows.forEach((proc: any) => {
    const existing = processosPorMachine.get(proc.machine_uuid);
    if (existing) {
      existing.push(proc);
    } else {
      processosPorMachine.set(proc.machine_uuid, [proc]);
    }
  });

  // Agrupa empresas por nome_rede
  const redesMap = new Map<string, any[]>();
  redesResult.rows.forEach((rede: any) => {
    const nomeRede = rede.nome_rede || 'Sem Rede';
    const heartbeat = heartbeatsMap.get(rede.machine_uuid);
    const processos = processosPorMachine.get(rede.machine_uuid) || [];

    const empresa = {
      ...rede,
      heartbeat,
      processos,
    };

    const existing = redesMap.get(nomeRede);
    if (existing) {
      existing.push(empresa);
    } else {
      redesMap.set(nomeRede, [empresa]);
    }
  });

  // Converte Map para array e ordena
  return Array.from(redesMap.entries())
    .map(([nomeRede, empresas]) => ({
      nomeRede,
      empresas: empresas.sort((a, b) => {
        const nomeA = a.nome_fantasia || a.razao_social || '';
        const nomeB = b.nome_fantasia || b.razao_social || '';
        return nomeA.localeCompare(nomeB);
      }),
    }))
    .sort((a, b) => a.nomeRede.localeCompare(b.nomeRede));
}
