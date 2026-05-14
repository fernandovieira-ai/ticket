import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import ContratosClient from './contratos-client';

export const metadata: Metadata = {
  title: 'Contratos - Intranet',
};

export const dynamic = 'force-dynamic';

export interface ContratoRow {
  cod_grupo: number;
  des_grupo: string;
  cod_pessoa: number;
  nom_pessoa: string;
  num_cnpj_cpf: string | null;
  cod_item: number;
  des_item: string;
  num_telefone_1: string | null;
}

export interface GrupoContrato {
  cod_grupo: number;
  des_grupo: string;
  temHospedagem: boolean;
  empresas: {
    cod_pessoa: number;
    nom_pessoa: string;
    num_cnpj_cpf: string | null;
    num_telefone_1: string | null;
    servicos: { cod_item: number; des_item: string }[];
  }[];
}

function agrupar(rows: ContratoRow[]): GrupoContrato[] {
  const grupos = new Map<number, GrupoContrato>();

  for (const row of rows) {
    if (!grupos.has(row.cod_grupo)) {
      grupos.set(row.cod_grupo, {
        cod_grupo: row.cod_grupo,
        des_grupo: row.des_grupo,
        temHospedagem: false,
        empresas: [],
      });
    }
    const grupo = grupos.get(row.cod_grupo)!;

    let empresa = grupo.empresas.find(e => e.cod_pessoa === row.cod_pessoa);
    if (!empresa) {
      empresa = {
        cod_pessoa: row.cod_pessoa,
        nom_pessoa: row.nom_pessoa,
        num_cnpj_cpf: row.num_cnpj_cpf,
        num_telefone_1: row.num_telefone_1,
        servicos: [],
      };
      grupo.empresas.push(empresa);
    }

    if (row.des_item) {
      empresa.servicos.push({ cod_item: row.cod_item, des_item: row.des_item });
    }

    // cod_item = 2 = Hospedagem
    if (row.cod_item === 2) grupo.temHospedagem = true;
  }

  return Array.from(grupos.values());
}

export default async function ContratosPage() {
  let grupos: GrupoContrato[] = [];
  try {
    const result = await intranetQueries.getContratos();
    grupos = agrupar((result.rows ?? result) as ContratoRow[]);
  } catch (e) {
    console.error('Erro ao carregar contratos:', e);
  }

  return <ContratosClient grupos={grupos} />;
}