'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Modal } from '@/components/ui/modal'
import { Input } from '@/components/ui/input'
import { Plus, GripVertical, MoreHorizontal, DollarSign, Phone } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

interface PipelineDeal {
  id: string
  title: string
  contactName: string
  value: number
  address: string
  phone: string
  stageId: string
  arv?: number
  repairCost?: number
}

interface PipelineStage {
  id: string
  name: string
  color: string
  deals: PipelineDeal[]
}

const initialStages: PipelineStage[] = [
  {
    id: 'lead',
    name: 'Lead',
    color: '#3B82F6',
    deals: [
      {
        id: '1',
        title: 'Main St Property',
        contactName: 'John Smith',
        value: 185000,
        address: '123 Main St, Dallas TX',
        phone: '555-123-4567',
        stageId: 'lead',
        arv: 250000,
        repairCost: 35000,
      },
      {
        id: '2',
        title: 'Oak Ave Duplex',
        contactName: 'Sarah Johnson',
        value: 225000,
        address: '456 Oak Ave, Fort Worth TX',
        phone: '555-987-6543',
        stageId: 'lead',
        arv: 320000,
        repairCost: 45000,
      },
    ],
  },
  {
    id: 'contacted',
    name: 'Contacted',
    color: '#8B5CF6',
    deals: [
      {
        id: '3',
        title: 'Pine Rd Multi-Family',
        contactName: 'Michael Williams',
        value: 450000,
        address: '789 Pine Rd, Arlington TX',
        phone: '555-555-1234',
        stageId: 'contacted',
        arv: 580000,
        repairCost: 60000,
      },
    ],
  },
  {
    id: 'appointment',
    name: 'Appointment Set',
    color: '#F59E0B',
    deals: [
      {
        id: '4',
        title: 'Elm St Wholesale',
        contactName: 'Emily Davis',
        value: 165000,
        address: '321 Elm St, Plano TX',
        phone: '555-222-3333',
        stageId: 'appointment',
        arv: 220000,
        repairCost: 25000,
      },
    ],
  },
  {
    id: 'offer',
    name: 'Offer Made',
    color: '#EF4444',
    deals: [],
  },
  {
    id: 'contract',
    name: 'Under Contract',
    color: '#10B981',
    deals: [
      {
        id: '5',
        title: 'Cedar Ln Fix & Flip',
        contactName: 'Robert Brown',
        value: 195000,
        address: '555 Cedar Ln, Irving TX',
        phone: '555-444-5555',
        stageId: 'contract',
        arv: 285000,
        repairCost: 40000,
      },
    ],
  },
  {
    id: 'closed',
    name: 'Closed',
    color: '#059669',
    deals: [
      {
        id: '6',
        title: 'Maple Way Wholesale',
        contactName: 'David Garcia',
        value: 145000,
        address: '999 Maple Way, Mesquite TX',
        phone: '555-888-9999',
        stageId: 'closed',
        arv: 200000,
        repairCost: 20000,
      },
    ],
  },
]

export default function PipelinePage() {
  const [stages, setStages] = useState<PipelineStage[]>(initialStages)
  const [selectedDeal, setSelectedDeal] = useState<PipelineDeal | null>(null)
  const [draggedDeal, setDraggedDeal] = useState<PipelineDeal | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  const handleDragStart = (deal: PipelineDeal) => {
    setDraggedDeal(deal)
  }

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    setDragOverStage(stageId)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = (targetStageId: string) => {
    if (!draggedDeal) return

    setStages((prev) =>
      prev.map((stage) => {
        // Remove from source stage
        if (stage.id === draggedDeal.stageId) {
          return {
            ...stage,
            deals: stage.deals.filter((d) => d.id !== draggedDeal.id),
          }
        }
        // Add to target stage
        if (stage.id === targetStageId) {
          return {
            ...stage,
            deals: [...stage.deals, { ...draggedDeal, stageId: targetStageId }],
          }
        }
        return stage
      })
    )

    toast.success(`Moved to ${stages.find((s) => s.id === targetStageId)?.name}`)
    setDraggedDeal(null)
    setDragOverStage(null)
  }

  const totalValue = stages.reduce(
    (acc, stage) => acc + stage.deals.reduce((sum, deal) => sum + deal.value, 0),
    0
  )

  const totalDeals = stages.reduce((acc, stage) => acc + stage.deals.length, 0)

  return (
    <div className="min-h-screen">
      <Header
        title="Deal Pipeline"
        description="Track and manage your real estate deals"
      />

      <div className="p-6">
        {/* Summary */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="bg-card border rounded-lg px-4 py-2">
            <span className="text-sm text-muted-foreground">Total Deals:</span>
            <span className="ml-2 font-bold">{totalDeals}</span>
          </div>
          <div className="bg-card border rounded-lg px-4 py-2">
            <span className="text-sm text-muted-foreground">Pipeline Value:</span>
            <span className="ml-2 font-bold">{formatCurrency(totalValue)}</span>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={`flex-shrink-0 w-72 bg-muted/50 rounded-lg p-3 transition-colors ${
                dragOverStage === stage.id ? 'bg-primary/10 ring-2 ring-primary' : ''
              }`}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Stage Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <h3 className="font-medium">{stage.name}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {stage.deals.length}
                  </Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Stage Value */}
              <p className="text-sm text-muted-foreground mb-3">
                {formatCurrency(
                  stage.deals.reduce((sum, deal) => sum + deal.value, 0)
                )}
              </p>

              {/* Deals */}
              <div className="space-y-2 min-h-[200px]">
                {stage.deals.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => handleDragStart(deal)}
                    className={`bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${
                      draggedDeal?.id === deal.id ? 'opacity-50' : ''
                    }`}
                    onClick={() => setSelectedDeal(deal)}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{deal.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {deal.contactName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {deal.address}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-sm font-semibold text-primary">
                            {formatCurrency(deal.value)}
                          </span>
                          {deal.arv && (
                            <span className="text-xs text-muted-foreground">
                              ARV: {formatCurrency(deal.arv)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Deal Details Modal */}
      <Modal
        isOpen={!!selectedDeal}
        onClose={() => setSelectedDeal(null)}
        title={selectedDeal?.title || ''}
        size="md"
      >
        {selectedDeal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar fallback={selectedDeal.contactName} />
              <div>
                <p className="font-medium">{selectedDeal.contactName}</p>
                <p className="text-sm text-muted-foreground">{selectedDeal.phone}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-y">
              <div>
                <p className="text-sm text-muted-foreground">Property Address</p>
                <p className="font-medium">{selectedDeal.address}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deal Value</p>
                <p className="font-medium text-primary">
                  {formatCurrency(selectedDeal.value)}
                </p>
              </div>
              {selectedDeal.arv && (
                <div>
                  <p className="text-sm text-muted-foreground">ARV</p>
                  <p className="font-medium">{formatCurrency(selectedDeal.arv)}</p>
                </div>
              )}
              {selectedDeal.repairCost && (
                <div>
                  <p className="text-sm text-muted-foreground">Repair Cost</p>
                  <p className="font-medium">{formatCurrency(selectedDeal.repairCost)}</p>
                </div>
              )}
              {selectedDeal.arv && selectedDeal.repairCost && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Potential Profit</p>
                  <p className="font-medium text-green-600">
                    {formatCurrency(
                      selectedDeal.arv - selectedDeal.value - selectedDeal.repairCost
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                <Phone className="h-4 w-4 mr-2" />
                Call
              </Button>
              <Button className="flex-1">
                <DollarSign className="h-4 w-4 mr-2" />
                Make Offer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
