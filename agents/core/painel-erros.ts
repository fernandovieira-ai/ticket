// Leitura dos erros PENDENTES do painel EMSys Gestão de uma base (cliente), classificados por tipo e causa,
// para a tela "Painel de Erros". Pendente = situacao = 3 (erro), COM ou SEM reprocessar = true: marcar
// reprocessar não resolve o erro por si só (o EMSys Gestão pode tentar de novo e falhar, e a linha fica
// presa em situacao = 3 com reprocessar = true indefinidamente) — então continua sendo erro do painel até
// a situacao mudar de verdade. `reprocessar` vem no resultado só como informação (já foi reenviado ao
// menos uma vez). Nunca soma o histórico: só o que ainda precisa de ajuste. Somente leitura nas duas bases.
import pg from 'pg';
import { obterCliente, listarBases } from './db';
import { descriptografar } from './crypto';
import { garantirVinculo, type ConexaoCfg } from './vinculo';
import { marcarReprocessarCodigos } from './painel';
import {
  classificarErro, almoxarifadoDoErro, sanitizarTexto, parseSaldoInsuficiente,
  type InfoAlmoxarifado, type RiscoErro,
} from './classificar';
import { obterRegrasPainel, resolverRegra, type ModoRegraPainel } from './regras-painel';
import { saldoRealAteData } from './saldo-estoque';

/** Máximo de combinações (empresa · item · almoxarifado · data) que consultam o saldo real por refresh do
 *  painel — protege contra um refresh lento se um cliente tiver centenas de tanques/itens diferentes em
 *  erro ao mesmo tempo. Acima disso, as combinações restantes mantêm o saldo (desatualizado) do texto do erro. */
const LIMITE_SALDO_REAL = 300;

export interface ErroPainel {
  codigo: string;
  /** Nome da empresa (EMSys3) quando o CNPJ do erro foi encontrado; senão "Empresa <código>" */
  empresa: string;
  empresaId: string;
  caixa: string;
  /** YYYY-MM-DD */
  data: string;
  turno: number | null;
  mlid: string;
  requisicao: string;
  categoria: string;
  causa: string;
  detalhe: string;
  risco: RiscoErro;
  /** O que fazer com este tipo de erro (agente_regras_painel; ver agents/core/regras-painel.ts) */
  modo: ModoRegraPainel;
  /** true = já foi marcado reprocessar = true ao menos uma vez e voltou a dar erro (situacao ainda = 3) */
  reprocessar: boolean;
}

export interface PainelErrosBase {
  cliente_id: string;
  cliente_nome: string;
  ok: boolean;
  erro?: string;
  /** Avisos não fatais (ex.: EMSys3 indisponível, então combustível não foi separado de loja) */
  avisos: string[];
  geradoEm: string;
  /** true se havia mais erros pendentes do que o limite lido */
  truncado: boolean;
  /** Empresas que o painel monitora nesta base (para "N de M"); null se não deu para ler */
  empresasMonitoradas: number | null;
  erros: ErroPainel[];
}

const LIMITE = 5000;
const TTL_MS = 45_000;
const cache = new Map<string, { ate: number; dados: PainelErrosBase }>();

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

function novoClient(cfg: ConexaoCfg): pg.Client {
  return new pg.Client({
    host: cfg.db_host, port: cfg.db_porta, database: cfg.db_nome,
    user: cfg.db_usuario, password: cfg.db_senha,
    connectionTimeoutMillis: 8000, ssl: false,
    statement_timeout: 25000, query_timeout: 30000,
    options: '-c default_transaction_read_only=on',
  });
}

type Leitura = Omit<PainelErrosBase, 'cliente_id' | 'cliente_nome'>;

/**
 * Lê e classifica os erros pendentes. `emsys` é opcional: sem ele (ou se falhar) as empresas aparecem pelo
 * código e o saldo de estoque não separa combustível de loja — vira aviso, não erro.
 */
