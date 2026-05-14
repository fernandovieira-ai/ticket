const { intranetQueries } = require('./lib/db-unified');

async function testQueries() {
  console.log('🧪 Testando queries da intranet...\n');

  try {
    console.log('📋 Testando getInformativos...');
    const informativos = await intranetQueries.getInformativos();
    console.log('Tipo do resultado:', typeof informativos);
    console.log('Tem .rows?', 'rows' in informativos);
    console.log('Número de informativos:', informativos.rows?.length || 'N/A');
    console.log('Primeiro informativo:', informativos.rows?.[0] || 'Nenhum');

    console.log('\n📋 Testando getPlantao...');
    const plantao = await intranetQueries.getPlantao();
    console.log('Tipo do resultado:', typeof plantao);
    console.log('Tem .rows?', 'rows' in plantao);
    console.log('Número de plantões:', plantao.rows?.length || 'N/A');

    console.log('\n📋 Testando getFaq...');
    const faq = await intranetQueries.getFaq();
    console.log('Tipo do resultado:', typeof faq);
    console.log('Tem .rows?', 'rows' in faq);
    console.log('Número de FAQs:', faq.rows?.length || 'N/A');

  } catch (error) {
    console.error('❌ Erro ao testar queries:', error);
  }
}

testQueries();