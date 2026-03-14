import { useState, useEffect } from 'react'
import {
  Building2,
  Globe,
  Users,
  FileText,
  ToggleLeft,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Loader2,
  ChevronRight,
  Bot,
  Phone,
} from 'lucide-react'
import { toast } from 'sonner'
import { useBusinessStore } from '@/hooks/useBusinessStore'
import { getAgents, type AiAgent } from '@/services/voiceAiApi'
import { getNumbers } from '@/services/phoneApi'
import {
  listBusinesses,
  createBusiness,
  updateBusiness,
  deleteBusiness,
  listWordPressSites,
  addWordPressSite,
  updateWordPressSite,
  deleteWordPressSite,
  listAudienceSegments,
  createAudienceSegment,
  updateAudienceSegment,
  deleteAudienceSegment,
  listContentTypes,
  createContentType,
  updateContentType,
  deleteContentType,
  getModuleSettings,
  updateModuleSetting,
  type Business,
  type BusinessWordPressSite,
  type AudienceSegment,
  type ContentType,
  type ModuleBusinessSetting,
} from '@/services/businessApi'

type Section = 'businesses' | 'wordpress' | 'avatars' | 'content' | 'modules'

export default function BusinessSettings() {
  const { currentBusiness, setCurrentBusiness, businesses, setBusinesses } = useBusinessStore()
  const [activeSection, setActiveSection] = useState<Section>('businesses')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAllBusinesses()
  }, [])

  async function loadAllBusinesses() {
    try {
      setLoading(true)
      const data = await listBusinesses()
      setBusinesses(data.businesses)
      if (!currentBusiness && data.businesses.length > 0) {
        setCurrentBusiness(data.businesses[0])
      }
    } catch (err) {
      toast.error('Failed to load businesses')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar Navigation */}
      <div className="w-48 flex-shrink-0">
        <nav className="space-y-1">
          {[
            { id: 'businesses' as Section, label: 'Businesses', icon: Building2 },
            { id: 'wordpress' as Section, label: 'WordPress', icon: Globe },
            { id: 'avatars' as Section, label: 'Avatars', icon: Users },
            { id: 'content' as Section, label: 'Content Types', icon: FileText },
            { id: 'modules' as Section, label: 'Module Access', icon: ToggleLeft },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === item.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content Area */}
      <div className="flex-1">
        {activeSection === 'businesses' && <BusinessProfilesSection />}
        {activeSection === 'wordpress' && <WordPressSitesSection />}
        {activeSection === 'avatars' && <AudienceSegmentsSection />}
        {activeSection === 'content' && <ContentTypesSection />}
        {activeSection === 'modules' && <ModuleAccessSection />}
      </div>
    </div>
  )
}

// ============================================================================
// Section 1: Business Profiles
// ============================================================================

