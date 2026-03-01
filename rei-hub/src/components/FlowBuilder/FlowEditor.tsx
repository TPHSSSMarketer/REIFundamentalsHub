import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  ArrowLeft,
  Save,
  MessageCircle,
  Target,
  MessageSquare,
  GitBranch,
  HelpCircle,
  MessagesSquare,
  Webhook,
  Clock,
  Square,
  PhoneForwarded,
  GripVertical,
} from 'lucide-react'
import { cn } from '@/utils/helpers'
import { nodeTypes } from './nodes'
import NodePropertiesPanel from './NodePropertiesPanel'
import {
  useFlow,
  useUpdateFlow,
  useCreateNode,
  useUpdateNode,
  useDeleteNode,
  useCreateEdge,
  useDeleteEdge,
} from '@/hooks/useFlowBuilder'
import type { FlowNodeType } from '@/types'

const paletteItems: { type: FlowNodeType; label: string; icon: any; color: string }[] = [
  { type: 'greeting', label: 'Greeting', icon: MessageCircle, color: 'text-blue-600 bg-blue-50' },
  { type: 'objective', label: 'Objective', icon: Target, color: 'text-purple-600 bg-purple-50' },
  { type: 'statement', label: 'Statement', icon: MessageSquare, color: 'text-green-600 bg-green-50' },
  { type: 'conversation', label: 'Conversation', icon: MessagesSquare, color: 'text-indigo-600 bg-indigo-50' },
  { type: 'switch', label: 'Switch', icon: GitBranch, color: 'text-orange-600 bg-orange-50' },
  { type: 'true_false', label: 'True/False', icon: HelpCircle, color: 'text-yellow-600 bg-yellow-50' },
  { type: 'webhook', label: 'Webhook', icon: Webhook, color: 'text-red-600 bg-red-50' },
  { type: 'delay', label: 'Delay', icon: Clock, color: 'text-slate-600 bg-slate-50' },
  { type: 'transfer', label: 'Transfer', icon: PhoneForwarded, color: 'text-teal-600 bg-teal-50' },
  { type: 'stop', label: 'Stop', icon: Square, color: 'text-gray-600 bg-gray-50' },
]