export async function lerErrosPainel(as: ConexaoCfg, emsys: ConexaoCfg | null, empresa_id: string): Promise<Leitura> {
  const avisos: string[] = [];
  const cAS = novoClient(as);
  const regrasPromise = obterRegrasPainel(empresa_id); // em paralelo com a leitura do painel
  await cAS.connect();

  let linhas: any[] = [];
  let empresasMonitoradas: number | null = null;
  try {
    // O texto do painel pode vir em LATIN1 (mesmo tratamento da varredura)
    await cAS.query("SET client_encoding = 'LATIN1'");
    const r = await cAS.query(
      `SELECT codigo::text AS codigo, empresa::text AS empresa, caixa, TO_CHAR(data, 'YYYY-MM-DD') AS data,
              turno, mlid::text AS mlid, requisicao, retorno, conteudo, COALESCE(reprocessar, false) AS reprocessar,
              substring(conteudo from '"cnpj"[[:space:]]*:[[:space:]]*"?([0-9]{14})') AS cnpj
         FROM exchange_emsys_gestao_monitoramento_pend
        WHERE situacao = 3
        ORDER BY data DESC, codigo DESC
        LIMIT ${LIMITE + 1}`,
    );
    linhas = r.rows;
    try {
      empresasMonitoradas = (await cAS.query(`SELECT count(DISTINCT empresa)::int AS n FROM exchange_emsys_gestao_monitoramento`)).rows[0]?.n ?? null;
    } catch { /* tabela de monitoramento é opcional */ }
  } finally {
    await cAS.end().catch(() => {});
  }

  const truncado = linhas.length > LIMITE;
  if (truncado) linhas = linhas.slice(0, LIMITE);

  // Consultas ao EMSys3: nome da empresa (pelo CNPJ do erro), cod_empresa real, tipo do almoxarifado
  // (tanque x loja) e saldo real (agora) dos itens em "Saldo insuficiente" — o SALDO do texto do erro é o
  // que havia no momento da tentativa e nunca muda sozinho, então sem isso o painel mostra pra sempre o
  // mesmo número mesmo depois do operador lançar a entrada/medição real no EMSys3.
  const nomeEmpresa = new Map<string, string>();
  const codEmpresaPorCnpjLocal = new Map<string, number>();
  const saldoRealMap = new Map<string, number>();
  let almox: Map<number, InfoAlmoxarifado> | null = null;
  if (emsys && linhas.length) {
    const cEm = novoClient(emsys);
    try {
      await cEm.connect();
      const sch = ident(emsys.db_schema || 'public');
      const cnpjs = [...new Set(linhas.map((l) => soDigitos(l.cnpj)).filter((c) => c.length === 14))];
      if (cnpjs.length) {
        const r = await cEm.query(
          `SELECT regexp_replace(num_cnpj::text, '[^0-9]', '', 'g') AS cnpj, nom_fantasia, cod_empresa
             FROM ${sch}.tab_empresa WHERE regexp_replace(num_cnpj::text, '[^0-9]', '', 'g') = ANY($1)`,
          [cnpjs],
        );
        for (const x of r.rows) {
          if (x.nom_fantasia) nomeEmpresa.set(x.cnpj, String(x.nom_fantasia).trim());
          codEmpresaPorCnpjLocal.set(String(x.cnpj), Number(x.cod_empresa));
        }
      }
      const ids = [...new Set(linhas.map((l) => almoxarifadoDoErro(String(l.retorno ?? ''))).filter((n): n is number => n != null))];
      if (ids.length) {
        const r = await cEm.query(
          `SELECT a.cod_almoxarifado, a.des_almoxarifado, a.ind_tanque, a.num_tanque, i.des_item
             FROM ${sch}.tab_almoxarifado a
             LEFT JOIN ${sch}.tab_item i ON i.cod_item = a.cod_item_tanque
            WHERE a.cod_almoxarifado = ANY($1::int[])`,
          [ids],
        );
        almox = new Map(r.rows.map((x: any) => [Number(x.cod_almoxarifado), x as InfoAlmoxarifado]));
      }

      // Combinações únicas (cod_empresa · item · almoxarifado · data) entre os erros de "Saldo insuficiente"
      // pendentes — dedup pra não repetir a mesma consulta por código quando várias vendas do mesmo
      // tanque/item/dia estão na fila.
      type Combo = { empresa: number; item: number; almox: number; data: string };
      const combos = new Map<string, Combo>();
      for (const l of linhas) {
        const info = parseSaldoInsuficiente(String(l.retorno ?? ''));
        if (!info) continue;
        const codEmpresa = codEmpresaPorCnpjLocal.get(soDigitos(l.cnpj));
        if (codEmpresa == null) continue;
        const chave = `${codEmpresa}|${info.item}|${info.almoxarifado}|${info.data}`;
        if (!combos.has(chave)) combos.set(chave, { empresa: codEmpresa, item: info.item, almox: info.almoxarifado, data: info.data });
      }
      for (const [chave, cb] of [...combos.entries()].slice(0, LIMITE_SALDO_REAL)) {
        try { saldoRealMap.set(chave, await saldoRealAteData(cEm, cb.empresa, cb.item, cb.almox, cb.data)); } catch { /* mantém o saldo do texto do erro pra esse combo */ }
      }
    } catch (e: any) {
      avisos.push(`Não foi possível consultar o EMSys3 (${e?.message ?? 'erro'}): as empresas aparecem pelo código e o saldo de estoque não separa combustível de loja.`);
    } finally {
      await cEm.end().catch(() => {});
    }
  } else if (!emsys) {
    avisos.push('Base EMSys3 não configurada: as empresas aparecem pelo código e o saldo de estoque não separa combustível de loja.');
  }

  // Um CNPJ por código de empresa do painel (o primeiro que aparecer)
  const cnpjPorEmpresa = new Map<string, string>();
  for (const l of linhas) {
    const c = soDigitos(l.cnpj);
    if (c.length === 14 && !cnpjPorEmpresa.has(l.empresa)) cnpjPorEmpresa.set(l.empresa, c);
  }

  const regras = await regrasPromise;
  const erros: ErroPainel[] = linhas.map((l) => {
    const info = parseSaldoInsuficiente(String(l.retorno ?? ''));
    const codEmpresaRow = info ? codEmpresaPorCnpjLocal.get(soDigitos(l.cnpj)) : undefined;
    const saldoReal = info && codEmpresaRow != null
      ? saldoRealMap.get(`${codEmpresaRow}|${info.item}|${info.almoxarifado}|${info.data}`) ?? null
      : null;
    const c = classificarErro(String(l.retorno ?? ''), l.requisicao ?? null, almox, l.conteudo ? String(l.conteudo) : null, saldoReal);
    const nome = nomeEmpresa.get(cnpjPorEmpresa.get(l.empresa) ?? '');
    return {
      codigo: String(l.codigo),
      empresa: nome ? sanitizarTexto(nome) : `Empresa ${l.empresa}`,
      empresaId: String(l.empresa),
      caixa: String(l.caixa ?? ''),
      data: String(l.data),
      turno: l.turno == null ? null : Number(l.turno),
      mlid: String(l.mlid ?? ''),
      requisicao: String(l.requisicao ?? ''),
      categoria: c.categoria, causa: c.causa, detalhe: c.detalhe, risco: c.risco,
      modo: resolverRegra(regras, c.categoria).modo,
      reprocessar: !!l.reprocessar,
    };
  });

  return { ok: true, avisos, geradoEm: new Date().toISOString(), truncado, empresasMonitoradas, erros };
}

