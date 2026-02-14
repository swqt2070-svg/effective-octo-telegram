import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiGet } from '../api'
import { useAuth } from '../state/AuthContext'
import { colors } from '../theme'
import { listChats, upsertChat, ChatItem, appendMessage, deleteChat } from '../store/chatStore'
import { addNotification } from '../store/notificationsStore'
import { ensureDeviceSetup } from '../utils/deviceSetup'
import { getActivePeer } from '../utils/session'
import { newStoreForDevice, makeLibSignalStore, makeAddress, decryptFromAddress } from '../signal/signal'
import { decodeCiphertext, extractBodyB64 } from '../utils/messageHelpers'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChatStackParamList } from '../navigation/AppNavigator'

type Props = NativeStackScreenProps<ChatStackParamList, 'ChatList'>

export default function ChatListScreen({ navigation }: Props) {
  const { token, user } = useAuth()
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [chats, setChats] = useState<ChatItem[]>([])
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)

  const store = useMemo(() => (user?.id && deviceId ? newStoreForDevice(user.id, deviceId) : null), [user?.id, deviceId])
  const lsStore = useMemo(() => (store ? makeLibSignalStore(store) : null), [store])

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
    ensureDeviceSetup(token, user).then((id) => {
      if (id) setDeviceId(id)
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (!deviceError) {
        setDeviceError(msg || 'device_setup_failed')
        Alert.alert('Device setup failed', msg || 'Unknown error')
      }
    })
  }, [token, user?.id])

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

  useEffect(() => {
    if (!token || !user?.id) return
    apiGet('/groups', token).then(async (r) => {
      const list = r.groups || []
      for (const g of list) {
        await upsertChat(user.id, {
          peerId: `group:${g.id}`,
          title: g.name,
          isGroup: true,
          groupId: g.id,
          lastText: '',
          lastTs: 0,
        })
      }
      await load()
    }).catch(() => {})
  }, [token, user?.id])

  useEffect(() => {
    let t: any
    const poll = async () => {
      if (!token || !deviceId || !lsStore || !user?.id) {
        t = setTimeout(poll, 2500)
        return
      }
      try {
        const r = await apiGet(`/messages/pending?deviceId=${encodeURIComponent(deviceId)}&limit=200`, token)
        const activePeer = await getActivePeer()
        for (const env of r.messages || []) {
          let peerId = env.senderUserId
          try {
            const packed = decodeCiphertext(env.ciphertext)
            const bodyB64 = extractBodyB64(packed)
            const addr = makeAddress(env.senderUserId, env.senderDeviceId)
            const plain = await decryptFromAddress(lsStore, addr, { type: packed.type, bodyB64 })
            if (plain?.t === 'control' && plain.action === 'delete_chat' && plain.peerId) {
              // drop chat locally
              // do not use server call; just clear local messages
              await deleteChat(user.id, plain.peerId)
              continue
            }
            if (plain?.groupId) {
              peerId = `group:${plain.groupId}`
              const preview = plain.text || (plain.t === 'file' ? (plain.file?.name || 'file') : '(msg)')
              await upsertChat(user.id, {
                peerId,
                title: plain.groupName || 'Group',
                isGroup: true,
                groupId: plain.groupId,
                lastText: preview,
                lastTs: Date.parse(env.createdAt),
              })
            } else {
              await upsertChat(user.id, {
                peerId,
                title: plain.fromUsername || peerId,
                lastText: plain.text || '(msg)',
                lastTs: Date.parse(env.createdAt),
              })
            }
            await appendMessage(user.id, peerId, { ...plain, _ts: Date.parse(env.createdAt) })
            if (activePeer !== peerId) {
              await addNotification({
                id: env.id,
                peerId,
                title: plain.fromUsername || peerId,
                text: plain.text || (plain.t === 'file' ? (plain.file?.name || 'file') : 'message'),
                ts: Date.parse(env.createdAt),
              })
            }
          } catch {
            await appendMessage(user.id, peerId, { t: 'sys', text: '[decrypt failed]', ts: Date.now() })
          }
        }
        await load()
      } catch {
        // ignore
      } finally {
        t = setTimeout(poll, 2500)
      }
    }
    poll()
    return () => { if (t) clearTimeout(t) }
  }, [token, deviceId, lsStore, user?.id])

  const onFind = async () => {
    if (!search.trim()) return
    try {
      setLoading(true)
      const r = await apiGet(`/users/lookup?q=${encodeURIComponent(search.trim())}`, token || undefined)
      const u = r.user
      const title = u.username
      await upsertChat(user!.id, { peerId: u.id, title, lastText: '', lastTs: Date.now(), isGroup: false })
      await load()
      navigation.navigate('Chat', { peerId: u.id, title, isGroup: false })
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

      <View style={styles.quickRow}>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => {
            if (!user?.id) return
            const peerId = user.id
            const title = 'Saved messages'
            upsertChat(user.id, { peerId, title, lastText: '', lastTs: 0 }).then(load)
            navigation.navigate('Chat', { peerId, title, isGroup: false })
          }}
        >
          <Text style={styles.quickText}>Saved</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => navigation.navigate('CreateGroup')}
        >
          <Text style={styles.quickText}>New group</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Text style={styles.quickText}>Notifications</Text>
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
              onPress={() => navigation.navigate('Chat', { peerId: item.peerId, title, isGroup: !!item.isGroup, groupId: item.groupId || undefined })}
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
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickBtn: {
    flex: 1,
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickText: { color: colors.text, fontWeight: '600', fontSize: 12 },
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
