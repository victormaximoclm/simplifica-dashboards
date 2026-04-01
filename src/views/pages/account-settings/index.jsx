'use client'

// React Imports
import { useState } from 'react'

// MUI Imports
import Tab from '@mui/material/Tab'
import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel from '@mui/lab/TabPanel'
import Grid from '@mui/material/Grid'

// Component Imports
import AccountTab from './AccountTab'
import SecurityTab from './SecurityTab'

const AccountSettings = ({ userData }) => {
  // States
  const [activeTab, setActiveTab] = useState('account')

  const handleChange = (event, value) => {
    setActiveTab(value)
  }

  return (
    <TabContext value={activeTab}>
      <Grid container spacing={6}>
        <Grid item xs={12}>
          <TabList onChange={handleChange} variant='scrollable'>
            <Tab icon={<i className='tabler-user' />} value='account' label='Conta' iconPosition='start' />
            <Tab icon={<i className='tabler-lock' />} value='security' label='Segurança' iconPosition='start' />
          </TabList>
        </Grid>
        <Grid item xs={12}>
          <TabPanel value='account' className='p-0'>
            <AccountTab userData={userData} />
          </TabPanel>
          <TabPanel value='security' className='p-0'>
            <SecurityTab />
          </TabPanel>
        </Grid>
      </Grid>
    </TabContext>
  )
}

export default AccountSettings
