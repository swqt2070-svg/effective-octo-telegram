import React, { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { apiGet, apiPost } from '../api'
import { useAuth } from '../state/AuthContext'
import { colors } from '../theme'
import { upsertChat } from '../store/chatStore'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChatStackParamList } from '../navigation/AppNavigator'

type Props = NativeStackScreenProps<ChatStackParamList, 'CreateGroup'>

export default function CreateGroupScreen({ navigation }: Props) {
  const { token, user } = useAuth()
  const [name, setName] = useState('')
  const [members, setMembers] = useState('')
  const [loading, setLoading] = useState(false)

  const create = async () => {
    if (!name.trim() || !token || !user?.id) return
    try {
      setLoading(true)
      const names = members.split(',').map(s => s.trim()).filter(Boolean)
      const ids: string[] = []
      for (const n of names) {
        try {
          const r = await apiGet(`/users/lookup?q=${encodeURIComponent(n)}`, token)
          if (r.user?.id) ids.push(r.user.id)
        } catch {}
      }
      const r = await apiPost('/groups', { name: name.trim(), memberIds: ids }, token)
      const g = r.group
      await upsertChat(user.id, {
        peerId: `group:${g.id}`,
        title: g.name,
        isGroup: true,
        groupId: g.id,
        lastText: '',
        lastTs: Date.now(),
      })
      navigation.replace('Chat', { peerId: `group:${g.id}`, title: g.name, isGroup: true, groupId: g.id })
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'request_failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Group name</Text>
      <TextInput
        style={styles.input}
        placeholder="My group"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
      />
      <Text style={styles.label}>Members (usernames, comma separated)</Text>
      <TextInput
        style={styles.input}
        placeholder="alice, bob, charlie"
        placeholderTextColor={colors.muted}
        value={members}
        onChangeText={setMembers}
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={create} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create</Text>}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 12 },
  label: { color: colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    backgroundColor: colors.panelAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: { color: '#fff', fontWeight: '700' },
})
