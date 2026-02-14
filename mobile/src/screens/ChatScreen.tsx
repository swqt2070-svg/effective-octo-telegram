import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import DocumentPicker from 'react-native-document-picker'
import RNFS from 'react-native-fs'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Buffer } from 'buffer'

import { useAuth } from '../state/AuthContext'
import { colors } from '../theme'
import { apiGet, apiPost, apiPostForm, apiGetBuffer } from '../api'
import { appendMessage, deleteChat, loadMessages, upsertChat } from '../store/chatStore'
import { ensureDeviceSetup } from '../utils/deviceSetup'
import { setActivePeer } from '../utils/session'
import { aesGcmDecrypt, aesGcmEncrypt } from '../utils/crypto'
import {
  newStoreForDevice,
  makeLibSignalStore,
  makeAddress,
  buildSessionFromBundle,
  encryptToAddress,
} from '../signal/signal'
import type { ChatStackParamList } from '../navigation/AppNavigator'

type Props = NativeStackScreenProps<ChatStackParamList, 'Chat'>

const EMOJIS = ['😀', '😂', '😍', '👍', '🔥', '🎉', '😅', '😎', '🤝', '🙏', '❤️', '😴']

export default function ChatScreen({ navigation, route }: Props) {
  const { user, token } = useAuth()
  const { peerId, title, isGroup, groupId } = route.params
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState('')
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<any | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchHits, setSearchHits] = useState<number[]>([])
  const [searchIndex, setSearchIndex] = useState(0)
  const [aliasOpen, setAliasOpen] = useState(false)
  const [aliasDraft, setAliasDraft] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [fileBusy, setFileBusy] = useState(false)
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
  const fileCacheRef = useRef(new Map<string, string>())
  const listRef = useRef<FlatList>(null)

  const reportSendError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    Alert.alert('Send failed', msg || 'Unknown error')
    console.warn('send error', err)
  }

  const store = useMemo(() => (user?.id && deviceId ? newStoreForDevice(user.id, deviceId) : null), [user?.id, deviceId])
  const lsStore = useMemo(() => (store ? makeLibSignalStore(store) : null), [store])

  useFocusEffect(
    React.useCallback(() => {
      setActivePeer(peerId).catch(() => {})
      return () => { setActivePeer(null).catch(() => {}) }
    }, [peerId])
  )

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      const arr = await loadMessages(user.id, peerId)
      setMessages(arr)
    }
    load().catch(() => {})
    const t = setInterval(() => load().catch(() => {}), 1500)
    return () => clearInterval(t)
  }, [user?.id, peerId])

  useEffect(() => {
    if (!token || !user?.id) return
    ensureDeviceSetup(token, user).then((id) => {
      if (id) setDeviceId(id)
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      setDeviceError(msg || 'device_setup_failed')
      Alert.alert('Device setup failed', msg || 'Unknown error')
    })
  }, [token, user?.id])

  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchHits([])
    setSearchIndex(0)
    setReplyTo(null)
  }, [peerId])

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setSearchOpen(v => !v)} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>🔍</Text>
          </TouchableOpacity>
          {!isGroup && peerId !== user?.id && (
            <TouchableOpacity onPress={() => { setAliasDraft(''); setAliasOpen(true) }} style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>✏️</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Chat', 'Choose action', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: isGroup ? 'Leave group' : 'Delete chat',
                  style: 'destructive',
                  onPress: () => handleDeleteChat(),
                },
              ])
            }}
            style={styles.headerBtn}
          >
            <Text style={styles.headerBtnText}>⋯</Text>
          </TouchableOpacity>
        </View>
      ),
    })
  }, [navigation, isGroup, peerId, user?.id])

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchHits([])
      setSearchIndex(0)
      return
    }
    const q = searchQuery.trim().toLowerCase()
    const hits: number[] = []
    messages.forEach((m, idx) => {
      const t = (m?.text || m?.file?.name || '').toLowerCase()
      if (t.includes(q)) hits.push(idx)
    })
    setSearchHits(hits)
    setSearchIndex(0)
  }, [searchOpen, searchQuery, messages])

  const { rows, msgIndexMap } = useMemo(() => {
    const out: any[] = []
    const map = new Map<number, number>()
    let lastDay = ''
    messages.forEach((m, idx) => {
      const ts = m?._ts || m?.ts || Date.now()
      const dayKey = new Date(ts).toDateString()
      if (dayKey !== lastDay) {
        out.push({ type: 'date', ts })
        lastDay = dayKey
      }
      map.set(idx, out.length)
      out.push({ type: 'msg', msg: m, idx })
    })
    return { rows: out, msgIndexMap: map }
  }, [messages])

  useEffect(() => {
    if (!searchHits.length) return
    const msgIdx = searchHits[Math.max(0, Math.min(searchIndex, searchHits.length - 1))]
    const rowIdx = msgIndexMap.get(msgIdx)
    if (rowIdx === undefined) return
    try {
      listRef.current?.scrollToIndex({ index: rowIdx, viewPosition: 0.5 })
    } catch {}
  }, [searchHits, searchIndex, msgIndexMap])

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

  async function sendPayload(targetPeer: string, payload: any, previewText: string) {
    if (!user?.id) return
    await appendMessage(user.id, targetPeer, payload)
    const arr = await loadMessages(user.id, targetPeer)
    setMessages(arr)
    await upsertChat(user.id, { peerId: targetPeer, title, lastText: previewText, lastTs: payload.ts || Date.now(), isGroup, groupId })
  }

  async function sendControl(recipientUserId: string, payload: any, excludeDeviceIds: string[] = []) {
    if (!deviceId || !token || !lsStore) return
    const envelopes = await buildEnvelopes(recipientUserId, payload, excludeDeviceIds)
    if (envelopes.length) {
      await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId, envelopes }, token)
    }
  }

  const send = async () => {
    if (!text.trim()) return
    if (!user?.id || !token || !deviceId || !lsStore) {
      const msg = deviceError
        ? `Device setup failed: ${deviceError}`
        : 'Device setup is still in progress. Try again in a moment.'
      Alert.alert('Not ready', msg)
      return
    }
    const ts = Date.now()
    const payload: any = { t: isGroup ? 'group' : 'msg', text: text.trim(), from: user.id, fromUsername: user.username, ts }
    if (isGroup) {
      payload.groupId = groupId
      payload.groupName = title
    }
    if (replyTo) payload.reply = { ...replyTo }
    setText('')
    setReplyTo(null)

    if (isGroup && groupId) {
      try {
        await sendGroupMessage(payload, `[group] ${payload.text}`)
      } catch (err) {
        reportSendError(err)
      }
    } else {
      await sendPayload(peerId, payload, payload.text)
      try {
        const exclude = peerId === user.id ? [deviceId] : []
        const envelopes = await buildEnvelopes(peerId, payload, exclude)
        if (envelopes.length) {
          await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId: peerId, envelopes }, token)
        }
      } catch (err) {
        reportSendError(err)
      }
    }
  }

  async function sendGroupMessage(payload: any, preview: string) {
    if (!groupId || !user?.id || !token || !deviceId) return
    const groupPeer = `group:${groupId}`
    await sendPayload(groupPeer, payload, preview)
    try {
      const members = await apiGet(`/groups/${encodeURIComponent(groupId)}/members`, token)
      const users = members.members || []
      for (const u of users) {
        if (u.id === user.id) continue
        try {
          const envelopes = await buildEnvelopes(u.id, payload)
          if (envelopes.length) {
            await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId: u.id, envelopes }, token)
          }
        } catch (err) {
          reportSendError(err)
        }
      }
      await sendControl(user.id, payload, [deviceId])
    } catch (err) {
      reportSendError(err)
    }
  }

  async function pickFiles() {
    if (!token || !user?.id) return
    try {
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
        allowMultiSelection: true,
        copyTo: 'cachesDirectory',
      })
      await sendFiles(res)
    } catch {}
  }

  async function sendFiles(files: DocumentPicker.DocumentPickerResponse[]) {
    if (!token || !user?.id || !deviceId || !lsStore) return
    setFileBusy(true)
    try {
      for (const file of files) {
        if (file.size && file.size > 50 * 1024 * 1024) {
          await appendMessage(user.id, peerId, { t: 'sys', text: `[file too large] ${file.name}`, ts: Date.now() })
          continue
        }
        const fileUri = file.fileCopyUri || file.uri
        const path = fileUri.startsWith('file://') ? fileUri.replace('file://', '') : fileUri
        const base64 = await RNFS.readFile(path, 'base64')
        const buf = Buffer.from(base64, 'base64')
        const enc = await aesGcmEncrypt(buf.buffer)
        const tmpPath = `${RNFS.CachesDirectoryPath}/lm_${Date.now()}_${file.name || 'file'}.bin`
        await RNFS.writeFile(tmpPath, Buffer.from(enc.cipherBuf).toString('base64'), 'base64')

        const uploadFor = async (recipientUserId: string) => {
          const fd = new FormData()
          fd.append('file', {
            uri: `file://${tmpPath}`,
            type: 'application/octet-stream',
            name: 'payload.bin',
          } as any)
          fd.append('recipientUserId', recipientUserId)
          fd.append('kind', 'MESSAGE')
          fd.append('originalName', file.name || 'file')
          fd.append('mime', file.type || 'application/octet-stream')
          return apiPostForm('/files/upload', fd, token)
        }

        const basePayload: any = {
          t: 'file',
          file: {
            name: file.name || 'file',
            mime: file.type || 'application/octet-stream',
            size: file.size || 0,
            key: enc.keyB64,
            iv: enc.ivB64,
          },
          from: user.id,
          fromUsername: user.username,
          ts: Date.now(),
        }
        if (replyTo) basePayload.reply = { ...replyTo }

        if (isGroup && groupId) {
          const groupPeer = `group:${groupId}`
          // upload for self to view locally
          const selfFile = await uploadFor(user.id)
          const selfPayload = { ...basePayload, groupId, groupName: title, file: { ...basePayload.file, id: selfFile.file.id } }
          await sendPayload(groupPeer, selfPayload, `[file] ${selfPayload.file.name}`)
          await sendControl(user.id, selfPayload, [deviceId])

          // send to other members
          const members = await apiGet(`/groups/${encodeURIComponent(groupId)}/members`, token)
          const users = members.members || []
          for (const u of users) {
            if (u.id === user.id) continue
            try {
              const r = await uploadFor(u.id)
              const payload = { ...basePayload, groupId, groupName: title, file: { ...basePayload.file, id: r.file.id } }
              const envelopes = await buildEnvelopes(u.id, payload)
              if (envelopes.length) {
                await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId: u.id, envelopes }, token)
              }
            } catch (err) {
              reportSendError(err)
            }
          }
        } else {
          const r = await uploadFor(peerId)
          const payload = { ...basePayload, file: { ...basePayload.file, id: r.file.id } }
          await sendPayload(peerId, payload, `[file] ${payload.file.name}`)
          const exclude = peerId === user.id ? [deviceId] : []
          try {
            const envelopes = await buildEnvelopes(peerId, payload, exclude)
            if (envelopes.length) {
              await apiPost('/messages/send', { senderDeviceId: deviceId, recipientUserId: peerId, envelopes }, token)
            }
          } catch (err) {
            reportSendError(err)
          }
        }
      }
    } catch (err) {
      reportSendError(err)
    } finally {
      setFileBusy(false)
      setReplyTo(null)
    }
  }

  async function ensureFileUrl(m: any, idx: number) {
    const key = messageKey(m, idx)
    if (fileCacheRef.current.has(key)) return fileCacheRef.current.get(key)
    const data = await apiGetBuffer(`/files/${m.file.id}`, token || undefined)
    const plain = await aesGcmDecrypt(data, m.file.key, m.file.iv)
    const outPath = `${RNFS.CachesDirectoryPath}/lm_${m.file.id}_${m.file.name || 'file'}`
    await RNFS.writeFile(outPath, Buffer.from(plain).toString('base64'), 'base64')
    const uri = `file://${outPath}`
    fileCacheRef.current.set(key, uri)
    setFileUrls(prev => ({ ...prev, [key]: uri }))
    return uri
  }

  async function handleDeleteChat() {
    if (!user?.id || !token || !deviceId) return
    if (isGroup && groupId) {
      try { await apiPost(`/groups/${encodeURIComponent(groupId)}/leave`, {}, token) } catch {}
      await deleteChat(user.id, `group:${groupId}`)
      navigation.goBack()
      return
    }
    await deleteChat(user.id, peerId)
    try { await apiPost('/messages/delete-conversation', { peerUserId: peerId }, token) } catch {}
    const ts = Date.now()
    try {
      await sendControl(peerId, { t: 'control', action: 'delete_chat', peerId: user.id, ts, from: user.id, fromUsername: user.username })
    } catch {}
    try {
      await sendControl(user.id, { t: 'control', action: 'delete_chat', peerId, ts, from: user.id, fromUsername: user.username }, [deviceId])
    } catch {}
    navigation.goBack()
  }

  const hitSet = useMemo(() => new Set(searchHits), [searchHits])

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.select({ ios: 'padding', android: undefined })}>
      {searchOpen && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search in chat"
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Text style={styles.searchCount}>
            {searchHits.length ? `${Math.min(searchIndex + 1, searchHits.length)}/${searchHits.length}` : '0'}
          </Text>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => searchHits.length && setSearchIndex((i) => (i - 1 + searchHits.length) % searchHits.length)}
          >
            <Text style={styles.headerBtnText}>↑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => searchHits.length && setSearchIndex((i) => (i + 1) % searchHits.length)}
          >
            <Text style={styles.headerBtnText}>↓</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(_, idx) => String(idx)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          if (item.type === 'date') {
            return (
              <View style={styles.dateDivider}>
                <Text style={styles.dateText}>{new Date(item.ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
              </View>
            )
          }
          const m = item.msg
          const msgIdx = item.idx
          const mine = m?.from === user?.id
          const isSys = m?.t === 'sys'
          const showSender = isGroup && !isSys
          const senderName = mine ? 'You' : (m?.fromUsername || m?.from || '')
          const hit = hitSet.has(msgIdx)
          const ts = m?._ts || m?.ts
          return (
            <View style={[styles.msgRow, mine ? styles.outRow : styles.inRow]}>
              {m?.t === 'file' ? (
                <TouchableOpacity
                  onPress={() => !isSys && setReplyTo({ from: m.from, fromUsername: m.fromUsername, text: m.file?.name || 'file', ts })}
                  style={[styles.bubble, mine ? styles.out : styles.in, hit && styles.hit]}
                >
                  {m.reply && (
                    <View style={styles.replyChip}>
                      <Text style={styles.replyAuthor}>{m.reply.fromUsername || m.reply.from}</Text>
                      <Text style={styles.replyText} numberOfLines={1}>{m.reply.text || ''}</Text>
                    </View>
                  )}
                  {showSender && <Text style={styles.sender}>{senderName}</Text>}
                  <Text style={styles.fileName}>{m.file?.name || 'file'}</Text>
                  <Text style={styles.fileSize}>{m.file?.size ? `${Math.round(m.file.size / 1024)} KB` : ''}</Text>
                  <View style={styles.fileActions}>
                    <TouchableOpacity
                      style={styles.fileBtn}
                      onPress={async () => {
                        try {
                          const uri = await ensureFileUrl(m, msgIdx)
                          Alert.alert('Saved', uri)
                        } catch {}
                      }}
                    >
                      <Text style={styles.fileBtnText}>Download</Text>
                    </TouchableOpacity>
                  </View>
                  {fileUrls[messageKey(m, msgIdx)] && m.file?.mime?.startsWith('image/') && (
                    <Image source={{ uri: fileUrls[messageKey(m, msgIdx)] }} style={styles.imagePreview} />
                  )}
                  <Text style={styles.time}>{formatTime(ts)}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => !isSys && setReplyTo({ from: m.from, fromUsername: m.fromUsername, text: m.text || '', ts })}
                  style={[styles.bubble, mine ? styles.out : styles.in, isSys && styles.sys, hit && styles.hit]}
                >
                  {m.reply && (
                    <View style={styles.replyChip}>
                      <Text style={styles.replyAuthor}>{m.reply.fromUsername || m.reply.from}</Text>
                      <Text style={styles.replyText} numberOfLines={1}>{m.reply.text || ''}</Text>
                    </View>
                  )}
                  {showSender && <Text style={styles.sender}>{senderName}</Text>}
                  <Text style={styles.bubbleText}>{m.text}</Text>
                  <Text style={styles.time}>{formatTime(ts)}</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet.</Text>}
      />

      {emojiOpen && (
        <View style={styles.emojiRow}>
          {EMOJIS.map(em => (
            <TouchableOpacity key={em} onPress={() => { setText(t => t + em); setEmojiOpen(false) }}>
              <Text style={styles.emoji}>{em}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {replyTo && (
        <View style={styles.replyBar}>
          <View style={styles.replyLine} />
          <View style={{ flex: 1 }}>
            <Text style={styles.replyAuthor}>{replyTo.fromUsername || replyTo.from}</Text>
            <Text style={styles.replyText} numberOfLines={1}>{replyTo.text}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)}>
            <Text style={styles.replyClose}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.composer}>
        <TouchableOpacity style={styles.iconBtn} onPress={pickFiles} disabled={fileBusy}>
          <Text style={styles.iconText}>📎</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setEmojiOpen(v => !v)}>
          <Text style={styles.iconText}>😊</Text>
        </TouchableOpacity>
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

      <Modal visible={aliasOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Local name</Text>
            <TextInput
              style={styles.input}
              placeholder="Set local name"
              placeholderTextColor={colors.muted}
              value={aliasDraft}
              onChangeText={setAliasDraft}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={async () => {
                  if (!token || !user?.id) return
                  const alias = aliasDraft.trim()
                  try {
                    await apiPost('/contacts/alias', { peerUserId: peerId, alias }, token)
                  } catch {}
                  await upsertChat(user.id, { peerId, alias })
                  setAliasOpen(false)
                }}
              >
                <Text style={styles.sendText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setAliasOpen(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

function messageKey(m: any, idx: number) {
  const ts = m?._ts || m?.ts
  if (m?.file?.id) return `${m.file.id}:${ts || idx}`
  return `${ts || idx}:${m.from || ''}`
}

function formatTime(ts: number) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  msgRow: { marginBottom: 8, flexDirection: 'row' },
  outRow: { justifyContent: 'flex-end' },
  inRow: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 14,
  },
  out: { backgroundColor: colors.accent },
  in: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.stroke },
  sys: { borderStyle: 'dashed', borderColor: colors.danger },
  hit: { borderWidth: 2, borderColor: colors.accent },
  bubbleText: { color: '#fff' },
  time: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 4, textAlign: 'right' },
  sender: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 24 },
  composer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.stroke,
    backgroundColor: colors.panelAlt,
    alignItems: 'center',
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
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panel,
  },
  iconText: { fontSize: 16 },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  emoji: { fontSize: 22, padding: 4 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.stroke,
    backgroundColor: colors.panelAlt,
  },
  replyLine: { width: 3, height: 28, backgroundColor: colors.accent, borderRadius: 10 },
  replyAuthor: { color: colors.text, fontWeight: '700', fontSize: 12 },
  replyText: { color: colors.muted, fontSize: 12 },
  replyClose: { color: colors.muted, fontSize: 16 },
  replyChip: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    backgroundColor: colors.panelAlt,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 6,
  },
  dateDivider: { alignItems: 'center', marginVertical: 8 },
  dateText: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    backgroundColor: colors.panelAlt,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.stroke,
    backgroundColor: colors.panelAlt,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 10,
    color: colors.text,
  },
  searchCount: { color: colors.muted, width: 48, textAlign: 'center' },
  headerActions: { flexDirection: 'row', gap: 8, paddingRight: 6 },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.panelAlt,
  },
  headerBtnText: { color: colors.text },
  fileName: { color: colors.text, fontWeight: '700' },
  fileSize: { color: colors.muted, fontSize: 12 },
  fileActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  fileBtn: {
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.panelAlt,
  },
  fileBtnText: { color: colors.text, fontSize: 12 },
  imagePreview: { width: 180, height: 120, borderRadius: 10, marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: colors.panel, borderRadius: 16, borderWidth: 1, borderColor: colors.stroke, padding: 16, gap: 12 },
  modalTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  modalActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.stroke,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: { color: colors.text },
})
