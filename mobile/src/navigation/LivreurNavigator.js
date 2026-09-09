import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LivreurHomeScreen from '../screens/livreur/LivreurHomeScreen';
import LivreurDeliveryDetailScreen from '../screens/livreur/LivreurDeliveryDetailScreen';

const Stack = createNativeStackNavigator();

// Espace livreur : un écran d'accueil unique (disponibilité, document,
// gains, onglets internes disponibles/mes courses/historique — voir
// LivreurHomeScreen) qui pousse vers le détail d'une course.
export default function LivreurNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LivreurHome" component={LivreurHomeScreen} />
      <Stack.Screen name="LivreurDeliveryDetail" component={LivreurDeliveryDetailScreen} />
    </Stack.Navigator>
  );
}
