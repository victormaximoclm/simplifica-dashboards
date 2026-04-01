const menu = skin => ({
  MuiMenu: {
    defaultProps: {
      ...(skin === 'bordered' && {
        slotProps: {
          paper: {
            elevation: 0
          }
        }
      })
    },
    styleOverrides: {
      paper: ({ theme }) => ({
        marginBlockStart: theme.spacing(0.5),
        ...(skin !== 'bordered' && {
          boxShadow: 'var(--mui-customShadows-lg)'
        })
      })
    }
  },
  MuiMenuItem: {
    styleOverrides: {
      root: ({ theme }) => ({
        paddingBlock: theme.spacing(2),
        gap: theme.spacing(2),
        color: 'var(--mui-palette-text-primary)',
        marginInline: theme.spacing(2),
        borderRadius: 'var(--mui-shape-borderRadius)',
        '& i, & svg': {
          fontSize: '1.375rem'
        },
        '& .MuiListItemIcon-root': {
          minInlineSize: 0
        },
        '&:not(:last-of-type)': {
          marginBlockEnd: theme.spacing(0.5)
        },
        '&:hover': {
          backgroundColor: theme.palette.mode === 'light' ? '#EB8A5F' : 'var(--mui-palette-action-hover)',
          color: theme.palette.mode === 'light' ? '#FFF' : 'var(--mui-palette-text-primary)',
          '& .MuiListItemIcon-root': {
            color: theme.palette.mode === 'light' ? '#FFF' : 'inherit'
          }
        },
        '&.Mui-selected': {
          backgroundColor: theme.palette.mode === 'light' ? '#E66C37' : 'var(--mui-palette-primary-lightOpacity)',
          color: theme.palette.mode === 'light' ? '#FFF' : 'var(--mui-palette-primary-main)',
          '& .MuiListItemIcon-root': {
            color: theme.palette.mode === 'light' ? '#FFF' : 'var(--mui-palette-primary-main)'
          },
          '&:hover, &.Mui-focused, &.Mui-focusVisible': {
            backgroundColor: theme.palette.mode === 'light' ? '#EB8A5F' : 'var(--mui-palette-primary-mainOpacity)'
          }
        },
        '&.Mui-disabled': {
          color: 'var(--mui-palette-text-disabled)',
          opacity: 0.45
        }
      })
    }
  }
})

export default menu
