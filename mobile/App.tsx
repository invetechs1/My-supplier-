import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { StoreProvider, useStore } from './src/store';
import { C } from './src/theme';
import { t } from './src/i18n';
import HomeScreen from './src/screens/HomeScreen';
import ProductScreen from './src/screens/ProductScreen';
import RFQListScreen from './src/screens/RFQListScreen';
import RFQDetailScreen from './src/screens/RFQDetailScreen';
import NewRFQScreen from './src/screens/NewRFQScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import AccountScreen from './src/screens/AccountScreen';
import LoginScreen from './src/screens/LoginScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import PriceListScreen from './src/screens/PriceListScreen';
import CartScreen from './src/screens/CartScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import MyProductsScreen from './src/screens/MyProductsScreen';

export type RootStack = { Tabs: undefined; Product: { id: number }; RFQDetail: { id: number }; NewRFQ: undefined; Login: { mode?: 'login' | 'register' } | undefined; Notifications: undefined; PriceList: undefined; Favorites: undefined; MyProducts: undefined };
const Stack = createNativeStackNavigator<RootStack>();
const Tab = createBottomTabNavigator();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: C.primary, background: C.canvas, card: '#fff', text: C.ink, border: C.line } };
const icon = (e: string) => ({ tabBarIcon: () => <Text style={{ fontSize: 18 }}>{e}</Text> });

function Tabs() {
  const { user, unread, cartCount } = useStore();
  return (
    <Tab.Navigator screenOptions={{ headerStyle: { backgroundColor: C.deep }, headerTintColor: '#fff', tabBarActiveTintColor: C.primary, tabBarLabelStyle: { fontWeight: '700' } }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: t('prices'), ...icon('🏗️') }} />
      <Tab.Screen name="RFQs" component={RFQListScreen} options={{ title: user?.role === 'supplier' ? t('open_rfqs') : t('rfq'), ...icon('📋') }} />
      {(!user || user.role === 'buyer') && <Tab.Screen name="Cart" component={CartScreen} options={{ title: t('cart'), ...icon('🛒'), tabBarBadge: cartCount > 0 ? cartCount : undefined }} />}
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: t('orders'), ...icon('📦') }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ title: t('me'), ...icon('👤'), tabBarBadge: unread > 0 ? unread : undefined }} />
    </Tab.Navigator>
  );
}

function Root() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: C.deep }, headerTintColor: '#fff' }}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Product" component={ProductScreen} options={{ title: t('prices') }} />
      <Stack.Screen name="RFQDetail" component={RFQDetailScreen} options={{ title: t('rfq') }} />
      <Stack.Screen name="NewRFQ" component={NewRFQScreen} options={{ title: t('new_rfq') }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: t('login') }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('notifications') }} />
      <Stack.Screen name="PriceList" component={PriceListScreen} options={{ title: t('price_list') }} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: t('favorites') }} />
      <Stack.Screen name="MyProducts" component={MyProductsScreen} options={{ title: t('my_products') }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <NavigationContainer theme={theme}>
        <StatusBar style="light" />
        <Root />
      </NavigationContainer>
    </StoreProvider>
  );
}