function FlowEditorInner() {
  const { flowId } = useParams<{ flowId: string }>()
  const navigate = useNavigate()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const { data: flow, isLoading } = useFlow(flowId)
  const updateFlow = useUpdateFlow()
  const createNode = useCreateNode()
  const updateNodeMut = useUpdateNode()
  const deleteNode = useDeleteNode()
  const createEdge = useCreateEdge()
  const deleteEdge = useDeleteEdge()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [flowName, setFlowName] = useState('')
  const [flowStatus, setFlowStatus] = useState<'draft' | 'published'>('draft')
  const [hasUnsaved, setHasUnsaved] = useState(false)

  // Load flow data into canvas
  useEffect(() => {
    if (flow) {
      setFlowName(flow.name)
      setFlowStatus(flow.status as 'draft' | 'published')
      const rfNodes: Node[] = (flow.nodes || []).map((n: any) => ({
        id: String(n.id),
        type: n.node_type,
        position: { x: n.position_x || 0, y: n.position_y || 0 },
        data: {
          label: n.label || n.node_type,
          ...n.config,
        },
      }))
      const rfEdges: Edge[] = (flow.edges || []).map((e: any) => ({
        id: String(e.id),
        source: String(e.source_node_id),
        target: String(e.target_node_id),
        sourceHandle: e.source_handle || undefined,
        targetHandle: e.target_handle || undefined,
        animated: true,
        style: { stroke: '#94a3b8', strokeWidth: 2 },
      }))
      setNodes(rfNodes)
      setEdges(rfEdges)
    }
  }, [flow, setNodes, setEdges])

  // Handle new connections
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!flowId || !connection.source || !connection.target) return
      setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } }, eds))
      createEdge.mutate({
        flowId,
        data: {
          source_node_id: connection.source,
          target_node_id: connection.target,
          source_handle: connection.sourceHandle || undefined,
          target_handle: connection.targetHandle || undefined,
        } as any,
      })
    },
    [flowId, setEdges, createEdge]
  )

  // Handle node selection
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // Handle drag and drop from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      if (!flowId) return

      const type = event.dataTransfer.getData('application/reactflow') as FlowNodeType
      if (!type) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      createNode.mutate(
        {
          flowId,
          data: {
            node_type: type,
            label: type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' '),
            position_x: Math.round(position.x),
            position_y: Math.round(position.y),
            config: {},
          },
        },
        {
          onSuccess: (newNode: any) => {
            const rfNode: Node = {
              id: String(newNode.id),
              type: newNode.node_type,
              position: { x: newNode.position_x, y: newNode.position_y },
              data: { label: newNode.label || newNode.node_type },
            }
            setNodes((nds) => [...nds, rfNode])
          },
        }
      )
    },
    [flowId, screenToFlowPosition, createNode, setNodes]
  )

  // Handle node position change (drag on canvas)
  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      if (!flowId) return
      updateNodeMut.mutate({
        flowId,
        nodeId: node.id,
        data: {
          position_x: Math.round(node.position.x),
          position_y: Math.round(node.position.y),
        },
      })
    },
    [flowId, updateNodeMut]
  )

  // Handle edge delete
  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (!flowId) return
      deletedEdges.forEach((edge) => {
        deleteEdge.mutate({
          flowId,
          edgeId: edge.id,
        })
      })
    },
    [flowId, deleteEdge]
  )

  // Handle node delete
  const onNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      if (!flowId) return
      deletedNodes.forEach((node) => {
        deleteNode.mutate({
          flowId,
          nodeId: node.id,
        })
      })
      setSelectedNodeId(null)
    },
    [flowId, deleteNode]
  )

  // Save flow metadata
  const handleSave = () => {
    if (!flowId) return
    updateFlow.mutate(
      { flowId, data: { name: flowName, status: flowStatus } },
      { onSuccess: () => setHasUnsaved(false) }
    )
  }

  // Toggle publish status
  const toggleStatus = () => {
    const next = flowStatus === 'draft' ? 'published' : 'draft'
    setFlowStatus(next)
    if (flowId) {
      updateFlow.mutate({ flowId, data: { status: next } })
    }
  }

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading flow...</p>
        </div>
      </div>
    )
  }

  if (!flow) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <p className="text-slate-600 font-medium">Flow not found</p>
          <button
            onClick={() => navigate('/flow-builder')}
            className="mt-3 text-sm text-primary-600 hover:underline"
          >
            Back to Flow Builder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col -mx-6 -mt-6">
      {/* Top Toolbar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/flow-builder')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={flowName}
            onChange={(e) => {
              setFlowName(e.target.value)
              setHasUnsaved(true)
            }}
            className="text-lg font-bold text-slate-900 bg-transparent border-none focus:outline-none focus:ring-0 w-64"
            placeholder="Flow name..."
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleStatus}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors',
              flowStatus === 'published'
                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            )}
          >
            {flowStatus === 'published' ? 'Published' : 'Draft'}
          </button>
          <button
            onClick={handleSave}
            disabled={updateFlow.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {updateFlow.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Node Palette */}
        <div className="w-48 bg-white border-r border-slate-200 p-3 overflow-y-auto shrink-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Node Types
          </p>
          <div className="space-y-1.5">
            {paletteItems.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow', item.type)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-200 hover:border-primary-300 hover:bg-primary-50 cursor-grab active:cursor-grabbing transition-colors"
              >
                <div className={cn('w-6 h-6 rounded flex items-center justify-center', item.color)}>
                  <item.icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-medium text-slate-700">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: React Flow Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onNodeDragStop={onNodeDragStop}
            onNodesDelete={onNodesDelete}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={['Backspace', 'Delete']}
            className="bg-slate-50"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
            <Controls className="!bg-white !border-slate-200 !shadow-sm" />
            <MiniMap
              className="!bg-white !border-slate-200"
              nodeColor="#6366f1"
              maskColor="rgba(0,0,0,0.08)"
            />
          </ReactFlow>
        </div>

        {/* Right: Properties Panel */}
        {selectedNode && (
          <NodePropertiesPanel
            node={selectedNode}
            onUpdate={(data) => {
              // Update local state immediately
              setNodes((nds) =>
                nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...data } } : n))
              )
              // Persist to backend
              if (flowId) {
                updateNodeMut.mutate({
                  flowId,
                  nodeId: selectedNode.id,
                  data: { config: data },
                })
              }
            }}
            onDelete={() => {
              if (flowId) {
                deleteNode.mutate({
                  flowId,
                  nodeId: selectedNode.id,
                })
              }
              setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
              setSelectedNodeId(null)
            }}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}

export default function FlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  )
}
