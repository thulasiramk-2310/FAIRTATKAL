import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MockIRCTC from './components/MockIRCTC'
import AdminDashboard from './components/AdminDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MockIRCTC />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}
