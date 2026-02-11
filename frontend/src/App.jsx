import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './state/auth.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import DeviceSetup from './pages/DeviceSetup.jsx'
import Chat from './pages/Chat.jsx'
import Admin from './pages/Admin.jsx'
import QrDesktop from './pages/QrDesktop.jsx'
import QrMobileApprove from './pages/QrMobileApprove.jsx'
import SmartKey from './pages/SmartKey.jsx'
import SmartKeyLogin from './pages/SmartKeyLogin.jsx'
import SmartKeyApprove from './pages/SmartKeyApprove.jsx'
import SmartKeyBind from './pages/SmartKeyBind.jsx'

function Guard({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/qr" element={<QrDesktop />} />
        <Route path="/qr/approve" element={<Guard><QrMobileApprove /></Guard>} />
        <Route path="/smartkey" element={<Guard><SmartKey /></Guard>} />
        <Route path="/smartkey/login" element={<SmartKeyLogin />} />
        <Route path="/smartkey/approve" element={<SmartKeyApprove />} />
        <Route path="/smartkey/bind" element={<SmartKeyBind />} />
        <Route path="/device" element={<Guard><DeviceSetup /></Guard>} />
        <Route path="/chat" element={<Guard><Chat /></Guard>} />
        <Route path="/admin" element={<Guard><Admin /></Guard>} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </AuthProvider>
  )
}
