import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../lib/theme';

export default function TextField({ label, style, inputStyle, ...inputProps }) {
  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.slate400}
        style={[styles.input, inputStyle]}
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.slate700, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.slate900,
    backgroundColor: colors.white,
  },
});
