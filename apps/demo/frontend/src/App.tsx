import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Queue from './pages/Queue'
import Workspaces from './pages/Workspaces'
import Analytics from './pages/Analytics'
import Admin from './pages/Admin'
import Layout from './components/Layout'
import { createPageUrl } from './utils'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to={createPageUrl('Dashboard')} replace />} />
          <Route path={createPageUrl('Dashboard')} element={<Dashboard />} />
          <Route path={createPageUrl('Upload')} element={<Upload />} />
          <Route path={createPageUrl('Queue')} element={<Queue />} />
          <Route path={createPageUrl('Workspaces')} element={<Workspaces />} />
          <Route path={createPageUrl('Analytics')} element={<Analytics />} />
          <Route path={createPageUrl('Admin')} element={<Admin />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App


