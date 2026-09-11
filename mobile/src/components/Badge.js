import { StyleSheet, Text, View } from 'react-native';
import { STATUS_CONFIG, ZONE_LABELS, paymentBadge } from '../lib/labels';

function BaseBadge({ label, bg, fg, border }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

// Badge générique (label/couleurs libres) — pour les cas qui n'ont pas leur
// propre variante dédiée (ex: "Groupée", "Retour en cours").
export function Badge(props) {
  return <BaseBadge {...props} />;
}

export function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status, bg: '#f1f5f9', fg: '#475569', border: '#e2e8f0' };
  return <BaseBadge {...cfg} />;
}

export function PaymentBadge({ status }) {
  return <BaseBadge {...paymentBadge(status)} />;
}

export function ZoneBadge({ zone }) {
  return <BaseBadge label={ZONE_LABELS[zone] || zone} bg="#f1f5f9" fg="#334155" border="#e2e8f0" />;
}

export function DelaiBadge({ delaiGaranti }) {
  if (delaiGaranti) {
    return <BaseBadge label="⏱️ 30 min garanties" bg="#dcfce7" fg="#166534" border="#bbf7d0" />;
  }
  return <BaseBadge label="⚠️ Délai non garanti" bg="#fef3c7" fg="#92400e" border="#fde68a" />;
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
