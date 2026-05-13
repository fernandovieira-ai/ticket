import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Key, Search, Building, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'DTEF - Intranet',
  description: 'Gestão de senhas e acessos DTEF',
};

export default async function DtefPage() {
  const dtef = await intranetQueries.getDtef();

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Key className="h-8 w-8 text-red-500" />
            DTEF
          </h1>
          <p className="text-muted-foreground">
            Gestão de senhas e acessos DTEF
          </p>
        </div>
        <Link href="/painel/intranet/dtef/novo">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Novo Acesso DTEF
          </Button>
        </Link>
      </div>

      {/* Busca */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Buscar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por CNPJ, loja ou observação..."
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
        {dtef.rows.map((item) => (
          <Card key={item.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  {item.loja}
                </CardTitle>
                <Badge variant="outline">
                  {item.cnpj}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-red-500" />
                    <span className="font-medium">Senha:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg tracking-wider">
                      ••••••••
                    </span>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {item.observacoes && (
                  <div className="text-sm">
                    <span className="font-medium text-muted-foreground">Observações:</span>
                    <p className="mt-1">{item.observacoes}</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Criado: {new Date(item.criado_em).toLocaleDateString('pt-BR')}</div>
                    {item.atualizado_em && item.atualizado_em !== item.criado_em && (
                      <div>Atualizado: {new Date(item.atualizado_em).toLocaleDateString('pt-BR')}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/painel/intranet/dtef/${item.id}`}>
                      <Button variant="outline" size="sm">
                        Visualizar
                      </Button>
                    </Link>
                    <Link href={`/painel/intranet/dtef/${item.id}/editar`}>
                      <Button variant="outline" size="sm">
                        Editar
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {dtef.rows.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum acesso DTEF encontrado</h3>
              <p className="text-muted-foreground mb-4">
                Comece adicionando seu primeiro acesso DTEF
              </p>
              <Link href="/painel/intranet/dtef/novo">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Acesso DTEF
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Aviso de segurança */}
      <Card className="mt-6 border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-600" />
            <span className="font-medium text-amber-800">Aviso de Segurança</span>
          </div>
          <p className="text-sm text-amber-700 mt-2">
            As senhas DTEF são informações confidenciais. Acesse apenas o necessário e mantenha sigilo absoluto.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}