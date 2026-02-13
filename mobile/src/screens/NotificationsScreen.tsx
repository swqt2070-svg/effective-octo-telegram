import React, { useEffect, useState } from 'react'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme'
import { clearNotifications, listNotifications, NotificationItem } from '../store/notificationsStore'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChatStackParamList } from '../navigation/AppNavigator'

type Props = NativeStackScreenProps<ChatStackParamList, 'Notifications'>

export default function NotificationsScreen({ navigation }: Props) {
  const [items, setItems] = useState<NotificationItem[]>([])

  const load = async () => {
    const list = await listNotifications()
    setItems(list)
  }

  useEffect(() => {
    load().catch(() => {})
  }, [])

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.clearBtn}
        onPress={async () => {
          await clearNotifications()
          await load()
        }}
      >
        <Text style={styles.clearText}>Clear</Text>
      </TouchableOpacity>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Chat', { peerId: item.peerId, title: item.title })}
          >
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.text} numberOfLines={1}>{item.text}</Text>
            <Text style={styles.time}>
              {new Date(item.ts).toLocaleString()}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No notifications.</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  clearBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.panelAlt,
  },
  clearText: { color: colors.text, fontWeight: '600' },
  list: { paddingTop: 12, gap: 10 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: 12,
    gap: 4,
  },
  title: { color: colors.text, fontWeight: '700' },
  text: { color: colors.muted },
  time: { color: colors.muted, fontSize: 11 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
})
