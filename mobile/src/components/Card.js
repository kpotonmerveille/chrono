import { StyleSheet, View } from 'react-native';
import { colors, radius, shadow } from '../lib/theme';

export default function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.slate100,
    padding: 16,
    ...shadow,
  },
});
