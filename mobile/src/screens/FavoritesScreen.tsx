import React from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, Product } from '../api';
import { t } from '../i18n';
import { useLoad, useStore } from '../store';
import { S } from '../theme';
import { Empty, Spinner } from '../components/ui';
import { ProductRow } from './HomeScreen';

export default function FavoritesScreen({ navigation }: any) {
  const { user, favorites } = useStore();
  const res = useLoad(() => user ? api.get<Product[]>('/account/favorites') : favorites.length ? api.get<Product[]>('/catalog/compare', { ids: favorites.join(',') }) : Promise.resolve([] as Product[]), [user?.id, favorites.join(',')]);
  useFocusEffect(React.useCallback(() => { res.reload(); }, [])); // eslint-disable-line
  if (res.loading && !res.data) return <Spinner />;
  return (
    <View style={S.screen}>
      <FlatList data={res.data || []} keyExtractor={p => String(p.id)} contentContainerStyle={S.pad} ListEmptyComponent={<Empty text={t('no_favorites')} />}
        refreshControl={<RefreshControl refreshing={res.loading} onRefresh={res.reload} />}
        renderItem={({ item }) => <ProductRow p={item} onPress={() => navigation.navigate('Product', { id: item.id })} />} />
    </View>
  );
}