/** Tipo dos almoxarifados citados nos erros (tanque x loja). null = não foi possível consultar o EMSys3. */
export async function almoxarifadosDe(emsys: ConexaoCfg | null, retornos: string[]): Promise<Map<number, InfoAlmoxarifado> | null> {
  if (!emsys) return null;
  const ids = [...new Set(retornos.map((r) => almoxarifadoDoErro(r)).filter((n): n is number => n != null))];
  if (!ids.length) return new Map();
  const c = novoClient(emsys);
  try {
    await c.connect();
    const sch = ident(emsys.db_schema || 'public');
    const r = await c.query(
      `SELECT a.cod_almoxarifado, a.des_almoxarifado, a.ind_tanque, a.num_tanque, i.des_item
         FROM ${sch}.tab_almoxarifado a
         LEFT JOIN ${sch}.tab_item i ON i.cod_item = a.cod_item_tanque
        WHERE a.cod_almoxarifado = ANY($1::int[])`,
      [ids],
    );
    return new Map(r.rows.map((x: any) => [Number(x.cod_almoxarifado), x as InfoAlmoxarifado]));
  } catch {
    return null;
  } finally {
    await c.end().catch(() => {});
  }
}

export function limparCachePainel(cliente_id: string): void {
  for (const k of [...cache.keys()]) if (k.endsWith(`|${cliente_id}`)) cache.delete(k);
}

