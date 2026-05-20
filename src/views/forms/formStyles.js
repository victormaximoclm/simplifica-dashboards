/**
 * Estilos do módulo de formulários (somente este módulo).
 * Paleta MUI: textos brancos, botões primary + contrastText, inputs em background-paper.
 */

const cursor = 'cursor-pointer'

const textWhite = 'text-[var(--mui-palette-common-white)]'
const textWhiteSoft = 'text-[var(--mui-palette-text-secondary)]'
const inputPaper = 'bg-[var(--mui-palette-background-paper)]'
const borderDivider = 'border-[var(--mui-palette-divider)]'

/** Base visual de todos os botões do módulo */
const btnFormBase = [
  'inline-flex items-center justify-center font-medium transition-colors rounded-lg',
  cursor,
  'text-[var(--mui-palette-primary-contrastText)]',
  'bg-[var(--mui-palette-primary-main)]',
  'hover:bg-[var(--mui-palette-primary-dark)]',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
  'shadow-[var(--mui-customShadows-primary-sm)]'
].join(' ')

export const btnPrimary = [btnFormBase, 'gap-2 px-4 py-2 text-sm'].join(' ')

export const btnPrimarySm = [btnFormBase, 'gap-1.5 px-4 py-1.5 text-xs shrink-0'].join(' ')

/** Alias — mesmo padrão laranja + texto branco */
export const btnPrimarySoft = btnPrimarySm
export const btnSecondary = btnPrimarySm
export const btnDangerSoft = btnPrimarySm

export const btnIcon = [btnFormBase, 'w-8 h-8 shrink-0'].join(' ')

export const btnDashed = [btnFormBase, 'gap-2 w-full py-3 text-sm'].join(' ')

export const inputFocus =
  'focus:outline-none focus:border-[var(--mui-palette-primary-main)] focus:ring-1 focus:ring-[var(--mui-palette-primary-main)]'

export const formTitleCls = `text-2xl font-semibold ${textWhite}`

export const formHeadingCls = `text-xl sm:text-2xl font-semibold ${textWhite}`

export const formSubtitleCls = `text-sm ${textWhiteSoft}`

export const formMutedCls = `text-sm ${textWhiteSoft}`

export const formCaptionCls = `text-xs ${textWhiteSoft}`

export const formIconMutedCls = `text-[var(--mui-palette-text-disabled)]`

export const formLabelCls = `block text-sm font-medium ${textWhite} mb-1.5`

export const formCheckboxLabelCls = `text-sm ${textWhite}`

export const formRequiredCls = 'text-[var(--mui-palette-error-main)] ml-1'

export const formFieldsWrapCls = 'w-full max-w-2xl mx-auto'

export const formInputCls = [
  'w-full px-3 py-2 rounded-lg border text-sm transition',
  inputPaper,
  borderDivider,
  textWhite,
  'placeholder:text-[var(--mui-palette-text-disabled)]',
  inputFocus
].join(' ')

export const formInputReadonlyCls = [formInputCls, 'cursor-not-allowed opacity-90'].join(' ')

export const formCardCls = [inputPaper, 'border', borderDivider, 'rounded-xl'].join(' ')

export const formSectionCls = [inputPaper, 'border', borderDivider, 'rounded-xl p-5'].join(' ')

export const formPageCls = 'p-4 sm:p-6 max-w-full'

export const formDropdownCls = [
  'absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg shadow-lg py-1',
  'border border-[var(--mui-palette-primary-main)]',
  '!bg-[var(--mui-palette-background-default)]'
].join(' ')

export const formDropdownItemCls = [
  'w-full text-left px-3 py-2 text-sm !cursor-pointer transition-colors',
  textWhite,
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]'
].join(' ')

export const formDropdownAddCls = [
  'w-full text-left px-3 py-2 text-sm !cursor-pointer transition-colors flex items-center gap-2',
  textWhite,
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]'
].join(' ')

export const formChipCls = [
  'inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full text-xs font-medium',
  'bg-[var(--mui-palette-primary-lightOpacity)]',
  textWhite,
  'border border-[var(--mui-palette-primary-main)]'
].join(' ')

export const formChipCustomCls = formChipCls

export const formChipBadgeCls = [
  'px-2 py-0.5 rounded-full text-xs',
  'bg-[var(--mui-palette-primary-lightOpacity)]',
  textWhite,
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

export const formSectionTitleCls = `text-sm font-semibold ${textWhite}`

export const formChipRemoveBtnCls = [
  'w-5 h-5 flex items-center justify-center rounded-full !cursor-pointer',
  textWhite,
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]'
].join(' ')

/** CustomTextField — labels e valores brancos; fundo paper no campo */
export const formTextFieldSx = {
  '& .MuiInputLabel-root': {
    color: 'var(--mui-palette-common-white)',
    '&.Mui-focused:not(.Mui-error)': {
      color: 'var(--mui-palette-common-white) !important'
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
    color: 'var(--mui-palette-common-white)'
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

export const formBuilderFieldLabelCls = `text-xs font-medium ${textWhite} uppercase tracking-wide`

export const formBuilderPanelTitleCls = `font-semibold text-sm ${textWhite}`

export const formBuilderSectionTitleCls = `text-xs font-semibold uppercase tracking-widest ${textWhiteSoft}`

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

export const formBuilderFieldRowTitleCls = `text-sm font-medium ${textWhite} truncate`

export const formBuilderFieldRowMetaCls = `text-xs ${textWhiteSoft}`

export const formBuilderEmptyCls = [
  'flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed rounded-2xl',
  borderDivider,
  inputPaper
].join(' ')

export const formBuilderTitleInputCls = [
  'text-lg font-semibold border-none outline-none w-full min-w-0',
  inputPaper,
  textWhite,
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

export const formBuilderTypeBtnLabelCls = `text-sm font-medium ${textWhite}`

export const formBuilderTypeBtnIconWrapCls = [
  'w-8 h-8 rounded-lg flex items-center justify-center',
  'bg-[var(--mui-palette-primary-lightOpacity)]'
].join(' ')

export const formBuilderIconBtnCls = [
  'w-7 h-7 flex items-center justify-center rounded-lg transition !cursor-pointer',
  textWhiteSoft,
  'hover:bg-[var(--mui-palette-primary-lighterOpacity)]',
  'hover:text-[var(--mui-palette-common-white)]'
].join(' ')
