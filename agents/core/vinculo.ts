// Vínculo AS x EMSys3: garante que a base principal (AS) e a base EMSys3 do cliente são da MESMA
// empresa, comparando os CNPJs da tabela empresa do AS com os de tab_empresa do EMSys3.
// Sem esse vínculo validado o agente não investiga nem escreve em nenhuma das bases.
import pg from 'pg';
import { descriptografar } from './crypto';
import { obterCliente, listarBases, registrarVinculo } from './db';

export interface ConexaoCfg {
  db_host: string;
  db_porta: number;
  db_nome: string;
  db_usuario: string;
  /** Senha em texto puro (já descriptografada) */
  db_senha: string;
  db_schema?: string | null;
}

export interface ResultadoVinculo {
  ok: boolean;
  mensagem: string;
  /** CNPJs raiz (8 dígitos) confirmados nas duas bases */
  raizes?: string[];
}

class ErroVinculo extends Error {}

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function normalizarCnpj(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 14) return d;
  if (d.length === 13) return '0' + d;
  return null;
}

export const formatarRaiz = (r: string) => `${r.slice(0, 2)}.${r.slice(2, 5)}.${r.slice(5, 8)}`;

export function mesmaConexaoFisica(a: ConexaoCfg, b: ConexaoCfg): boolean {
  return (
    a.db_host.trim().toLowerCase() === b.db_host.trim().toLowerCase() &&
    Number(a.db_porta) === Number(b.db_porta) &&
    a.db_nome.trim().toLowerCase() === b.db_nome.trim().toLowerCase()
  );
}

// Somente leitura na sessão: a validação nunca escreve nas bases do cliente
async function conectar(cfg: ConexaoCfg, rotulo: string): Promise<pg.Client> {
  const client = new pg.Client({
    host: cfg.db_host, port: cfg.db_porta, database: cfg.db_nome,
    user: cfg.db_usuario, password: cfg.db_senha,
    connectionTimeoutMillis: 8000, ssl: false,
    statement_timeout: 10000, query_timeout: 12000,
    options: '-c default_transaction_read_only=on',
  });
  try {
    await client.connect();
    return client;
  } catch (e: any) {
    await client.end().catch(() => {});
    throw new ErroVinculo(`Não foi possível conectar na base ${rotulo}: ${e?.message ?? 'falha desconhecida'}`);
  }
}

// AS (Autosystem): o CNPJ da empresa fica em pessoa.cpf, ligado a empresa pelo código (só empresas ativas)
async function lerCnpjsAS(client: pg.Client, schema: string): Promise<string[]> {
  try {
    const r = await client.query(
      `SELECT DISTINCT b.cpf::text AS cnpj
         FROM ${ident(schema)}.${ident('empresa')} a
         INNER JOIN ${ident(schema)}.${ident('pessoa')} b ON (a.codigo = b.codigo)
        WHERE a.codigo IS NOT NULL AND a.flag = 'A' AND b.cpf IS NOT NULL
        LIMIT 500`,
    );
    return r.rows.map((x: any) => String(x.cnpj));
  } catch (e: any) {
    throw new ErroVinculo(`Não foi possível ler o CNPJ das empresas na base AS (empresa × pessoa): ${e?.message ?? 'erro desconhecido'}. Confira se é mesmo o banco do AS.`);
  }
}

async function lerCnpjsEmsys(client: pg.Client, schema: string): Promise<string[]> {
  try {
    const r = await client.query(
      `SELECT DISTINCT num_cnpj::text AS cnpj FROM ${ident(schema)}.${ident('tab_empresa')}
       WHERE num_cnpj IS NOT NULL LIMIT 500`,
    );
    return r.rows.map((x: any) => String(x.cnpj));
  } catch (e: any) {
    throw new ErroVinculo(`Não foi possível ler tab_empresa.num_cnpj na base EMSys3: ${e?.message ?? 'erro desconhecido'}. Confira se é mesmo o banco do EMSys3.`);
  }
}

/**
 * Conecta nas duas bases (somente leitura) e compara os CNPJs. Regra: todo CNPJ raiz existente no AS
 * precisa existir no EMSys3 (o EMSys3 pode ter mais empresas) e ao menos um CNPJ completo deve ser igual.
 */
