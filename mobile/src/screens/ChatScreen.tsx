import React, { useEffect, useRef, useState } from 'react'
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../state/AuthContext'
import { colors } from '../theme'
import { appendMessage, loadMessages, upsertChat } from '../store/chatStore'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChatStackParamList } from '../navigation/AppNavigator'

type Props = NativeStackScreenProps<ChatStackParamList, 'Chat'>

export default function ChatScreen({ route }: Props) {
  const { user } = useAuth()
  const { peerId, title } = route.params
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const listRef = useRef<FlatList>(null)

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      const arr = await loadMessages(user.id, peerId)
      setMessages(arr)
    }
    load().catch(() => {})
  }, [user?.id, peerId])

  const send = async () => {
    if (!text.trim() || !user?.id) return
    const msg = { t: 'msg', text: text.trim(), from: user.id, ts: Date.now() }
    setText('')
    const next = [...messages, msg]
    setMessages(next)
    await appendMessage(user.id, peerId, msg)
    await upsertChat(user.id, { peerId, title, lastText: msg.text, lastTs: msg.ts })
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
