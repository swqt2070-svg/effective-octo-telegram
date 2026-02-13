import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../state/AuthContext'
import { colors } from '../theme'
import { apiGet, apiPost } from '../api'
import { appendMessage, loadMessages, upsertChat } from '../store/chatStore'
import { ensureDeviceSetup } from '../utils/deviceSetup'
import { Buffer } from 'buffer'
import {
  newStoreForDevice,
  makeLibSignalStore,
  makeAddress,
  buildSessionFromBundle,
  encryptToAddress,
  decryptFromAddress,
} from '../signal/signal'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChatStackParamList } from '../navigation/AppNavigator'

type Props = NativeStackScreenProps<ChatStackParamList, 'Chat'>

export default function ChatScreen({ route }: Props) {
  const { user, token } = useAuth()
  const { peerId, title } = route.params
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const listRef = useRef<FlatList>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)

  const store = useMemo(() => (user?.id && deviceId ? newStoreForDevice(user.id, deviceId) : null), [user?.id, deviceId])
  const lsStore = useMemo(() => (store ? makeLibSignalStore(store) : null), [store])

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      const arr = await loadMessages(user.id, peerId)
      setMessages(arr)
    }
    load().catch(() => {})
  }, [user?.id, peerId])

  useEffect(() => {
    if (!token || !user?.id) return
    ensureDeviceSetup(token, user).then((id) => {
      if (id) setDeviceId(id)
    }).catch(() => {})
  }, [token, user?.id])

  useEffect(() => {
    let t: any
    const poll = async () => {
      if (!token || !deviceId || !lsStore || !user?.id) return
      try {
        const r = await apiGet(`/messages/pending?deviceId=${encodeURIComponent(deviceId)}&limit=200`, token)
        for (const env of r.messages || []) {
          try {
            const packed = decodeCiphertext(env.ciphertext)
            const bodyB64 = extractBodyB64(packed)
            const addr = makeAddress(env.senderUserId, env.senderDeviceId)
            const plain = await decryptFromAddress(lsStore, addr, { type: packed.type, bodyB64 })
            await appendMessage(user.id, env.senderUserId, { ...plain, _ts: Date.parse(env.createdAt) })
            await upsertChat(user.id, {
              peerId: env.senderUserId,
              title: plain.fromUsername || env.senderUserId,
              lastText: plain.text || '(msg)',
              lastTs: Date.parse(env.createdAt),
            })
            if (env.senderUserId === peerId) {
              const arr = await loadMessages(user.id, peerId)
              setMessages(arr)
            }
          } catch {}
        }
      } finally {
        t = setTimeout(poll, 2500)
      }
    }
    poll()
    return () => { if (t) clearTimeout(t) }
  }, [token, deviceId, lsStore, user?.id, peerId])

  async function buildEnvelopes(recipientUserId: string, payload: any, excludeDeviceIds: string[] = []) {
    if (!token || !lsStore) return []
    const devs = await apiGet(`/users/${encodeURIComponent(recipientUserId)}/devices`, token)
    const envelopes = []
    for (const d of devs.devices || []) {
      if (excludeDeviceIds.includes(d.id)) continue
      const b = await apiGet(`/keys/bundle?userId=${encodeURIComponent(recipientUserId)}&deviceId=${encodeURIComponent(d.id)}`, token)
      const addr = makeAddress(recipientUserId, d.id)
      await buildSessionFromBundle(lsStore, addr, b.bundle)
      const enc = await encryptToAddress(lsStore, addr, payload)
      const packed = Buffer.from(JSON.stringify({ type: enc.type, bodyB64: enc.bodyB64 })).toString('base64')
      envelopes.push({ recipientDeviceId: d.id, ciphertext: packed })
    }
    return envelopes
  }

  const send = async () => {
    if (!text.trim() || !user?.id || !token || !deviceId || !lsStore) return
    const msg = { t: 'msg', text: text.trim(), from: user.id, fromUsername: user.username, ts: Date.now() }
    setText('')
    await appendMessage(user.id, peerId, msg)
    const arr = await loadMessages(user.id, peerId)
    setMessages(arr)
    await upsertChat(user.id, { peerId, title, lastText: msg.text, lastTs: msg.ts })

    try {
      const exclude = peerId === user.id ? [deviceId] : []
      const envelopes = await buildEnvelopes(peerId, msg, exclude)
      if (envelopes.length) {
        await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId: peerId, envelopes }, token)
      }
    } catch {}
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding', android: undefined })}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, idx) => String(idx)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.from === user?.id
          return (
            <View style={[styles.bubble, mine ? styles.out : styles.in]}>
              <Text style={styles.bubbleText}>{item.text}</Text>
              <Text style={styles.time}>{new Date(item.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function decodeCiphertext(ciphertext: string) {
  if (!ciphertext) throw new Error('empty ciphertext')
  const norm = (s: string) => {
    const cleaned = String(s).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
    const pad = cleaned.length % 4
    return pad ? cleaned + '='.repeat(4 - pad) : cleaned
  }
  try {
    return JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf-8'))
  } catch {
    return JSON.parse(Buffer.from(norm(ciphertext), 'base64').toString('utf-8'))
  }
}

function extractBodyB64(packed: any) {
  if (!packed || typeof packed !== 'object') return null
  if (typeof packed.bodyB64 === 'string' && packed.bodyB64.length) return packed.bodyB64
  if (typeof packed.body === 'string' && packed.body.length) return packed.body
  if (packed.body && Array.isArray(packed.body.data)) return Buffer.from(packed.body.data).toString('base64')
  if (Array.isArray(packed.body)) return Buffer.from(packed.body).toString('base64')
  if (packed.ciphertext && typeof packed.ciphertext === 'string') return packed.ciphertext
  return null
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 14,
  },
  out: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent,
  },
  in: {
    alignSelf: 'flex-start',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.stroke,
  },
  bubbleText: { color: '#fff' },
  time: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4, textAlign: 'right' },
  composer: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.stroke,
    backgroundColor: colors.panelAlt,
  },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 12,
    color: colors.text,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
})