export async function validarVinculo(as: ConexaoCfg, emsys: ConexaoCfg): Promise<ResultadoVinculo> {
  if (mesmaConexaoFisica(as, emsys)) {
    return { ok: false, mensagem: 'A base AS e a base EMSys3 apontam para o mesmo banco (host, porta e nome iguais). Informe o banco correto do EMSys3.' };
  }

  let cAS: pg.Client | null = null;
  let cEm: pg.Client | null = null;
  try {
    cAS = await conectar(as, 'AS');
    cEm = await conectar(emsys, 'EMSys3');

    const [brutosAS, brutosEm] = [
      await lerCnpjsAS(cAS, as.db_schema || 'public'),
      await lerCnpjsEmsys(cEm, emsys.db_schema || 'public'),
    ];

    const fullAS = new Set(brutosAS.map(normalizarCnpj).filter((c): c is string => !!c));
    const fullEm = new Set(brutosEm.map(normalizarCnpj).filter((c): c is string => !!c));
    if (!fullAS.size) return { ok: false, mensagem: 'A base AS não retornou nenhuma empresa ativa (flag = A) com CNPJ válido de 14 dígitos em pessoa.cpf.' };
    if (!fullEm.size) return { ok: false, mensagem: 'A tabela tab_empresa do EMSys3 não tem nenhum CNPJ válido (14 dígitos).' };

    const raizAS = new Set([...fullAS].map((c) => c.slice(0, 8)));
    const raizEm = new Set([...fullEm].map((c) => c.slice(0, 8)));
    const faltando = [...raizAS].filter((r) => !raizEm.has(r));
    const comuns = [...fullAS].filter((c) => fullEm.has(c));

    if (faltando.length || !comuns.length) {
      const detalhe = faltando.length
        ? `CNPJ raiz no AS que não existe no EMSys3: ${faltando.map(formatarRaiz).join(', ')}.`
        : 'Nenhum CNPJ completo é igual nas duas bases.';
      return {
        ok: false,
        mensagem:
          `Os CNPJs da base AS não batem com os da base EMSys3 — as conexões parecem ser de clientes diferentes. ${detalhe} ` +
          `AS: ${[...raizAS].map(formatarRaiz).join(', ')} | EMSys3: ${[...raizEm].map(formatarRaiz).join(', ')}.`,
      };
    }

    const raizes = [...raizAS].sort();
    return {
      ok: true,
      raizes,
      mensagem: `Vínculo validado: CNPJ raiz ${raizes.map(formatarRaiz).join(', ')} confere entre AS (${fullAS.size} CNPJ) e EMSys3 (${fullEm.size} CNPJ).`,
    };
  } catch (e: any) {
    if (e instanceof ErroVinculo) return { ok: false, mensagem: e.message };
    return { ok: false, mensagem: `Falha ao validar o vínculo: ${e?.message ?? 'erro desconhecido'}` };
  } finally {
    await cAS?.end().catch(() => {});
    await cEm?.end().catch(() => {});
  }
}

// ── Trava usada antes de qualquer acesso do agente às bases de um cliente ─────────────────────

const TTL_OK_MS = 5 * 60 * 1000;
const cacheOk = new Map<string, number>();

const assinatura = (c: ConexaoCfg) => `${c.db_host}:${c.db_porta}/${c.db_nome}/${c.db_usuario}/${c.db_schema ?? 'public'}`;

export async function garantirVinculo(
  cliente_id: string,
  empresa_id: string,
  forcar = false,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const cliente = await obterCliente(cliente_id, empresa_id).catch(() => null);
  if (!cliente) return { ok: false, erro: 'Cliente não encontrado.' };

  const bases = await listarBases(cliente_id, empresa_id).catch(() => []);
  const emsys = bases.find((b) => b.papel === 'emsys' && b.ativo);
  if (!emsys) {
    const erro = 'Cliente sem base EMSys3 vinculada e ativa. Cadastre a base EMSys3 e valide o vínculo com o AS.';
    await registrarVinculo(cliente_id, empresa_id, { ok: false, erro });
    return { ok: false, erro };
  }

  let cfgAS: ConexaoCfg;
  let cfgEm: ConexaoCfg;
  try {
    cfgAS = { ...cliente, db_senha: descriptografar(cliente.db_senha) };
    cfgEm = { ...emsys, db_senha: descriptografar(emsys.db_senha) };
  } catch {
    return { ok: false, erro: 'Não foi possível ler as credenciais do cliente.' };
  }

  const chave = `${cliente_id}|${assinatura(cfgAS)}|${assinatura(cfgEm)}`;
  const validoAte = cacheOk.get(chave);
  if (!forcar && validoAte && validoAte > Date.now()) return { ok: true };

  const r = await validarVinculo(cfgAS, cfgEm);
  await registrarVinculo(cliente_id, empresa_id, { ok: r.ok, erro: r.ok ? null : r.mensagem, cnpjs: r.raizes });
  if (r.ok) {
    cacheOk.set(chave, Date.now() + TTL_OK_MS);
    return { ok: true };
  }
  cacheOk.delete(chave);
  return { ok: false, erro: r.mensagem };
}
