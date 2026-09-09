import { createContext, useContext, useEffect, useState } from 'react';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('cc_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/users/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('cc_token'))
      .finally(() => setLoading(false));
  }, []);

  function saveSession(token, user) {
    localStorage.setItem('cc_token', token);
    setUser(user);
  }

  function logout() {
    localStorage.removeItem('cc_token');
    setUser(null);
  }

  async function login(phone, password) {
    const res = await api.post('/auth/login', { phone, password });
    saveSession(res.data.token, res.data.user);
    return res.data.user;
  }

  async function loginAdmin(email, password) {
    const res = await api.post('/auth/login-admin', { email, password });
    saveSession(res.data.token, res.data.user);
    return res.data.user;
  }

  async function register(payload) {
    const res = await api.post('/auth/register', payload);
    saveSession(res.data.token, res.data.user);
    return res.data.user;
  }

  async function refreshUser() {
    const res = await api.get('/users/me');
    setUser(res.data.user);
    return res.data.user;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginAdmin, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
