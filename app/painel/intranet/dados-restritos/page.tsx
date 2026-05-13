import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Shield, Search, User, Lock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Dados Restritos - Intranet',
  description: 'Gestão de informações confidenciais e dados restritos',
};

export default async function DadosRestritosPage() {
  const dadosRestritos = await intranetQueries.getDadosRestritos();

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8 text-gray-700" />
            Dados Restritos
          </h1>
          <p className="text-muted-foreground">
            Gestão de informações confidenciais e dados protegidos
          </p>
        </div>
        <Button asChild className="bg-gray-700 hover:bg-gray-800">
          <Link href="/painel/intranet/dados-restritos/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Registro
          </Link>
        </Button>
      </div>

      {/* Aviso de Segurança */}
      <Card className="mb-6 border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <span className="font-medium text-red-800">Área Restrita</span>
          </div>
          <p className="text-sm text-red-700 mt-2">
            Esta seção contém informações altamente confidenciais. Acesso permitido apenas para usuários autorizados.
            Todos os acessos são registrados e monitorados.
          </p>
        </CardContent>
      </Card>

      {/* Busca */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Buscar Registros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por projeto, descrição ou responsável..."
                className="w-full"
              />
            </div>
            <Button variant="outline">
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {dadosRestritos.rows.map((item) => (
          <Card key={item.id} className="hover:shadow-md transition-shadow border-gray-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-gray-600" />
                  <CardTitle className="text-xl">
                    {item.projeto || 'Projeto não especificado'}
                  </CardTitle>
                </div>
                <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                  <Lock className="h-3 w-3 mr-1" />
                  Confidencial
                </Badge>
              </div>
              {item.descricao && (
                <CardDescription className="line-clamp-2">
                  {item.descricao}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Indicador de dados criptografados */}
                <div className="flex items-center justify-center p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="text-center">
                    <Lock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <span className="text-sm font-medium text-gray-600">Dados Criptografados</span>
                    <p className="text-xs text-gray-500 mt-1">
                      Clique para visualizar (requer autorização)
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-xs text-muted-foreground space-y-1">
                    {item.criado_por && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Criado por: {item.criado_por}
                      </div>
                    )}
                    <div>
                      Data: {new Date(item.criado_em).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/painel/intranet/dados-restritos/${item.id}`}>
                        <Shield className="h-4 w-4 mr-1" />
                        Acessar
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/painel/intranet/dados-restritos/${item.id}/editar`}>
                        Editar
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {dadosRestritos.rows.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum registro encontrado</h3>
              <p className="text-muted-foreground mb-4">
                Nenhum dado restrito foi cadastrado ainda
              </p>
              <Button asChild className="bg-gray-700 hover:bg-gray-800">
                <Link href="/painel/intranet/dados-restritos/novo">
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Registro
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Rodapé com informações de auditoria */}
      <Card className="mt-6 bg-gray-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              <span>Sistema de auditoria ativo</span>
            </div>
            <div>
              Todos os acessos são registrados
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}