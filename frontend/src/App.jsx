import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Home from './pages/Home';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Register from './pages/Register';

import ClientDashboard from './pages/client/ClientDashboard';
import DeliveryDetail from './pages/client/DeliveryDetail';

import LivreurDashboard from './pages/livreur/LivreurDashboard';
import LivreurDeliveryDetail from './pages/livreur/LivreurDeliveryDetail';

import AdminDashboard from './pages/admin/AdminDashboard';

import SuiviPublic from './pages/public/SuiviPublic';
import BoutiquePublic from './pages/public/BoutiquePublic';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/connexion" element={<Login />} />
          <Route path="/admin-connexion" element={<AdminLogin />} />
          <Route path="/inscription" element={<Register />} />

          {/* Suivi sans app / vitrine boutique : accès public, sans authentification */}
          <Route path="/suivi/:token" element={<SuiviPublic />} />
          <Route path="/boutique/:slug" element={<BoutiquePublic />} />

          <Route path="/client" element={<ProtectedRoute role="client"><ClientDashboard /></ProtectedRoute>} />
          <Route path="/client/livraisons/:id" element={<ProtectedRoute role="client"><DeliveryDetail /></ProtectedRoute>} />

          <Route path="/livreur" element={<ProtectedRoute role="livreur"><LivreurDashboard /></ProtectedRoute>} />
          <Route path="/livreur/livraisons/:id" element={<ProtectedRoute role="livreur"><LivreurDeliveryDetail /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />

          <Route path="*" element={<Home />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
