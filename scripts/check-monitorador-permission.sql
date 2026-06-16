-- Verificar se a permissão do Monitorador existe
SELECT
  tela_nome,
  perfil,
  pode_acessar,
  pode_editar,
  criado_em
FROM permissoes_telas
WHERE tela_rota = '/painel/intranet/monitorador'
ORDER BY perfil;

-- Se não retornar nada, execute o botão "Popular Permissões" na interface
