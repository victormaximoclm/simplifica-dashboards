// Third-party Imports
import { configureStore, createSlice } from '@reduxjs/toolkit'

// Placeholder slice until real slices are added
const appSlice = createSlice({
  name: 'app',
  initialState: {},
  reducers: {}
})

export const store = configureStore({
  reducer: {
    app: appSlice.reducer
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false })
})
