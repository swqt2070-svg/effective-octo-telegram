import React from 'react'
import { NavigationContainer, DarkTheme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useAuth } from '../state/AuthContext'
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import ChatListScreen from '../screens/ChatListScreen'
import ChatScreen from '../screens/ChatScreen'
import SettingsScreen from '../screens/SettingsScreen'
import CreateGroupScreen from '../screens/CreateGroupScreen'
import NotificationsScreen from '../screens/NotificationsScreen'

export type AuthStackParamList = {
  Login: undefined
  Register: undefined
}

export type ChatStackParamList = {
  ChatList: undefined
  Chat: { peerId: string; title: string; isGroup?: boolean; groupId?: string }
  CreateGroup: undefined
  Notifications: undefined
}

const AuthStack = createNativeStackNavigator<AuthStackParamList>()
const ChatStack = createNativeStackNavigator<ChatStackParamList>()
const Tabs = createBottomTabNavigator()

function ChatStackNavigator() {
  return (
    <ChatStack.Navigator>
      <ChatStack.Screen name="ChatList" component={ChatListScreen} options={{ title: 'Chats' }} />
      <ChatStack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params.title })} />
      <ChatStack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ title: 'New group' }} />
      <ChatStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
    </ChatStack.Navigator>
  )
}

function AppTabs() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Chats" component={ChatStackNavigator} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  )
}

export default function AppNavigator() {
  const { token } = useAuth()

  return (
    <NavigationContainer theme={DarkTheme}>
      {token ? (
        <AppTabs />
      ) : (
        <AuthStack.Navigator>
          <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <AuthStack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create account' }} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  )
}
