import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Building, Search, Phone, Mail, FileText } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contratos - Intranet',
  description: 'Gestão de contratos e parcerias',
};

export default async function ContratosPage() {
  const contratos = await intranetQueries.getContratos();

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building className="h-8 w-8 text-orange-500" />
            Contratos
          </h1>
          <p className="text-muted-foreground">
            Gestão de contratos e parcerias empresariais
          </p>
        </div>
        <Link href="/painel/intranet/contratos/novo">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Novo Contrato
          </Button>
        </Link>
      </div>

      {/* Busca e Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Buscar Contratos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar por empresa, CNPJ, grupo ou contato..."
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
        {contratos.rows.map((contrato) => (
          <Card key={contrato.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">{contrato.empresa}</CardTitle>
                  {contrato.grupo_empresa && (
                    <CardDescription className="flex items-center gap-1">
                      <Badge variant="secondary">{contrato.grupo_empresa}</Badge>
                    </CardDescription>
                  )}
                </div>
                <Badge variant="outline">
                  {contrato.cnpj}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {/* Informações de contato */}
                <div className="space-y-2">
                  {contrato.contato && (
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Contato:</span>
                      <span>{contrato.contato}</span>
                    </div>
                  )}
                  {contrato.telefone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Telefone:</span>
                      <span>{contrato.telefone}</span>
                    </div>
                  )}
                  {contrato.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Email:</span>
                      <span>{contrato.email}</span>
                    </div>
                  )}
                </div>

                {/* Observações */}
                <div>
                  {contrato.observacoes && (
                    <div>
                      <span className="font-medium text-sm text-muted-foreground">Observações:</span>
                      <p className="text-sm mt-1 line-clamp-3">{contrato.observacoes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="text-xs text-muted-foreground">
                  Criado em: {new Date(contrato.criado_em).toLocaleDateString('pt-BR')}
                </div>
                <div className="flex gap-2">
                  <Link href={`/painel/intranet/contratos/${contrato.id}`}>
                    <Button variant="outline" size="sm">
                      Visualizar
                    </Button>
                  </Link>
                  <Link href={`/painel/intranet/contratos/${contrato.id}/editar`}>
                    <Button variant="outline" size="sm">
                      Editar
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {contratos.rows.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum contrato encontrado</h3>
              <p className="text-muted-foreground mb-4">
                Comece adicionando seu primeiro contrato
              </p>
              <Link href="/painel/intranet/contratos/novo">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Contrato
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}