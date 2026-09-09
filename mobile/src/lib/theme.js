// Palette et constantes de style partagées, alignées sur le thème Tailwind du
// site web (orange-500 en couleur d'accent, tons "slate" pour le texte/fond).
export const colors = {
  orange50: '#fff7ed',
  orange100: '#ffedd5',
  orange400: '#fb923c',
  orange500: '#f97316',
  orange600: '#ea580c',
  orange700: '#c2410c',

  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1e293b',
  slate900: '#0f172a',

  white: '#ffffff',

  red50: '#fef2f2',
  red600: '#dc2626',
  red700: '#b91c1c',

  green50: '#f0fdf4',
  green100: '#dcfce7',
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d',
  green800: '#166534',

  amber50: '#fffbeb',
  amber100: '#fef3c7',
  amber700: '#b45309',
  amber800: '#92400e',

  blue100: '#dbeafe',
  blue800: '#1e40af',

  purple100: '#f3e8ff',
  purple800: '#6b21a8',

  indigo50: '#eef2ff',
  indigo100: '#e0e7ff',
  indigo600: '#4f46e5',
  indigo700: '#4338ca',
  indigo900: '#312e81',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, full: 999 };

export const shadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
