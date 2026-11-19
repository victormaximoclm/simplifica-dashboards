/**
 * Estilos do módulo de formulários (formulários, documentos e visualizador de PDF).
 * Cores sempre pelos tokens do tema (text-primary, background-paper), para funcionar no modo claro e no escuro.
 *
 * Os utilitários do Tailwind são !important neste projeto: não empilhe dois tamanhos ou duas cores de texto na mesma
 * classe (vence o que vier por último no CSS, não no className). Para cada papel há um token completo.
 */

const cursor = 'cursor-pointer'

const textMain = 'text-[var(--mui-palette-text-primary)]'
const textSoft = 'text-[var(--mui-palette-text-secondary)]'
const inputPaper = 'bg-[var(--mui-palette-background-paper)]'
const borderDivider = 'border-[var(--mui-palette-divider)]'

/** Anel de foco visível só para teclado */
const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mui-palette-primary-main)]'

/** Layout comum a todos os botões; a cor vem de cada variante */
const btnLayout = [
  'inline-flex items-center justify-center font-medium transition-colors rounded-lg select-none',
  cursor,
  focusRing,
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'
].join(' ')

/** Ação principal: sólido, no máximo um por área da tela */
const btnSolid = [
  btnLayout,
  'text-[var(--mui-palette-primary-contrastText)]',
  'bg-[var(--mui-palette-primary-main)]',
  'hover:bg-[var(--mui-palette-primary-dark)]',
  'shadow-[var(--mui-customShadows-primary-sm)]'
].join(' ')

/** Ação de apoio: contorno neutro */
const btnOutline = [
  btnLayout,
  textMain,
  'border border-[var(--mui-palette-divider)]',
  'bg-transparent hover:bg-[var(--mui-palette-action-hover)] hover:border-[var(--mui-palette-text-disabled)]'
].join(' ')

/** Ação de destaque leve: fundo tonal na cor primária */
const btnTonal = [
  btnLayout,
  'text-[var(--mui-palette-primary-main)]',
  'bg-[var(--mui-palette-primary-lightOpacity)]',
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]'
].join(' ')

/** Ação destrutiva: tonal em vermelho */
const btnDanger = [
  btnLayout,
  'text-[var(--mui-palette-error-main)]',
  'bg-[var(--mui-palette-error-lightOpacity)]',
  'hover:bg-[var(--mui-palette-error-lighterOpacity)]',
  'focus-visible:outline-[var(--mui-palette-error-main)]'
].join(' ')

export const btnPrimary = [btnSolid, 'gap-2 px-4 py-2 text-sm'].join(' ')

export const btnPrimarySm = [btnSolid, 'gap-1.5 px-4 py-1.5 text-xs shrink-0'].join(' ')

/** Ação de apoio, mesmo tamanho do botão primário */
export const btnOutlined = [
  btnLayout,
  'gap-2 px-4 py-2 text-sm bg-transparent border',
  'text-[var(--page-fg)] border-[var(--page-border)] hover:bg-[var(--page-hover)]'
].join(' ')

/** Variantes compactas dos cartões e listas */
export const btnPrimarySoft = [btnTonal, 'gap-1.5 px-3 py-1.5 text-xs shrink-0'].join(' ')
export const btnSecondary = [btnOutline, 'gap-1.5 px-3 py-1.5 text-xs shrink-0'].join(' ')
export const btnDangerSoft = [btnDanger, 'gap-1.5 px-3 py-1.5 text-xs shrink-0'].join(' ')

/** Botão só de ícone (voltar, fechar): neutro, com área de toque de 36px */
export const btnIcon = [btnOutline, 'w-9 h-9 shrink-0'].join(' ')

/** Adicionar item (campo, regra, opção): tracejado, não compete com o botão principal */
export const btnDashed = [
  btnLayout,
  'gap-2 w-full py-3 text-sm border border-dashed bg-transparent',
  'text-[var(--mui-palette-primary-main)]',
  'border-[var(--mui-palette-primary-main)]',
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]'
].join(' ')


export const inputFocus =
  'focus:outline-none focus:border-[var(--mui-palette-primary-main)] focus:ring-1 focus:ring-[var(--mui-palette-primary-main)]'

export const formTitleCls = 'text-xl sm:text-2xl font-semibold text-[var(--page-fg)]'

/** Título de cartão ou de item de lista */
export const formCardTitleCls = `text-base font-semibold ${textMain}`

/** Título de tela vazia */
export const formEmptyTitleCls = 'text-xl font-medium text-[var(--page-fg)]'

export const formHeadingCls = `text-xl sm:text-2xl font-semibold ${textMain}`

export const formSubtitleCls = 'text-sm text-[var(--page-fg-soft)]'

/** Texto de apoio direto sobre a página (estados vazios) */
export const formPageMutedCls = 'text-sm text-[var(--page-fg-soft)]'

