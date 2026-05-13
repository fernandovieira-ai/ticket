import { Metadata } from 'next';
import { intranetQueries } from '@/lib/db-unified';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Users, HelpCircle, Calendar, Key, Monitor, Building, Shield } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Intranet - Painel Administrativo',
  description: 'Central de módulos da intranet integrada ao sistema de tickets',
};

export default async function IntranetHomePage() {
  // Buscar stats para cards
  const stats = await intranetQueries.getDashboardStats();

  const modules = [
    {
      title: 'Informativos',
      description: 'Gerenciar comunicados e informativos internos',
      icon: FileText,
      href: '/painel/intranet/informativos',
      count: stats.informativos_ativos,
      color: 'bg-blue-500',
    },
    {
      title: 'Plantão',
      description: 'Controle de escalas e plantões',
      icon: Calendar,
      href: '/painel/intranet/plantao',
      count: stats.plantoes_abertos,
      color: 'bg-green-500',
    },
    {
      title: 'FAQ',
      description: 'Base de conhecimento e soluções',
      icon: HelpCircle,
      href: '/painel/intranet/faq',
      count: stats.total_faq,
      color: 'bg-purple-500',
    },
    {
      title: 'Contratos',
      description: 'Gestão de contratos e parcerias',
      icon: Building,
      href: '/painel/intranet/contratos',
      count: stats.total_contratos,
      color: 'bg-orange-500',
    },
    {
      title: 'DTEF',
      description: 'Senhas e acessos DTEF',
      icon: Key,
      href: '/painel/intranet/dtef',
      count: stats.total_dtef,
      color: 'bg-red-500',
    },
    {
      title: 'AnyDesk',
      description: 'Acessos remotos e credenciais',
      icon: Monitor,
      href: '/painel/intranet/anydesk',
      count: stats.total_anydesk,
      color: 'bg-indigo-500',
    },
    {
      title: 'Dados Restritos',
      description: 'Informações confidenciais protegidas',
      icon: Shield,
      href: '/painel/intranet/dados-restritos',
      count: stats.total_dados_restritos,
      color: 'bg-gray-700',
    },
  ];

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Intranet</h1>
        <p className="text-muted-foreground">
          Central de módulos administrativos e informativos internos
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Card key={module.href} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${module.color} text-white`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{module.title}</CardTitle>
                    <CardDescription className="text-sm">
                      {module.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-primary">
                    {module.count}
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={module.href}>
                      Acessar
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Resumo Geral</CardTitle>
            <CardDescription>
              Estatísticas consolidadas da intranet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.informativos_ativos}</div>
                <div className="text-sm text-muted-foreground">Informativos Ativos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.plantoes_abertos}</div>
                <div className="text-sm text-muted-foreground">Plantões Abertos</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{stats.total_faq}</div>
                <div className="text-sm text-muted-foreground">FAQs Disponíveis</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{stats.total_contratos}</div>
                <div className="text-sm text-muted-foreground">Contratos</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}