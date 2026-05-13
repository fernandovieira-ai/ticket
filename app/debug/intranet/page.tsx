import { NextResponse } from 'next/server';

export default async function DebugIntranetPage() {
  let debugData = null;
  let error = null;

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/debug/intranet`);
    if (response.ok) {
      debugData = await response.json();
    } else {
      error = `HTTP ${response.status}: ${await response.text()}`;
    }
  } catch (e) {
    error = e.message;
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <h1>🔍 Debug Intranet - {new Date().toLocaleString()}</h1>

      {error && (
        <div style={{ backgroundColor: '#ffebee', padding: '15px', border: '1px solid #f44336', marginBottom: '20px' }}>
          <h2 style={{ color: '#d32f2f' }}>❌ Erro ao buscar debug:</h2>
          <pre>{error}</pre>
        </div>
      )}

      {debugData && (
        <div>
          <h2>📊 Resultados dos Testes:</h2>
          {debugData.tests.map((test, index) => (
            <div
              key={index}
              style={{
                backgroundColor: test.success ? '#e8f5e8' : '#ffebee',
                padding: '15px',
                margin: '10px 0',
                border: `1px solid ${test.success ? '#4caf50' : '#f44336'}`,
                borderRadius: '5px'
              }}
            >
              <h3 style={{ margin: '0 0 10px 0' }}>
                {test.success ? '✅' : '❌'} {test.test}
              </h3>

              {test.success ? (
                <div>
                  <p><strong>Tem .rows:</strong> {String(test.hasRows)}</p>
                  <p><strong>Quantidade de registros:</strong> {test.rowCount}</p>
                  {test.sampleData.length > 0 && (
                    <details>
                      <summary>📄 Dados de exemplo</summary>
                      <pre style={{ backgroundColor: 'white', padding: '10px', overflow: 'auto' }}>
                        {JSON.stringify(test.sampleData, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ) : (
                <div>
                  <p><strong>Erro:</strong> {test.error}</p>
                  <details>
                    <summary>📋 Stack trace</summary>
                    <pre style={{ backgroundColor: 'white', padding: '10px', overflow: 'auto', fontSize: '12px' }}>
                      {test.stack}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#e3f2fd', border: '1px solid #2196f3' }}>
        <h3>🔗 Como usar:</h3>
        <ol>
          <li>Acesse esta página em produção: <code>https://painel.digitalrf.com.br/debug/intranet</code></li>
          <li>Veja quais queries estão falhando e por quê</li>
          <li>Use as informações para corrigir o problema</li>
        </ol>
      </div>
    </div>
  );
}