export const formMutedCls = `text-sm ${textSoft}`

export const formCaptionCls = `text-xs ${textSoft}`

export const formIconMutedCls = `text-[var(--mui-palette-text-disabled)]`

export const formLabelCls = `block text-sm font-medium ${textMain} mb-1.5`

export const formCheckboxLabelCls = `text-sm ${textMain}`

export const formRequiredCls = 'text-[var(--mui-palette-error-main)] ml-1'

export const formFieldsWrapCls = 'w-full max-w-2xl mx-auto'

export const formInputCls = [
  'w-full px-3 py-2 rounded-lg border text-sm transition',
  inputPaper,
  borderDivider,
  textMain,
  'placeholder:text-[var(--mui-palette-text-disabled)]',
  inputFocus
].join(' ')

export const formInputReadonlyCls = [formInputCls, 'cursor-not-allowed opacity-90'].join(' ')

export const formCardCls = [inputPaper, 'border', borderDivider, 'rounded-xl'].join(' ')

export const formSectionCls = [inputPaper, 'border', borderDivider, 'rounded-xl p-5'].join(' ')

export const formPageCls = 'p-4 sm:p-6 max-w-full'

/** Scrollbar fina na cor primary (substitui a barra padrão do navegador) */
export const formScrollCls = [
  '[scrollbar-width:thin] [scrollbar-color:var(--mui-palette-primary-mainOpacity)_transparent]',
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent',
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--mui-palette-primary-mainOpacity)]',
  'hover:[&::-webkit-scrollbar-thumb]:bg-[var(--mui-palette-primary-main)]'
].join(' ')

/** Painel flutuante dos dropdowns (sem scroll próprio): lista plana no fundo da paleta */
export const formDropdownPanelCls = [
  'absolute z-30 mt-1.5 w-full rounded-lg py-1 shadow-xl overflow-hidden',
  'border border-[var(--mui-palette-primary-main)]',
  inputPaper
].join(' ')

/** Painel de dropdown com lista rolável */
export const formDropdownCls = [formDropdownPanelCls, 'max-h-52 overflow-y-auto', formScrollCls].join(' ')

/** Item da lista: sem fundo próprio (zera o cinza padrão do <button>), só realce no hover */
const dropdownRowBase = [
  'block w-full text-left px-3.5 py-2 text-sm !cursor-pointer transition-colors',
  '!bg-transparent !border-0 !rounded-none !shadow-none',
  textMain,
  'hover:!bg-[var(--mui-palette-primary-lightOpacity)]'
].join(' ')

export const formDropdownItemCls = dropdownRowBase

/** Item já escolhido: letra laranja + fundo levemente escurecido */
export const formDropdownItemSelectedCls =
  '!text-[var(--mui-palette-primary-main)] !bg-[var(--mui-palette-action-hover)] font-medium'

export const formDropdownAddCls = [
  dropdownRowBase,
  'flex items-center gap-2 !text-[var(--mui-palette-primary-main)] font-medium'
].join(' ')

/** Gatilho do FormSelect (mesmo visual do input) */
export const formSelectTriggerCls = [
  'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm text-left transition',
  inputPaper,
  borderDivider,
  textMain,
  cursor,
  'disabled:opacity-50 disabled:cursor-not-allowed',
  inputFocus
].join(' ')

export const formDropdownOptionCls = [
  'flex items-center justify-between gap-2 px-3.5 py-2 text-sm transition-colors',
  textMain,
  cursor
].join(' ')

export const formDropdownOptionActiveCls = 'bg-[var(--mui-palette-primary-lightOpacity)]'

/** Selecionada: letra laranja + fundo levemente escurecido */
export const formDropdownOptionSelectedCls =
  'bg-[var(--mui-palette-action-hover)] !text-[var(--mui-palette-primary-main)] font-medium'

export const formDropdownEmptyCls = `px-3.5 py-2 text-sm ${textSoft}`

export const formChipCls = [
  'inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium',
  'bg-[var(--mui-palette-primary-lightOpacity)]',
  textMain,
  'border border-[var(--mui-palette-primary-main)]'
].join(' ')

export const formChipCustomCls = formChipCls

export const formChipBadgeCls = [
  'px-2 py-0.5 rounded-full text-xs',
  'bg-[var(--mui-palette-primary-lightOpacity)]',
  textMain,
  'border border-[var(--mui-palette-primary-main)]'
].join(' ')

export const formCardIconBgCls = 'bg-[var(--mui-palette-primary-lightOpacity)]'

export const formDividerCls = borderDivider

export const formErrorCls = 'text-xs text-[var(--mui-palette-error-main)] mt-1.5'