export interface ResultadoReprocesso {
  ok: boolean;
  erro?: string;
  marcados: number;
  ignorados: number;
}

/**
 * Reprocessa no painel: marca os códigos com reprocessar = true (única escrita do Painel de Erros nas bases
 * do cliente). Não corrige nada: o erro só sai da fila do painel para o EMSys Gestão tentar de novo.
 */
export async function reprocessarPainel(
  cliente_id: string,
  empresa_id: string,
  codigos: string[],
  usuario_id?: string,
): Promise<ResultadoReprocesso> {
  const falha = (erro: string): ResultadoReprocesso => ({ ok: false, erro, marcados: 0, ignorados: 0 });

  const cliente = await obterCliente(cliente_id, empresa_id).catch(() => null);
  if (!cliente) return falha('Cliente não encontrado.');

  const vinculo = await garantirVinculo(cliente.id, empresa_id);
  if (!vinculo.ok) return falha(`Vínculo AS x EMSys3 não validado: ${vinculo.erro}`);

  let cfgAS: ConexaoCfg;
  try {
    cfgAS = { ...cliente, db_senha: descriptografar(cliente.db_senha) };
  } catch {
    return falha('Não foi possível ler as credenciais do cliente.');
  }

  try {
    const r = await marcarReprocessarCodigos(cfgAS, codigos);
    limparCachePainel(cliente.id);
    console.log(`[painel-erros] reprocessar=true em ${r.marcados} código(s) de "${cliente.nome}" (${r.ignorados} já resolvidos/reprocessados) por ${usuario_id ?? 'usuário'}`);
    return { ok: true, ...r };
  } catch (e: any) {
    return falha(`Não foi possível marcar o reprocessamento no painel: ${e?.message ?? 'falha desconhecida'}`);
  }
}

export interface LinhaPainel {
  codigo: string;
  /** Código de empresa do LADO DO AS — não é o cod_empresa do EMSys3 (ver `codEmpresaPorCnpj`). */
  empresa: string;
  caixa: string;
  data: string;
  turno: number | null;
  mlid: string;
  requisicao: string;
  /** Mensagem completa do erro */
  retorno: string;
  /** CNPJ (14 dígitos) gravado no JSON `conteudo` da venda — única forma confiável de achar o cod_empresa real no EMSys3 */
  cnpj: string | null;
  /** JSON completo da venda (`conteudo`) — usado para pegar a quantidade REAL do item vendido: o texto do
   *  erro ("QUANTIDADE BAIXA = ...") é só o que a trigger reportou, mas a fonte confiável é a própria venda. */
  conteudo: string;
}

/** Mensagens completas dos códigos informados que AINDA estão pendentes (para a análise por grupo). */
export async function lerLinhasPorCodigo(as: ConexaoCfg, codigos: string[]): Promise<LinhaPainel[]> {
  const ids = [...new Set(codigos)].filter((c) => /^\d{1,18}$/.test(c)).slice(0, 1000);
  if (!ids.length) return [];
  const c = novoClient(as);
  await c.connect();
  try {
    await c.query("SET client_encoding = 'LATIN1'");
    const r = await c.query(
      `SELECT codigo::text AS codigo, empresa::text AS empresa, caixa, TO_CHAR(data, 'YYYY-MM-DD') AS data,
              turno, mlid::text AS mlid, requisicao, retorno, conteudo,
              substring(conteudo from '"cnpj"[[:space:]]*:[[:space:]]*"?([0-9]{14})') AS cnpj
         FROM exchange_emsys_gestao_monitoramento_pend
        WHERE codigo = ANY($1::bigint[]) AND situacao = 3
        ORDER BY data DESC, codigo DESC`,
      [ids],
    );
    return r.rows.map((x: any) => ({
      codigo: String(x.codigo), empresa: String(x.empresa), caixa: String(x.caixa ?? ''), data: String(x.data),
      turno: x.turno == null ? null : Number(x.turno),
      mlid: String(x.mlid ?? ''), requisicao: String(x.requisicao ?? ''), retorno: sanitizarTexto(String(x.retorno ?? '')),
      cnpj: x.cnpj ? String(x.cnpj) : null, conteudo: String(x.conteudo ?? ''),
    }));
  } finally {
    await c.end().catch(() => {});
  }
}

