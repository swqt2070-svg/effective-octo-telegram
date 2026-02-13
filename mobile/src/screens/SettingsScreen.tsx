import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../state/AuthContext'
import { colors } from '../theme'

export default function SettingsScreen() {
  const { user, logout } = useAuth()

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.row}>Username: {user?.username}</Text>
        {user?.displayName ? <Text style={styles.row}>Name: {user.displayName}</Text> : null}
        <Text style={styles.row}>ID: {user?.id}</Text>
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
