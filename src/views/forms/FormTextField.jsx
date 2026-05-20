'use client'

import CustomTextField from '@core/components/mui/TextField'

import { formTextFieldSx } from './formStyles'

const FormTextField = ({ sx, ...props }) => (
  <CustomTextField {...props} sx={{ ...formTextFieldSx, ...sx }} />
)

export default FormTextField
