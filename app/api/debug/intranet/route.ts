import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { intranetQueries } from '@/lib/db-unified';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const debug = {
      timestamp: new Date().toISOString(),
      tests: []
    };

    // Teste 1: Informativos
    try {
      console.log('🧪 Testando getInformativos...');
      const informativos = await intranetQueries.getInformativos();
      debug.tests.push({
        test: 'getInformativos',
        success: true,
        hasRows: 'rows' in informativos,
        rowCount: informativos.rows?.length || 0,
        sampleData: informativos.rows?.slice(0, 1) || []
      });
    } catch (error) {
      debug.tests.push({
        test: 'getInformativos',
        success: false,
        error: error.message,
        stack: error.stack
      });
    }

    // Teste 2: Plantão
    try {
      console.log('🧪 Testando getPlantao...');
      const plantao = await intranetQueries.getPlantao();
      debug.tests.push({
        test: 'getPlantao',
        success: true,
        hasRows: 'rows' in plantao,
        rowCount: plantao.rows?.length || 0,
        sampleData: plantao.rows?.slice(0, 1) || []
      });
    } catch (error) {
      debug.tests.push({
        test: 'getPlantao',
        success: false,
        error: error.message,
        stack: error.stack
      });
    }

    // Teste 3: FAQ
    try {
      console.log('🧪 Testando getFaq...');
      const faq = await intranetQueries.getFaq();
      debug.tests.push({
        test: 'getFaq',
        success: true,
        hasRows: 'rows' in faq,
        rowCount: faq.rows?.length || 0,
        sampleData: faq.rows?.slice(0, 1) || []
      });
    } catch (error) {
      debug.tests.push({
        test: 'getFaq',
        success: false,
        error: error.message,
        stack: error.stack
      });
    }

    // Teste 4: AnyDesk
    try {
      console.log('🧪 Testando getAnydeskAcessos...');
      const anydesk = await intranetQueries.getAnydeskAcessos();
      debug.tests.push({
        test: 'getAnydeskAcessos',
        success: true,
        hasRows: 'rows' in anydesk,
        rowCount: anydesk.rows?.length || 0,
        sampleData: anydesk.rows?.slice(0, 1) || []
      });
    } catch (error) {
      debug.tests.push({
        test: 'getAnydeskAcessos',
        success: false,
        error: error.message,
        stack: error.stack
      });
    }

    return NextResponse.json(debug);

  } catch (globalError) {
    return NextResponse.json({
      error: 'Erro global no debug',
      message: globalError.message,
      stack: globalError.stack
    }, { status: 500 });
  }
}