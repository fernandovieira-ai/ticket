import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { InformativosClient } from './informativos-client';

export const metadata: Metadata = {
  title: 'Informativos - Intranet',
};

export default async function InformativosPage() {
  try {
    console.log('🔍 Iniciando busca por informativos...');
    const result = await intranetQueries.getInformativos();
    console.log('🔍 Resultado recebido:', {
      type: typeof result,
      hasRows: 'rows' in result,
      rowCount: result?.rows?.length,
      keys: Object.keys(result || {})
    });

    if (!result) {
      throw new Error('Resultado é null/undefined');
    }

    if (!('rows' in result)) {
      throw new Error('Resultado não tem propriedade rows');
    }

    return <InformativosClient initialInformativos={result.rows} />;
  } catch (error) {
    console.error('❌ Erro em InformativosPage:', error);

    // Página de erro com detalhes para debug
    return (
      <div style={{ padding: '20px', backgroundColor: '#ffebee', minHeight: '100vh' }}>
        <h1>❌ Erro na Página de Informativos</h1>
        <pre style={{ backgroundColor: 'white', padding: '15px', border: '1px solid red', overflow: 'auto' }}>
          <strong>Erro:</strong> {error instanceof Error ? error.message : String(error)}
          {error instanceof Error && error.stack && (
            <>
              <br /><br />
              <strong>Stack:</strong>
              <br />
              {error.stack}
            </>
          )}
        </pre>
        <p style={{ marginTop: '20px' }}>
          <strong>Timestamp:</strong> {new Date().toISOString()}
        </p>
        <p>
          <a href="/painel/dashboard" style={{ color: '#1976d2' }}>← Voltar ao Dashboard</a>
        </p>
      </div>
    );
  }
}