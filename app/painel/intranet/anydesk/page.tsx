import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Monitor, Search, Network, Building, Key, Eye } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AnyDesk - Intranet',
  description: 'Gestão de acessos remotos AnyDesk',
};

export default async function AnydeskPage() {
  const anydesk = await intranetQueries.getAnydeskAcessos();

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Monitor className="h-8 w-8 text-indigo-500" />
            AnyDesk
          </h1>
          <p className="text-muted-foreground">
            Gestão de acessos remotos e credenciais AnyDesk
          </p>
        </div>
        <Button asChild>
          <Link href="/painel/intranet/anydesk/novo">
            <Plus className="h-4 w-4 mr-2" />
            Novo Acesso
          </Link>
        </Button>
      </div>

      {/* Busca */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Buscar Acessos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por rede, unidade, host ou endereço AnyDesk..."
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
        {anydesk.rows.map((acesso) => (
          <Card key={acesso.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Network className="h-5 w-5 text-indigo-500" />
                  {acesso.rede}
                </CardTitle>
                <Badge variant="outline">
                  {acesso.end_anydesk}
                </Badge>
              </div>
              <CardDescription className="flex items-center gap-2">
                <Building className="h-4 w-4" />
                {acesso.unidade}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Informações do host */}
                <div className="flex items-center gap-2 text-sm">
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Host:</span>
                  <span className="font-mono bg-muted px-2 py-1 rounded">
                    {acesso.host}
                  </span>
                </div>

                {/* Endereço AnyDesk */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-indigo-500" />
                    <span className="font-medium">ID AnyDesk:</span>
                    <span className="font-mono text-lg tracking-wider">
                      {acesso.end_anydesk}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" title="Copiar ID">
                    📋
                  </Button>
                </div>

                {/* Senha */}
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

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-xs text-muted-foreground">
                    Criado: {new Date(acesso.criado_em).toLocaleDateString('pt-BR')}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/painel/intranet/anydesk/${acesso.id}`}>
                        Conectar
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/painel/intranet/anydesk/${acesso.id}/editar`}>
                        Editar
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {anydesk.rows.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Monitor className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum acesso AnyDesk encontrado</h3>
              <p className="text-muted-foreground mb-4">
                Comece adicionando seu primeiro acesso remoto
              </p>
              <Button asChild>
                <Link href="/painel/intranet/anydesk/novo">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Acesso
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Aviso de segurança */}
      <Card className="mt-6 border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-amber-600" />
            <span className="font-medium text-amber-800">Política de Acesso Remoto</span>
          </div>
          <p className="text-sm text-amber-700 mt-2">
            Use acessos remotos apenas para suporte autorizado. Mantenha as credenciais seguras e registre todos os acessos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}