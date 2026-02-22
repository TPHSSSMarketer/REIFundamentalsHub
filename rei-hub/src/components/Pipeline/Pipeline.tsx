import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Loader2, Plus } from 'lucide-react'
import PipelineColumn from './PipelineColumn'
import DealCard from './DealCard'
import NewDealModal from './NewDealModal'
import { usePipelines, useDeals, useUpdateDealStage, useContacts } from '@/hooks/useApi'
import { useStore } from '@/hooks/useStore'
import { formatCurrency, getStageColor } from '@/utils/helpers'
import type { Deal, Pipeline as PipelineType } from '@/types'

export default function Pipeline() {
  const navigate = useNavigate()
  const { data: pipelines, isLoading: pipelinesLoading } = usePipelines()
  const { selectedPipelineId, setSelectedPipelineId } = useStore()

  // Auto-select first pipeline
  const activePipeline = useMemo(() => {
    if (selectedPipelineId) {
      return pipelines?.find((p) => p.id === selectedPipelineId)
    }
    return pipelines?.[0]
  }, [pipelines, selectedPipelineId])

  const { data: deals, isLoading: dealsLoading } = useDeals()
  const updateDealStage = useUpdateDealStage()

  const [activeDragDeal, setActiveDragDeal] = useState<Deal | null>(null)
  const [showNewDealModal, setShowNewDealModal] = useState(false)
  const { data: contacts } = useContacts()

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, Deal[]> = {}
    activePipeline?.stages.forEach((stage) => {
      grouped[stage.id] = deals?.filter((d) => d.stage === stage.id) || []
    })
    return grouped
  }, [deals, activePipeline])

  const handleDragStart = (event: DragStartEvent) => {
    const deal = deals?.find((d) => d.id === event.active.id)
    if (deal) setActiveDragDeal(deal)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragDeal(null)

    if (!over) return

    const dealId = active.id as string
    const newStageId = over.id as string

    // Find the deal being moved
    const deal = deals?.find((d) => d.id === dealId)
    if (!deal || deal.stage === newStageId) return

    // Update the deal's stage
    updateDealStage.mutate({ dealId, stageId: newStageId })
  }

  if (pipelinesLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-2" />
          <p className="text-slate-600">Loading pipelines...</p>
        </div>
      </div>
    )
  }

  if (!pipelines?.length) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">No pipelines found.</p>
        <p className="text-sm text-slate-500 mt-1">
          Create a pipeline to get started.
        </p>
      </div>
    )
  }

  const pipelineValue = deals?.reduce((sum, d) => sum + (d.purchasePrice || 0), 0) || 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">REI Pipeline Manager</h1>
          <p className="text-slate-600">Drag and drop deals between stages</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Pipeline Selector */}
          {pipelines.length > 1 && (
            <select
              value={activePipeline?.id || ''}
              onChange={(e) => setSelectedPipelineId(e.target.value)}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowNewDealModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Deal
          </button>
        </div>
      </div>

      {/* Pipeline Summary */}
      <div className="flex items-center gap-4 p-4 bg-white rounded-lg border border-slate-200">
        <div>
          <p className="text-sm text-slate-500">Total Deals</p>
          <p className="text-xl font-bold text-slate-800">{deals?.length || 0}</p>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div>
          <p className="text-sm text-slate-500">Pipeline Value</p>
          <p className="text-xl font-bold text-primary-600">
            {formatCurrency(pipelineValue)}
          </p>
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {activePipeline?.stages
            .sort((a, b) => a.order - b.order)
            .map((stage, index) => (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                deals={dealsByStage[stage.id] || []}
                color={getStageColor(index)}
                loading={dealsLoading}
                onDealClick={(deal) => navigate(`/deals/${deal.id}`)}
              />
            ))}
        </div>

        <DragOverlay>
          {activeDragDeal && (
            <DealCard deal={activeDragDeal} isDragging />
          )}
        </DragOverlay>
      </DndContext>

      {/* New Deal Modal */}
      <NewDealModal
        isOpen={showNewDealModal}
        onClose={() => setShowNewDealModal(false)}
        contacts={contacts || []}
      />
    </div>
  )
}
