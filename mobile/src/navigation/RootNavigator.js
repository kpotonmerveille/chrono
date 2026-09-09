import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { colors } from '../lib/theme';
import AuthNavigator from './AuthNavigator';
import ClientNavigator from './ClientNavigator';
import LivreurNavigator from './LivreurNavigator';

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.orange500} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? <AuthNavigator /> : user.role === 'livreur' ? <LivreurNavigator /> : <ClientNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.orange50 },
});
