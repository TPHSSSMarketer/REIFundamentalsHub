'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Avatar } from '@/components/ui/avatar'
import {
  User,
  Building2,
  Key,
  Bell,
  Palette,
  Shield,
  Save,
  ExternalLink,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { data: session } = useSession()
  const [isSaving, setIsSaving] = useState(false)

  const [profile, setProfile] = useState({
    name: session?.user?.name || 'Demo User',
    email: session?.user?.email || 'demo@reihub.com',
    phone: '(555) 123-4567',
    company: 'REI Investments LLC',
  })

  const [ghlSettings, setGhlSettings] = useState({
    apiKey: '••••••••••••••••',
    locationId: 'loc_xxxxxxxxxxxx',
    connected: true,
  })

  const [notifications, setNotifications] = useState({
    newLeads: true,
    dealUpdates: true,
    campaignReports: true,
    supportReplies: true,
    emailNotifications: true,
    smsNotifications: false,
  })

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsSaving(false)
    toast.success('Settings saved!')
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Settings"
        description="Manage your account and preferences"
      />

      <div className="p-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">
              <User className="h-4 w-4 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="integrations">
              <Key className="h-4 w-4 mr-2" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="appearance">
              <Palette className="h-4 w-4 mr-2" />
              Appearance
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>
                  Manage your personal information and company details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <Avatar fallback={profile.name} size="lg" />
                  <div>
                    <Button variant="outline" size="sm">
                      Change Photo
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">
                      JPG, PNG or GIF. Max 2MB.
                    </p>
                  </div>
                </div>

                {/* Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Full Name</label>
                    <Input
                      value={profile.name}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, name: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={profile.email}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Phone</label>
                    <Input
                      value={profile.phone}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, phone: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Company Name</label>
                    <Input
                      value={profile.company}
                      onChange={(e) =>
                        setProfile((prev) => ({ ...prev, company: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Password */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Current Password</label>
                    <Input type="password" placeholder="••••••••" />
                  </div>
                  <div></div>
                  <div>
                    <label className="text-sm font-medium">New Password</label>
                    <Input type="password" placeholder="••••••••" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Confirm New Password</label>
                    <Input type="password" placeholder="••••••••" />
                  </div>
                </div>
                <Button variant="outline">Update Password</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle>GoHighLevel Integration</CardTitle>
                <CardDescription>
                  Connect your GoHighLevel account to sync leads and campaigns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Status */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-full ${
                        ghlSettings.connected ? 'bg-green-100' : 'bg-red-100'
                      }`}
                    >
                      {ghlSettings.connected ? (
                        <Check className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {ghlSettings.connected ? 'Connected' : 'Not Connected'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ghlSettings.connected
                          ? 'Your GHL account is syncing properly'
                          : 'Connect your GHL account to get started'}
                      </p>
                    </div>
                  </div>
                  <Button variant={ghlSettings.connected ? 'outline' : 'default'}>
                    {ghlSettings.connected ? 'Reconnect' : 'Connect'}
                  </Button>
                </div>

                {/* API Settings */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">API Key</label>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        value={ghlSettings.apiKey}
                        onChange={(e) =>
                          setGhlSettings((prev) => ({ ...prev, apiKey: e.target.value }))
                        }
                        className="flex-1"
                      />
                      <Button variant="outline">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Get Key
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Find your API key in GoHighLevel Settings &gt; Business Profile &gt; API
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Location ID</label>
                    <Input
                      value={ghlSettings.locationId}
                      onChange={(e) =>
                        setGhlSettings((prev) => ({ ...prev, locationId: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Save Integration Settings'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Other Integrations */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Other Integrations</CardTitle>
                <CardDescription>Connect additional services</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: 'OpenAI', description: 'AI content generation', connected: true },
                    { name: 'Zapier', description: 'Workflow automation', connected: false },
                    { name: 'Google Calendar', description: 'Appointment sync', connected: false },
                  ].map((integration) => (
                    <div
                      key={integration.name}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{integration.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {integration.description}
                        </p>
                      </div>
                      <Button variant={integration.connected ? 'outline' : 'default'} size="sm">
                        {integration.connected ? 'Connected' : 'Connect'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose what notifications you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {[
                    { key: 'newLeads', label: 'New Leads', description: 'Get notified when new leads come in' },
                    { key: 'dealUpdates', label: 'Deal Updates', description: 'Updates when deals move through the pipeline' },
                    { key: 'campaignReports', label: 'Campaign Reports', description: 'Weekly campaign performance reports' },
                    { key: 'supportReplies', label: 'Support Replies', description: 'When support responds to your tickets' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications[item.key as keyof typeof notifications] as boolean}
                          onChange={(e) =>
                            setNotifications((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-4">Delivery Methods</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Email Notifications</p>
                        <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.emailNotifications}
                          onChange={(e) =>
                            setNotifications((prev) => ({
                              ...prev,
                              emailNotifications: e.target.checked,
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">SMS Notifications</p>
                        <p className="text-sm text-muted-foreground">Receive notifications via SMS</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={notifications.smsNotifications}
                          onChange={(e) =>
                            setNotifications((prev) => ({
                              ...prev,
                              smsNotifications: e.target.checked,
                            }))
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Save Preferences'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>Customize how REI Hub looks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="text-sm font-medium mb-3 block">Theme</label>
                  <div className="grid grid-cols-3 gap-4">
                    {['light', 'dark', 'system'].map((theme) => (
                      <button
                        key={theme}
                        className="p-4 border rounded-lg hover:border-primary transition-colors text-center capitalize"
                      >
                        <div
                          className={`w-full h-20 rounded mb-2 ${
                            theme === 'light'
                              ? 'bg-white border'
                              : theme === 'dark'
                              ? 'bg-gray-900'
                              : 'bg-gradient-to-r from-white to-gray-900'
                          }`}
                        />
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-3 block">Accent Color</label>
                  <div className="flex gap-3">
                    {['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899'].map(
                      (color) => (
                        <button
                          key={color}
                          className="w-10 h-10 rounded-full border-2 border-transparent hover:border-gray-400 transition-colors"
                          style={{ backgroundColor: color }}
                        />
                      )
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button onClick={handleSave} disabled={isSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {isSaving ? 'Saving...' : 'Save Appearance'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
