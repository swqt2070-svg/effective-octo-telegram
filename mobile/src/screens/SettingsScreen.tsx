import React, { useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../state/AuthContext'
import { apiPatch, apiPost } from '../api'
import { colors } from '../theme'

export default function SettingsScreen() {
  const { user, token, logout } = useAuth()
  const [username, setUsername] = useState(user?.username || '')
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Profile</Text>
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor={colors.muted}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Display name"
          placeholderTextColor={colors.muted}
          value={displayName}
          onChangeText={setDisplayName}
        />
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={async () => {
            if (!token) return
            try {
              await apiPatch('/users/me', { username: username.trim(), displayName: displayName.trim() || null }, token)
              Alert.alert('Saved', 'Profile updated')
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'request_failed')
            }
          }}
        >
          <Text style={styles.primaryText}>Save profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Change password</Text>
        <TextInput
          style={styles.input}
          placeholder="Current password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={oldPassword}
          onChangeText={setOldPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={async () => {
            if (!token || !oldPassword || !newPassword) return
            try {
              await apiPost('/auth/change-password', { oldPassword, newPassword }, token)
              setOldPassword('')
              setNewPassword('')
              Alert.alert('Updated', 'Password changed')
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'request_failed')
            }
          }}
        >
          <Text style={styles.primaryText}>Update password</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => logout()}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 16 },
  card: {
    backgroundColor: colors.panel,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.stroke,
    padding: 16,
    gap: 8,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 6 },
  row: { color: colors.muted },
  input: {
    backgroundColor: colors.panelAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.stroke,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: { color: '#fff', fontWeight: '700' },
  logoutBtn: {
    backgroundColor: colors.panelAlt,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  logoutText: { color: colors.danger, fontWeight: '700' },
})
