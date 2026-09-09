import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, radius } from '../lib/theme';

export default function PrimaryButton({ title, onPress, loading, disabled, variant = 'primary', style }) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[styles.base, VARIANTS[variant], isDisabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.orange600 : colors.white} />
      ) : (
        <Text style={[styles.label, variant === 'outline' && styles.labelOutline, variant === 'dark' && styles.labelDark]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const VARIANTS = StyleSheet.create({
  primary: { backgroundColor: colors.orange500 },
  dark: { backgroundColor: colors.slate900 },
  outline: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate300 },
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  label: { color: colors.white, fontWeight: '700', fontSize: 15 },
  labelOutline: { color: colors.slate700 },
  labelDark: { color: colors.white },
});
