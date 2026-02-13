import React, { useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../state/AuthContext'
import { colors } from '../theme'

export default function RegisterScreen() {
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async () => {
    if (!username || !password) {
      Alert.alert('Missing data', 'Username and password are required.')
      return
    }
    try {
      setLoading(true)
      await register({
        username: username.trim(),
        password,
        displayName: displayName.trim() || undefined,
        inviteCode: inviteCode.trim() || undefined,
      })
    } catch (e: any) {
      Alert.alert('Register failed', e?.message || 'request_failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Create account</Text>

        <TextInput
          placeholder="Username"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={username}
          autoCapitalize="none"
          onChangeText={setUsername}
        />
        <TextInput
          placeholder="Display name (optional)"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor={colors.muted}
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          placeholder="Invite code (if required)"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={inviteCode}
          onChangeText={setInviteCode}
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={onSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Register</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: 24,
    gap: 12,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: colors.panelAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '700' },
})
