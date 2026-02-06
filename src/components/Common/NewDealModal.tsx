import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '@/hooks/useStore'
import { useCreateDeal, usePipelines, useContacts } from '@/hooks/useApi'

export default function NewDealModal() {
  const { isNewDealModalOpen, setNewDealModalOpen } = useStore()
  const createDeal = useCreateDeal()
  const { data: pipelines } = usePipelines()
  const { data: contactsData } = useContacts({ limit: 100 })

  const [formData, setFormData] = useState({
    title: '',
    value: '',
    pipelineId: '',
    stageId: '',
    contactId: '',
  })

  const selectedPipeline = pipelines?.find((p) => p.id === formData.pipelineId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    await createDeal.mutateAsync({
      title: formData.title,
      value: parseFloat(formData.value) || 0,
      pipelineId: formData.pipelineId,
      stageId: formData.stageId,
      contactId: formData.contactId || undefined,
    })

    setFormData({ title: '', value: '', pipelineId: '', stageId: '', contactId: '' })
    setNewDealModalOpen(false)
  }

  const handleClose = () => {
    setFormData({ title: '', value: '', pipelineId: '', stageId: '', contactId: '' })
    setNewDealModalOpen(false)
  }

  return (
    <Modal isOpen={isNewDealModalOpen} onClose={handleClose} title="New Opportunity">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Title *
          </label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Deal title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Value ($)
          </label>
          <input
            type="number"
            value={formData.value}
            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Pipeline *
          </label>
          <select
            required
            value={formData.pipelineId}
            onChange={(e) =>
              setFormData({ ...formData, pipelineId: e.target.value, stageId: '' })
            }
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Select pipeline...</option>
            {pipelines?.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </select>
        </div>

        {selectedPipeline && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Stage *
            </label>
            <select
              required
              value={formData.stageId}
              onChange={(e) => setFormData({ ...formData, stageId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select stage...</option>
              {selectedPipeline.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Contact (Optional)
          </label>
          <select
            value={formData.contactId}
            onChange={(e) => setFormData({ ...formData, contactId: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Select contact...</option>
            {contactsData?.contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} - {contact.phone || contact.email}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createDeal.isPending}
            className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {createDeal.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Deal'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