function BusinessProfilesSection() {
  const { businesses, setBusinesses, currentBusiness, setCurrentBusiness } = useBusinessStore()
  const [isCreating, setIsCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [newBusiness, setNewBusiness] = useState({ name: '', description: '', mission_statement: '' })
  const [editForm, setEditForm] = useState<Partial<Business> | null>(null)

  async function handleCreate() {
    if (!newBusiness.name.trim()) {
      toast.error('Business name is required')
      return
    }
    setIsSaving(true)
    try {
      const created = await createBusiness(newBusiness)
      setBusinesses([...businesses, created])
      setCurrentBusiness(created)
      setNewBusiness({ name: '', description: '', mission_statement: '' })
      setIsCreating(false)
      toast.success('Business created successfully')
    } catch (err) {
      toast.error('Failed to create business')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveEdit(businessId: string) {
    if (!editForm || !editForm.name?.trim()) {
      toast.error('Business name is required')
      return
    }
    setIsSaving(true)
    try {
      const updated = await updateBusiness(businessId, editForm)
      setBusinesses(businesses.map((b) => (b.id === businessId ? updated : b)))
      if (currentBusiness?.id === businessId) {
        setCurrentBusiness(updated)
      }
      setEditingId(null)
      toast.success('Business updated successfully')
    } catch (err) {
      toast.error('Failed to update business')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(businessId: string) {
    if (!confirm('Are you sure you want to delete this business?')) return
    setIsSaving(true)
    try {
      await deleteBusiness(businessId)
      setBusinesses(businesses.filter((b) => b.id !== businessId))
      if (currentBusiness?.id === businessId) {
        setCurrentBusiness(businesses.find((b) => b.id !== businessId) || null)
      }
      toast.success('Business deleted successfully')
    } catch (err) {
      toast.error('Failed to delete business')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-slate-800">Business Profiles</h2>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create New Business
          </button>
        )}
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-4">New Business</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
              <input
                type="text"
                value={newBusiness.name}
                onChange={(e) => setNewBusiness({ ...newBusiness, name: e.target.value })}
                placeholder="e.g., Main Investment Company"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={newBusiness.description}
                onChange={(e) => setNewBusiness({ ...newBusiness, description: e.target.value })}
                placeholder="Brief description..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Mission Statement
              </label>
              <textarea
                value={newBusiness.mission_statement}
                onChange={(e) =>
                  setNewBusiness({ ...newBusiness, mission_statement: e.target.value })
                }
                placeholder="Your business mission..."
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <button
                onClick={handleCreate}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Create
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false)
                  setNewBusiness({ name: '', description: '', mission_statement: '' })
                }}
                disabled={isSaving}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Businesses List */}
      <div className="space-y-3">
        {businesses.map((business) => (
          <div
            key={business.id}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
          >
            {editingId === business.id ? (
              // Edit Mode
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={editForm?.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={editForm?.description || ''}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Mission Statement
                  </label>
                  <textarea
                    value={editForm?.mission_statement || ''}
                    onChange={(e) =>
                      setEditForm({ ...editForm, mission_statement: e.target.value })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleSaveEdit(business.id)}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null)
                      setEditForm(null)
                    }}
                    disabled={isSaving}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              // View Mode
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-semibold text-slate-800">{business.name}</h3>
                    {business.is_primary && (
                      <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        Primary
                      </span>
                    )}
                  </div>
                  {business.description && (
                    <p className="text-sm text-slate-600 mb-2">{business.description}</p>
                  )}
                  {business.mission_statement && (
                    <p className="text-xs text-slate-500 italic">
                      Mission: {business.mission_statement}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => {
                      setEditingId(business.id)
                      setEditForm({
                        name: business.name,
                        description: business.description,
                        mission_statement: business.mission_statement,
                      })
                    }}
                    className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(business.id)}
                    disabled={isSaving}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {businesses.length === 0 && !isCreating && (
        <div className="text-center py-12">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600 mb-4">No businesses yet. Create one to get started.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create First Business
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Section 2: WordPress Sites
// ============================================================================

function WordPressSitesSection() {
  const { currentBusiness } = useBusinessStore()
  const [sites, setSites] = useState<BusinessWordPressSite[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newSite, setNewSite] = useState({
    label: '',
    wp_url: '',
    wp_username: '',
    wp_app_password: '',
  })
  const [editForm, setEditForm] = useState<Partial<BusinessWordPressSite> | null>(null)

  useEffect(() => {
    if (currentBusiness?.id) {
      loadSites()
    }
  }, [currentBusiness?.id])

  async function loadSites() {
    if (!currentBusiness?.id) return
    try {
      setLoading(true)
      const data = await listWordPressSites(currentBusiness.id)
      setSites(data.sites)
    } catch (err) {
      toast.error('Failed to load WordPress sites')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddSite() {
    if (!currentBusiness?.id) {
      toast.error('Select a business first')
      return
    }
    if (
      !newSite.label.trim() ||
      !newSite.wp_url.trim() ||
      !newSite.wp_username.trim() ||
      !newSite.wp_app_password.trim()
    ) {
      toast.error('All fields are required')
      return
    }
    setIsSaving(true)
    try {
      const created = await addWordPressSite(currentBusiness.id, newSite)
      setSites([...sites, created])
      setNewSite({ label: '', wp_url: '', wp_username: '', wp_app_password: '' })
      setIsAdding(false)
      toast.success('WordPress site added successfully')
    } catch (err) {
      toast.error('Failed to add WordPress site')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveEdit(siteId: string) {
    if (!currentBusiness?.id || !editForm) return
    setIsSaving(true)
    try {
      const updated = await updateWordPressSite(currentBusiness.id, siteId, editForm)
      setSites(sites.map((s) => (s.id === siteId ? updated : s)))
      setEditingId(null)
      toast.success('WordPress site updated successfully')
    } catch (err) {
      toast.error('Failed to update WordPress site')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(siteId: string) {
    if (!currentBusiness?.id) return
    if (!confirm('Are you sure you want to delete this WordPress site?')) return
    setIsSaving(true)
    try {
      await deleteWordPressSite(currentBusiness.id, siteId)
      setSites(sites.filter((s) => s.id !== siteId))
      toast.success('WordPress site deleted successfully')
    } catch (err) {
      toast.error('Failed to delete WordPress site')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  if (!currentBusiness?.id) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">WordPress Sites</h2>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <p className="text-slate-600 mb-2">Select a business first</p>
          <p className="text-sm text-slate-500">Current business: {currentBusiness?.name}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">WordPress Sites</h2>
          <p className="text-sm text-slate-600 mt-1">Business: {currentBusiness.name}</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add WordPress Site
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {/* Add Form */}
          {isAdding && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-4">New WordPress Site</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Site Label
                  </label>
                  <input
                    type="text"
                    value={newSite.label}
                    onChange={(e) => setNewSite({ ...newSite, label: e.target.value })}
                    placeholder="e.g., Main Blog"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    WordPress URL
                  </label>
                  <input
                    type="url"
                    value={newSite.wp_url}
                    onChange={(e) => setNewSite({ ...newSite, wp_url: e.target.value })}
                    placeholder="https://yoursite.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={newSite.wp_username}
                    onChange={(e) => setNewSite({ ...newSite, wp_username: e.target.value })}
                    placeholder="WordPress username"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Application Password
                  </label>
                  <input
                    type="password"
                    value={newSite.wp_app_password}
                    onChange={(e) =>
                      setNewSite({ ...newSite, wp_app_password: e.target.value })
                    }
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Generate in WordPress Settings → Application Passwords
                  </p>
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleAddSite}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Add Site
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsAdding(false)
                      setNewSite({
                        label: '',
                        wp_url: '',
                        wp_username: '',
                        wp_app_password: '',
                      })
                    }}
                    disabled={isSaving}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sites List */}
          <div className="space-y-3">
            {sites.map((site) => (
              <div
                key={site.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
              >
                {editingId === site.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Site Label
                      </label>
                      <input
                        type="text"
                        value={editForm?.label || ''}
                        onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        WordPress URL
                      </label>
                      <input
                        type="url"
                        value={editForm?.wp_url || ''}
                        onChange={(e) => setEditForm({ ...editForm, wp_url: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        value={editForm?.wp_username || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, wp_username: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleSaveEdit(site.id)}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Save
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null)
                          setEditForm(null)
                        }}
                        disabled={isSaving}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-slate-800 mb-1">{site.label}</h3>
                      <p className="text-sm text-slate-600 flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        {site.wp_url}
                      </p>
                      {site.is_active && (
                        <span className="inline-block mt-2 bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => {
                          setEditingId(site.id)
                          setEditForm({
                            label: site.label,
                            wp_url: site.wp_url,
                            wp_username: site.wp_username,
                          })
                        }}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(site.id)}
                        disabled={isSaving}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {sites.length === 0 && !isAdding && (
            <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-slate-200">
              <Globe className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">No WordPress sites configured yet.</p>
              <button
                onClick={() => setIsAdding(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add First Site
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// Section 3: Audience Segments (Customer Avatars)
// ============================================================================

function AudienceSegmentsSection() {
  const { currentBusiness } = useBusinessStore()
  const [segments, setSegments] = useState<AudienceSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newSegment, setNewSegment] = useState({
    name: '',
    description: '',
    pain_points: '',
    goals: '',
    tone: '',
    demographics: '',
    persona_id: '' as string,
    phone_number_id: '' as string,
  })
  const [editForm, setEditForm] = useState<Partial<AudienceSegment> | null>(null)

  // Agents and phone numbers for linking
  const [agents, setAgents] = useState<AiAgent[]>([])
  const [phoneNumbers, setPhoneNumbers] = useState<Array<{ id: string; number: string; friendly_name?: string }>>([])

  useEffect(() => {
    if (currentBusiness?.id) {
      loadSegments()
    }
    // Load agents and phone numbers once
    loadAgentsAndPhones()
  }, [currentBusiness?.id])

  async function loadAgentsAndPhones() {
    try {
      const [agentsData, phonesData] = await Promise.all([
        getAgents().catch(() => [] as AiAgent[]),
        getNumbers().catch(() => ({ numbers: [] })),
      ])
      setAgents(Array.isArray(agentsData) ? agentsData : [])
      setPhoneNumbers(
        Array.isArray(phonesData?.numbers) ? phonesData.numbers.map((n: any) => ({
          id: String(n.id),
          number: n.number || n.phone_number || '',
          friendly_name: n.friendly_name || n.label || '',
        })) : []
      )
    } catch (err) {
      console.error('Failed to load agents/phones:', err)
    }
  }

  async function loadSegments() {
    if (!currentBusiness?.id) return
    try {
      setLoading(true)
      const data = await listAudienceSegments(currentBusiness.id)
      setSegments(data.segments)
    } catch (err) {
      toast.error('Failed to load audience segments')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddSegment() {
    if (!currentBusiness?.id) {
      toast.error('Select a business first')
      return
    }
    if (!newSegment.name.trim()) {
      toast.error('Segment name is required')
      return
    }
    setIsSaving(true)
    try {
      const payload = {
        ...newSegment,
        persona_id: newSegment.persona_id || null,
        phone_number_id: newSegment.phone_number_id || null,
      }
      const created = await createAudienceSegment(currentBusiness.id, payload)
      setSegments([...segments, created])
      setNewSegment({
        name: '',
        description: '',
        pain_points: '',
        goals: '',
        tone: '',
        demographics: '',
        persona_id: '',
        phone_number_id: '',
      })
      setIsAdding(false)
      toast.success('Audience segment created successfully')
    } catch (err) {
      toast.error('Failed to create audience segment')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveEdit(segmentId: string) {
    if (!currentBusiness?.id || !editForm) return
    setIsSaving(true)
    try {
      const updated = await updateAudienceSegment(currentBusiness.id, segmentId, editForm)
      setSegments(segments.map((s) => (s.id === segmentId ? updated : s)))
      setEditingId(null)
      toast.success('Audience segment updated successfully')
    } catch (err) {
      toast.error('Failed to update audience segment')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(segmentId: string) {
    if (!currentBusiness?.id) return
    if (!confirm('Are you sure you want to delete this audience segment?')) return
    setIsSaving(true)
    try {
      await deleteAudienceSegment(currentBusiness.id, segmentId)
      setSegments(segments.filter((s) => s.id !== segmentId))
      toast.success('Audience segment deleted successfully')
    } catch (err) {
      toast.error('Failed to delete audience segment')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  if (!currentBusiness?.id) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Customer Avatars</h2>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <p className="text-slate-600">Select a business first</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Customer Avatars</h2>
          <p className="text-sm text-slate-600 mt-1">Business: {currentBusiness.name}</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Avatar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {/* Add Form */}
          {isAdding && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-4">New Customer Avatar</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={newSegment.name}
                    onChange={(e) => setNewSegment({ ...newSegment, name: e.target.value })}
                    placeholder="e.g., Young Real Estate Investor"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newSegment.description}
                    onChange={(e) =>
                      setNewSegment({ ...newSegment, description: e.target.value })
                    }
                    placeholder="Who is this avatar?"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Pain Points
                  </label>
                  <textarea
                    value={newSegment.pain_points}
                    onChange={(e) =>
                      setNewSegment({ ...newSegment, pain_points: e.target.value })
                    }
                    placeholder="What challenges do they face?"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Goals</label>
                  <textarea
                    value={newSegment.goals}
                    onChange={(e) => setNewSegment({ ...newSegment, goals: e.target.value })}
                    placeholder="What do they want to achieve?"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tone</label>
                  <input
                    type="text"
                    value={newSegment.tone}
                    onChange={(e) => setNewSegment({ ...newSegment, tone: e.target.value })}
                    placeholder="e.g., Professional, Casual, Motivational"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Demographics
                  </label>
                  <textarea
                    value={newSegment.demographics}
                    onChange={(e) =>
                      setNewSegment({ ...newSegment, demographics: e.target.value })
                    }
                    placeholder="Age, location, income, etc."
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                {/* Linked AI Agent & Phone Number */}
                <div className="border-t border-slate-200 pt-4 mt-2">
                  <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary-500" />
                    Call Routing (Optional)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        AI Agent (Persona)
                      </label>
                      <select
                        value={newSegment.persona_id}
                        onChange={(e) => setNewSegment({ ...newSegment, persona_id: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                      >
                        <option value="">None</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}{a.role ? ` (${a.role})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Phone Number
                      </label>
                      <select
                        value={newSegment.phone_number_id}
                        onChange={(e) => setNewSegment({ ...newSegment, phone_number_id: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                      >
                        <option value="">None</option>
                        {phoneNumbers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.number}{p.friendly_name ? ` — ${p.friendly_name}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleAddSegment}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Create Avatar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsAdding(false)
                      setNewSegment({
                        name: '',
                        description: '',
                        pain_points: '',
                        goals: '',
                        tone: '',
                        demographics: '',
                        persona_id: '',
                        phone_number_id: '',
                      })
                    }}
                    disabled={isSaving}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Segments List */}
          <div className="space-y-3">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
              >
                {editingId === segment.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm?.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Description
                      </label>
                      <textarea
                        value={editForm?.description || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, description: e.target.value })
                        }
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Pain Points
                      </label>
                      <textarea
                        value={editForm?.pain_points || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, pain_points: e.target.value })
                        }
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Goals
                      </label>
                      <textarea
                        value={editForm?.goals || ''}
                        onChange={(e) => setEditForm({ ...editForm, goals: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Tone
                      </label>
                      <input
                        type="text"
                        value={editForm?.tone || ''}
                        onChange={(e) => setEditForm({ ...editForm, tone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Demographics
                      </label>
                      <textarea
                        value={editForm?.demographics || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, demographics: e.target.value })
                        }
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>

                    {/* Linked AI Agent & Phone Number */}
                    <div className="border-t border-slate-200 pt-4 mt-2">
                      <p className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                        <Bot className="w-4 h-4 text-primary-500" />
                        Call Routing (Optional)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            AI Agent (Persona)
                          </label>
                          <select
                            value={editForm?.persona_id || ''}
                            onChange={(e) => setEditForm({ ...editForm, persona_id: e.target.value || null })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                          >
                            <option value="">None</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}{a.role ? ` (${a.role})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Phone Number
                          </label>
                          <select
                            value={editForm?.phone_number_id || ''}
                            onChange={(e) => setEditForm({ ...editForm, phone_number_id: e.target.value || null })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
                          >
                            <option value="">None</option>
                            {phoneNumbers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.number}{p.friendly_name ? ` — ${p.friendly_name}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleSaveEdit(segment.id)}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Save
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null)
                          setEditForm(null)
                        }}
                        disabled={isSaving}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-slate-800 mb-2">{segment.name}</h3>
                      {segment.tone && (
                        <span className="inline-block mb-3 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                          {segment.tone}
                        </span>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {segment.description && (
                          <div>
                            <p className="font-medium text-slate-700 mb-0.5">Description</p>
                            <p className="text-slate-600">{segment.description}</p>
                          </div>
                        )}
                        {segment.pain_points && (
                          <div>
                            <p className="font-medium text-slate-700 mb-0.5">Pain Points</p>
                            <p className="text-slate-600">{segment.pain_points}</p>
                          </div>
                        )}
                        {segment.goals && (
                          <div>
                            <p className="font-medium text-slate-700 mb-0.5">Goals</p>
                            <p className="text-slate-600">{segment.goals}</p>
                          </div>
                        )}
                        {segment.demographics && (
                          <div>
                            <p className="font-medium text-slate-700 mb-0.5">Demographics</p>
                            <p className="text-slate-600">{segment.demographics}</p>
                          </div>
                        )}
                      </div>

                      {/* Show linked persona and phone number */}
                      {(segment.persona_id || segment.phone_number_id) && (
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-3">
                          {segment.persona_id && (() => {
                            const agent = agents.find((a) => a.id === segment.persona_id)
                            return agent ? (
                              <span className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 text-xs px-2.5 py-1 rounded-full">
                                <Bot className="w-3 h-3" />
                                {agent.name}{agent.role ? ` (${agent.role})` : ''}
                              </span>
                            ) : null
                          })()}
                          {segment.phone_number_id && (() => {
                            const phone = phoneNumbers.find((p) => p.id === segment.phone_number_id)
                            return phone ? (
                              <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full">
                                <Phone className="w-3 h-3" />
                                {phone.number}
                              </span>
                            ) : null
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => {
                          setEditingId(segment.id)
                          setEditForm({
                            name: segment.name,
                            description: segment.description,
                            pain_points: segment.pain_points,
                            goals: segment.goals,
                            tone: segment.tone,
                            demographics: segment.demographics,
                            persona_id: segment.persona_id,
                            phone_number_id: segment.phone_number_id,
                          })
                        }}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(segment.id)}
                        disabled={isSaving}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {segments.length === 0 && !isAdding && (
            <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-slate-200">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">No customer avatars yet.</p>
              <button
                onClick={() => setIsAdding(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Create First Avatar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// Section 4: Content Types
// ============================================================================

function ContentTypesSection() {
  const { currentBusiness } = useBusinessStore()
  const [contentTypes, setContentTypes] = useState<ContentType[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newType, setNewType] = useState({
    name: '',
    description: '',
    color: '#3B82F6',
  })
  const [editForm, setEditForm] = useState<Partial<ContentType> | null>(null)

  useEffect(() => {
    if (currentBusiness?.id) {
      loadContentTypes()
    }
  }, [currentBusiness?.id])

  async function loadContentTypes() {
    if (!currentBusiness?.id) return
    try {
      setLoading(true)
      const data = await listContentTypes(currentBusiness.id)
      setContentTypes(data.types)
    } catch (err) {
      toast.error('Failed to load content types')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddType() {
    if (!currentBusiness?.id) {
      toast.error('Select a business first')
      return
    }
    if (!newType.name.trim()) {
      toast.error('Content type name is required')
      return
    }
    setIsSaving(true)
    try {
      const created = await createContentType(currentBusiness.id, newType)
      setContentTypes([...contentTypes, created])
      setNewType({ name: '', description: '', color: '#3B82F6' })
      setIsAdding(false)
      toast.success('Content type created successfully')
    } catch (err) {
      toast.error('Failed to create content type')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveEdit(typeId: string) {
    if (!currentBusiness?.id || !editForm) return
    setIsSaving(true)
    try {
      const updated = await updateContentType(currentBusiness.id, typeId, editForm)
      setContentTypes(contentTypes.map((t) => (t.id === typeId ? updated : t)))
      setEditingId(null)
      toast.success('Content type updated successfully')
    } catch (err) {
      toast.error('Failed to update content type')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(typeId: string) {
    if (!currentBusiness?.id) return
    if (!confirm('Are you sure you want to delete this content type?')) return
    setIsSaving(true)
    try {
      await deleteContentType(currentBusiness.id, typeId)
      setContentTypes(contentTypes.filter((t) => t.id !== typeId))
      toast.success('Content type deleted successfully')
    } catch (err) {
      toast.error('Failed to delete content type')
      console.error(err)
    } finally {
      setIsSaving(false)
    }
  }

  if (!currentBusiness?.id) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Content Types</h2>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center">
          <p className="text-slate-600">Select a business first</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Content Types</h2>
          <p className="text-sm text-slate-600 mt-1">Business: {currentBusiness.name}</p>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Content Type
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {/* Add Form */}
          {isAdding && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-base font-semibold text-slate-800 mb-4">New Content Type</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={newType.name}
                    onChange={(e) => setNewType({ ...newType, name: e.target.value })}
                    placeholder="e.g., Blog Post, Video, Case Study"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newType.description}
                    onChange={(e) => setNewType({ ...newType, description: e.target.value })}
                    placeholder="What is this content type?"
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newType.color}
                      onChange={(e) => setNewType({ ...newType, color: e.target.value })}
                      className="w-10 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={newType.color}
                      onChange={(e) => setNewType({ ...newType, color: e.target.value })}
                      placeholder="#000000"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleAddType}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Create Type
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setIsAdding(false)
                      setNewType({ name: '', description: '', color: '#3B82F6' })
                    }}
                    disabled={isSaving}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content Types List */}
          <div className="space-y-3">
            {contentTypes.map((type) => (
              <div
                key={type.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
              >
                {editingId === type.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={editForm?.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Description
                      </label>
                      <textarea
                        value={editForm?.description || ''}
                        onChange={(e) =>
                          setEditForm({ ...editForm, description: e.target.value })
                        }
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={editForm?.color || '#3B82F6'}
                          onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                          className="w-10 h-10 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={editForm?.color || '#3B82F6'}
                          onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleSaveEdit(type.id)}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Save
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null)
                          setEditForm(null)
                        }}
                        disabled={isSaving}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div
                        className="w-4 h-4 rounded-full mt-1.5 flex-shrink-0"
                        style={{ backgroundColor: type.color || '#3B82F6' }}
                      />
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-slate-800">{type.name}</h3>
                        {type.description && (
                          <p className="text-sm text-slate-600 mt-1">{type.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => {
                          setEditingId(type.id)
                          setEditForm({
                            name: type.name,
                            description: type.description,
                            color: type.color,
                          })
                        }}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(type.id)}
                        disabled={isSaving}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {contentTypes.length === 0 && !isAdding && (
            <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-slate-200">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600 mb-4">No content types yet.</p>
              <button
                onClick={() => setIsAdding(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Create First Type
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// Section 5: Module Access
// ============================================================================

function ModuleAccessSection() {
  const { businesses } = useBusinessStore()
  const [settings, setSettings] = useState<ModuleBusinessSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const MODULES = [
    { id: 'lead_center', label: 'LeadCenter' },
    { id: 'ai_studio', label: 'AI Studio' },
    { id: 'content_hub', label: 'ContentHub' },
  ]

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      setLoading(true)
      const data = await getModuleSettings()
      setSettings(data.settings)
    } catch (err) {
      toast.error('Failed to load module settings')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(businessId: string, module: string) {
    const current = settings.find((s) => s.business_id === businessId && s.module === module)
    const newState = !current?.is_enabled

    setSavingId(`${businessId}-${module}`)
    try {
      await updateModuleSetting({
        business_id: businessId,
        module,
        is_enabled: newState,
      })

      // Update local state
      setSettings(
        settings.map((s) =>
          s.business_id === businessId && s.module === module
            ? { ...s, is_enabled: newState }
            : s
        )
      )

      toast.success('Module access updated')
    } catch (err) {
      toast.error('Failed to update module access')
      console.error(err)
    } finally {
      setSavingId(null)
    }
  }

  function isModuleEnabled(businessId: string, module: string): boolean {
    return settings.find((s) => s.business_id === businessId && s.module === module)
      ?.is_enabled ?? false
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-800 mb-6">Module Access</h2>

      {businesses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-slate-200">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">No businesses to manage.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {businesses.map((business) => (
            <div
              key={business.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-800">{business.name}</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {MODULES.map((mod) => {
                  const isEnabled = isModuleEnabled(business.id, mod.id)
                  const isSaving = savingId === `${business.id}-${mod.id}`
                  return (
                    <button
                      key={mod.id}
                      onClick={() => handleToggle(business.id, mod.id)}
                      disabled={isSaving}
                      className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      <div
                        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isEnabled
                            ? 'bg-primary-500 border-primary-500'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isEnabled && (
                          <svg
                            className="w-3 h-3 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-800">{mod.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin text-primary-500" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