export const formAlertErrorCls = [
  'px-4 py-3 rounded-lg text-sm',
  'bg-[var(--mui-palette-error-lightOpacity)]',
  'border border-[var(--mui-palette-error-main)]',
  'text-[var(--mui-palette-error-main)]'
].join(' ')

export const formSuccessIconCls = 'text-[var(--mui-palette-success-main)]'

export const formWarningTextCls = 'text-[var(--mui-palette-warning-main)]'

export const formSuccessTextCls = 'text-[var(--mui-palette-success-main)]'

export const formErrorInlineCls = 'text-xs text-[var(--mui-palette-error-main)]'

export const formListItemCls = [
  'flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border',
  borderDivider,
  inputPaper
].join(' ')

export const formSectionTitleCls = `text-sm font-semibold ${textMain}`

export const formChipRemoveBtnCls = [
  'w-5 h-5 flex items-center justify-center rounded-full !cursor-pointer',
  textMain,
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]'
].join(' ')

/** CustomTextField — labels e valores brancos; fundo paper no campo */
export const formTextFieldSx = {
  '& .MuiInputLabel-root': {
    color: 'var(--mui-palette-text-primary)',
    '&.Mui-focused:not(.Mui-error)': {
      color: 'var(--mui-palette-text-primary) !important'
    },
    '&.Mui-error': {
      color: 'var(--mui-palette-error-main)'
    },
    '&.Mui-disabled': {
      color: 'var(--mui-palette-text-disabled)'
    }
  },
  '& .MuiInputBase-root': {
    backgroundColor: 'var(--mui-palette-background-paper) !important',
    borderColor: 'var(--mui-palette-divider)'
  },
  '& .MuiInputBase-input': {
    color: 'var(--mui-palette-text-primary)'
  },
  '& .MuiInputBase-input::placeholder': {
    color: 'var(--mui-palette-text-disabled)',
    opacity: 1
  },
  '& .MuiFormHelperText-root': {
    color: 'var(--mui-palette-text-secondary)'
  }
}

/** Builder */
export const formBuilderShellCls = [inputPaper, 'border-b', borderDivider].join(' ')

export const formBuilderAsideCls = [inputPaper, 'border-[var(--mui-palette-divider)]'].join(' ')

export const formBuilderMainCls = inputPaper

export const formBuilderFieldLabelCls = `text-xs font-medium ${textMain}`

export const formBuilderPanelTitleCls = `font-semibold text-sm ${textMain}`

export const formBuilderSectionTitleCls = `text-xs font-semiboldst ${textSoft}`

export const formBuilderFieldRowCls = [
  'flex items-center gap-3 px-4 py-3 rounded-xl border transition !cursor-pointer',
  inputPaper,
  borderDivider,
  'hover:border-[var(--mui-palette-primary-main)]'
].join(' ')

export const formBuilderFieldRowSelectedCls = [
  'flex items-center gap-3 px-4 py-3 rounded-xl border transition !cursor-pointer',
  inputPaper,
  'border-[var(--mui-palette-primary-main)]',
  'bg-[var(--mui-palette-primary-lightOpacity)]'
].join(' ')

export const formBuilderFieldRowTitleCls = `text-sm font-medium ${textMain} truncate`

export const formBuilderFieldRowMetaCls = `text-xs ${textSoft}`

export const formBuilderEmptyCls = [
  'flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed rounded-2xl',
  borderDivider,
  inputPaper
].join(' ')

export const formBuilderTitleInputCls = [
  'text-lg font-semibold border-none outline-none w-full min-w-0',
  inputPaper,
  textMain,
  'placeholder:text-[var(--mui-palette-text-disabled)]'
].join(' ')

export const formBuilderToggleOffCls = 'bg-[var(--mui-palette-action-disabledBackground)]'

export const formBuilderToggleKnobCls = 'bg-[var(--mui-palette-common-white)]'

export const formBuilderModalCls = [inputPaper, 'rounded-t-2xl sm:rounded-2xl shadow-2xl'].join(' ')

export const formBuilderModalOverlayCls =
  'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--backdrop-color)] backdrop-blur-sm p-0 sm:p-4'

export const formBuilderTypeBtnCls = [
  'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left !cursor-pointer',
  inputPaper,
  borderDivider,
  'hover:border-[var(--mui-palette-primary-main)]',
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]'
].join(' ')

export const formBuilderTypeBtnLabelCls = `text-sm font-medium ${textMain}`

export const formBuilderTypeBtnIconWrapCls = [
  'w-8 h-8 rounded-lg flex items-center justify-center',
  'bg-[var(--mui-palette-primary-lightOpacity)]'
].join(' ')

export const formBuilderIconBtnCls = [
  'w-7 h-7 flex items-center justify-center rounded-lg transition !cursor-pointer',
  textSoft,
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]',
  'hover:text-[var(--mui-palette-text-primary)]'
].join(' ')
