import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import NewDeliveryScreen from '../screens/client/NewDeliveryScreen';
import MyDeliveriesScreen from '../screens/client/MyDeliveriesScreen';
import DeliveryDetailScreen from '../screens/client/DeliveryDetailScreen';
import { colors } from '../lib/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function NouvelleStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NewDelivery" component={NewDeliveryScreen} />
    </Stack.Navigator>
  );
}

function MesLivraisonsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyDeliveries" component={MyDeliveriesScreen} />
      <Stack.Screen name="DeliveryDetail" component={DeliveryDetailScreen} />
    </Stack.Navigator>
  );
}

// Espace client : deux onglets, comme les deux sections de
// frontend/src/pages/client/ClientDashboard.jsx ("Nouvelle livraison" et
// "Mes livraisons"), mais ici de vrais onglets natifs en bas d'écran.
export default function ClientNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.orange600,
        tabBarInactiveTintColor: colors.slate400,
        tabBarStyle: { borderTopColor: colors.slate200 },
      }}
    >
      <Tab.Screen
        name="NouvelleTab"
        component={NouvelleStack}
        options={{ title: 'Nouvelle', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>➕</Text> }}
      />
      <Tab.Screen
        name="MesLivraisonsTab"
        component={MesLivraisonsStack}
        options={{ title: 'Mes livraisons', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📦</Text> }}
      />
    </Tab.Navigator>
  );
}
