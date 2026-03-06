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
import { Loader2, Plus, Map, LayoutGrid } from 'lucide-react'
import PipelineColumn from './PipelineColumn'
import DealCard from './DealCard'
import NewDealModal from './NewDealModal'
import PropertyMap from '@/components/Map/PropertyMap'
import type { MapPin } from '@/components/Map/PropertyMap'
import { usePipelines, useDeals, useUpdateDealStage, useContacts } from '@/hooks/useApi'
import { useStore } from '@/hooks/useStore'
import { formatCurrency, getStageColor, cn } from '@/utils/helpers'
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
  const [mobileStageFilter, setMobileStageFilter] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'kanban' | 'map'>('kanban')
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
    const pipelineDeals = activePipeline
      ? deals?.filter((d) => !d.pipelineId || d.pipelineId === activePipeline.id) || []
      : deals || []
    activePipeline?.stages.forEach((stage) => {
      grouped[stage.id] = pipelineDeals.filter((d) => d.stage === stage.id)
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

  // Convert deals to map pins
  const mapPins: MapPin[] = (deals || [])
    .filter((deal) => deal.latitude != null && deal.longitude != null)
    .map((deal) => {
      const stageName = activePipeline?.stages.find((s) => s.id === deal.stage)?.name || deal.stage
      return {
        id: deal.id,
        latitude: deal.latitude!,
        longitude: deal.longitude!,
        label: deal.address || deal.title,
        sublabel: `${stageName} • ${formatCurrency(deal.purchasePrice || 0)}`,
        type: 'deal',
        onClick: () => navigate(`/deals/${deal.id}`),
      }
    })

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">REI Pipeline Manager</h1>
          <p className="text-sm md:text-base text-slate-600">Drag and drop deals between stages</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Pipeline Selector */}
          {pipelines && pipelines.length > 0 && (
            <select
              value={activePipeline?.id || ''}
              onChange={(e) => setSelectedPipelineId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm min-h-[44px]"
            >
              {pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded transition-colors',
                viewMode === 'kanban'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
              title="Kanban View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded transition-colors',
                viewMode === 'map'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              )}
              title="Map View"
            >
              <Map className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowNewDealModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            Add Deal
          </button>
        </div>
      </div>

      {/* Pipeline Summary */}
      <div className="flex items-center gap-4 p-3 md:p-4 bg-white rounded-lg border border-slate-200">
        <div>
          <p className="text-xs md:text-sm text-slate-500">Total Deals</p>
          <p className="text-lg md:text-xl font-bold text-slate-800">{deals?.length || 0}</p>
        </div>
        <div className="h-8 w-px bg-slate-200" />
        <div>
          <p className="text-xs md:text-sm text-slate-500">Pipeline Value</p>
          <p className="text-lg md:text-xl font-bold text-primary-600">
            {formatCurrency(pipelineValue)}
          </p>
        </div>
      </div>

      {/* Mobile Stage Tabs */}
      <div className="md:hidden overflow-x-auto -mx-2 px-2">
        <div className="flex gap-2 pb-2">
          <button
            onClick={() => setMobileStageFilter(null)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap min-h-[36px] transition-colors',
              mobileStageFilter === null
                ? 'bg-primary-500 text-white'
                : 'bg-slate-100 text-slate-600'
            )}
          >
            All ({deals?.length || 0})
          </button>
          {activePipeline?.stages
            .sort((a, b) => a.order - b.order)
            .map((stage, index) => (
              <button
                key={stage.id}
                onClick={() => setMobileStageFilter(stage.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap min-h-[36px] transition-colors',
                  mobileStageFilter === stage.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-100 text-slate-600'
                )}
              >
                {stage.name} ({dealsByStage[stage.id]?.length || 0})
              </button>
            ))}
        </div>
      </div>

      {/* Map View (all screen sizes when in map mode) */}
      {viewMode === 'map' && (
        <div>
          <PropertyMap pins={mapPins} height="600px" />
        </div>
      )}

      {/* Mobile Deal List (only in kanban mode) */}
      {viewMode === 'kanban' && (
        <div className="md:hidden space-y-2">
          {(mobileStageFilter
            ? dealsByStage[mobileStageFilter] || []
            : deals || []
          ).map((deal) => (
            <div
              key={deal.id}
              onClick={() => navigate(`/deals/${deal.id}`)}
              className="bg-white border border-slate-200 rounded-lg p-3 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-slate-800 text-sm truncate mr-2">{deal.address || deal.title}</p>
                <span className="text-xs font-semibold text-primary-600 whitespace-nowrap">{formatCurrency(deal.purchasePrice || 0)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('px-2 py-0.5 text-[10px] font-medium rounded', getStageColor(activePipeline?.stages.findIndex((s) => s.id === deal.stage) || 0))}>
                  {activePipeline?.stages.find((s) => s.id === deal.stage)?.name || deal.stage}
                </span>
              </div>
            </div>
          ))}
          {(mobileStageFilter ? (dealsByStage[mobileStageFilter]?.length || 0) : (deals?.length || 0)) === 0 && (
            <p className="text-center text-sm text-slate-500 py-8">No deals in this stage</p>
          )}
        </div>
      )}

      {/* Kanban Board (Desktop, only in kanban mode) */}
      {viewMode === 'kanban' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="hidden md:flex gap-4 overflow-x-auto pb-4">
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
                  pipelineId={activePipeline?.id || ''}
                />
              ))}
          </div>

          <DragOverlay>
            {activeDragDeal && (
              <DealCard deal={activeDragDeal} isDragging pipelineId={activePipeline?.id || ''} />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* New Deal Modal */}
      <NewDealModal
        isOpen={showNewDealModal}
        onClose={() => setShowNewDealModal(false)}
        contacts={contacts || []}
        pipelineId={activePipeline?.id}
      />
    </div>
  )
}