/** Reexportada por conveniência — quem já importa daqui não precisa saber que a função mora em classificar.ts. */
export { quantidadeRealDaVenda } from './classificar';

/**
 * cod_empresa (EMSys3) por CNPJ. A coluna `empresa` da fila do AS NÃO é o cod_empresa do EMSys3 — é um
 * código interno do lado do AS, sem relação numérica com o EMSys3 (confirmado: uma venda com
 * `empresa` = "30351405" no AS correspondia a cod_empresa = 105 no EMSys3, CNPJs completamente
 * diferentes). A única forma confiável de saber a empresa real no EMSys3 é pelo CNPJ (14 dígitos)
 * gravado no JSON `conteudo` da própria venda — mesma fonte que `lerErrosPainel` usa pra exibir o nome
 * da empresa. Ajustes que escrevem/consultam o EMSys3 (estoque, saldo) DEVEM resolver por aqui antes de
 * usar um `cod_empresa` — nunca usar `LinhaPainel.empresa` diretamente como cod_empresa do EMSys3.
 */
export async function codEmpresaPorCnpj(emsys: ConexaoCfg | null, cnpjs: Array<string | null>): Promise<Map<string, number>> {
  const validos = [...new Set(cnpjs.filter((c): c is string => !!c && /^\d{14}$/.test(c)))];
  if (!emsys || !validos.length) return new Map();
  const c = novoClient(emsys);
  try {
    await c.connect();
    const sch = ident(emsys.db_schema || 'public');
    const r = await c.query(
      `SELECT regexp_replace(num_cnpj::text, '[^0-9]', '', 'g') AS cnpj, cod_empresa
         FROM ${sch}.tab_empresa WHERE regexp_replace(num_cnpj::text, '[^0-9]', '', 'g') = ANY($1)`,
      [validos],
    );
    return new Map(r.rows.map((x: any) => [String(x.cnpj), Number(x.cod_empresa)]));
  } catch {
    return new Map();
  } finally {
    await c.end().catch(() => {});
  }
}

/**
 * Painel de uma base (cliente) da empresa logada. Passa pela trava do vínculo AS x EMSys3 antes de tocar
 * nas bases. Resultado em cache por 45 s (`forcar` ignora o cache).
 */
export async function carregarErrosPainel(cliente_id: string, empresa_id: string, forcar = false): Promise<PainelErrosBase> {
  const falha = (nome: string, erro: string): PainelErrosBase => ({
    cliente_id, cliente_nome: nome, ok: false, erro, avisos: [], geradoEm: new Date().toISOString(),
    truncado: false, empresasMonitoradas: null, erros: [],
  });

  const chave = `${empresa_id}|${cliente_id}`;
  const em = cache.get(chave);
  if (!forcar && em && em.ate > Date.now()) return em.dados;

  const cliente = await obterCliente(cliente_id, empresa_id).catch(() => null);
  if (!cliente) return falha('', 'Cliente não encontrado.');

  const vinculo = await garantirVinculo(cliente.id, empresa_id);
  if (!vinculo.ok) return falha(cliente.nome, `Vínculo AS x EMSys3 não validado: ${vinculo.erro}`);

  let cfgAS: ConexaoCfg;
  let cfgEm: ConexaoCfg | null = null;
  try {
    cfgAS = { ...cliente, db_senha: descriptografar(cliente.db_senha) };
    const base = (await listarBases(cliente.id, empresa_id).catch(() => [])).find((b) => b.papel === 'emsys' && b.ativo);
    if (base) cfgEm = { ...base, db_senha: descriptografar(base.db_senha) };
  } catch {
    return falha(cliente.nome, 'Não foi possível ler as credenciais do cliente.');
  }

  try {
    const leitura = await lerErrosPainel(cfgAS, cfgEm, empresa_id);
    const dados: PainelErrosBase = { cliente_id: cliente.id, cliente_nome: cliente.nome, ...leitura };
    cache.set(chave, { ate: Date.now() + TTL_MS, dados });
    return dados;
  } catch (e: any) {
    return falha(cliente.nome, `Não foi possível ler o painel na base AS: ${e?.message ?? 'falha desconhecida'}`);
  }
}
