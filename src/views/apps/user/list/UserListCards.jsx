// MUI Imports
import Grid from '@mui/material/Grid'

// Component Imports
import HorizontalWithSubtitle from '@components/card-statistics/HorizontalWithSubtitle'

const UserListCards = ({ stats }) => {
  const data = [
    {
      title: 'Total de Usuários',
      stats: String(stats?.totalUsers ?? 0),
      avatarIcon: 'tabler-users',
      avatarColor: 'primary',
      subtitle: 'Cadastrados na plataforma'
    },
    {
      title: 'Espaços de Trabalho',
      stats: String(stats?.totalWorkspaces ?? 0),
      avatarIcon: 'tabler-building',
      avatarColor: 'error',
      subtitle: 'Empresas registradas'
    },
    {
      title: 'Usuários Ativos',
      stats: String(stats?.activeUsers ?? 0),
      avatarIcon: 'tabler-user-check',
      avatarColor: 'success',
      subtitle: 'Aceitaram o convite'
    },
    {
      title: 'Usuários Pendentes',
      stats: String(stats?.pendingUsers ?? 0),
      avatarIcon: 'tabler-user-search',
      avatarColor: 'warning',
      subtitle: 'Aguardando aceitar convite'
    }
  ]

  return (
    <Grid container spacing={6}>
      {data.map((item, i) => (
        <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
          <HorizontalWithSubtitle {...item} />
        </Grid>
      ))}
    </Grid>
  )
}

export default UserListCards
