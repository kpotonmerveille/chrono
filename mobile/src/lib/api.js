import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// URL de base de l'API backend Chrono (suffixe /api inclus), configurable via
// la variable d'environnement Expo publique EXPO_PUBLIC_API_URL — voir
// mobile/.env.example. Valeur par défaut raisonnable pour le développement,
// À ADAPTER selon votre configuration (voir le README).
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

// Clé de stockage du token JWT dans AsyncStorage (équivalent mobile du
// localStorage utilisé côté web, indisponible en React Native).
export const TOKEN_KEY = 'chrono_token';

const api = axios.create({ baseURL: API_URL });

// Ajoute automatiquement le token d'authentification (s'il existe) à chaque
// requête, comme l'intercepteur de frontend/src/lib/api.js côté web.
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiErrorMessage(err) {
  return err?.response?.data?.error || 'Une erreur est survenue. Réessayez.';
}

export default api;
