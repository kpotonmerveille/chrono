import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { TOKEN_KEY } from '../lib/api';

const AuthContext = createContext(null);

// Équivalent mobile de frontend/src/context/AuthContext.jsx : mêmes noms de
// fonctions (login, register, logout, refreshUser) pour rester cohérent avec
// le style du reste du produit, mais le token est stocké dans AsyncStorage
// (localStorage n'existe pas en React Native).
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        if (!token) {
          setLoading(false);
          return;
        }
        const res = await api.get('/users/me');
        setUser(res.data.user);
      } catch {
        await AsyncStorage.removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function saveSession(token, sessionUser) {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    setUser(sessionUser);
  }

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  async function login(phone, password) {
    const res = await api.post('/auth/login', { phone, password });
    await saveSession(res.data.token, res.data.user);
    return res.data.user;
  }

  async function register(payload) {
    const res = await api.post('/auth/register', payload);
    await saveSession(res.data.token, res.data.user);
    return res.data.user;
  }

  const refreshUser = useCallback(async () => {
    const res = await api.get('/users/me');
    setUser(res.data.user);
    return res.data.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
