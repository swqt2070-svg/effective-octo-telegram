import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiGet } from '../api'
import { useAuth } from '../state/AuthContext'
import { colors } from '../theme'
import { listChats, upsertChat, ChatItem } from '../store/chatStore'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChatStackParamList } from '../navigation/AppNavigator'

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatList'>

export default function ChatListScreen({ navigation }: Props) {
  const { token, user } = useAuth()
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [chats, setChats] = useState<ChatItem[]>([])

  const load = async () => {
    if (!user?.id) return
    const list = await listChats(user.id)
    setChats(list)
  }

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {})
    }, [user?.id])
  )

  useEffect(() => {
    load().catch(() => {})
  }, [user?.id])

  useEffect(() => {
    if (!token || !user?.id) return
    apiGet('/contacts/aliases', token).then(async (r) => {
      const list = r.aliases || []
      for (const a of list) {
        await upsertChat(user.id, { peerId: a.peerUserId, alias: a.alias })
      }
      await load()
    }).catch(() => {})
  }, [token, user?.id])

  const onFind = async () => {
    if (!search.trim()) return
    try {
      setLoading(true)
      const r = await apiGet(`/users/lookup?q=${encodeURIComponent(search.trim())}`, token || undefined)
      const u = r.user
      const title = u.username
      await upsertChat(user!.id, { peerId: u.id, title, lastText: '', lastTs: Date.now() })
      await load()
      navigation.navigate('Chat', { peerId: u.id, title })
      setSearch('')
    } catch (e: any) {
      Alert.alert('User not found', e?.message || 'not_found')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search username / id"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={onFind} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchBtnText}>Find</Text>}
        </TouchableOpacity>
      </View>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.peerId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const title = item.alias || item.title || item.peerId
          const preview = item.lastText || 'No messages yet'
          return (
            <TouchableOpacity
              style={styles.chatItem}
              onPress={() => navigation.navigate('Chat', { peerId: item.peerId, title })}
            >
              <View style={styles.avatar}><Text style={styles.avatarText}>{title.slice(0, 1).toUpperCase()}</Text></View>
              <View style={styles.chatMain}>
                <Text style={styles.chatTitle}>{title}</Text>
                <Text style={styles.chatPreview} numberOfLines={1}>{preview}</Text>
              </View>
            </TouchableOpacity>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No chats yet. Find a user to start.</Text>}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: {
    flex: 1,
    backgroundColor: colors.panelAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 12,
    color: colors.text,
  },
  searchBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  list: { paddingTop: 16, gap: 10 },
  chatItem: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700' },
  chatMain: { flex: 1 },
  chatTitle: { color: colors.text, fontWeight: '700', marginBottom: 4 },
  chatPreview: { color: colors.muted },
  empty: { color: colors.muted, paddingTop: 24, textAlign: 'center' },
})
