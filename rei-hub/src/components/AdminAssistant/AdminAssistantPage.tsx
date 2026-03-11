import React, { useState, useEffect, useRef } from 'react';
import MarkdownMessage from './MarkdownMessage';
import {
  Bot,
  MessageSquare,
  Zap,
  Clock,
  Settings,
  Plus,
  Send,
  Loader,
  ChevronDown,
  AlertCircle,
  Check,
  X,
  Trash2,
  Play,
  Toggle2,
  RotateCcw,
  MessageCircle,
  UserCheck,
  Activity,
  Target,
  BarChart3,
  Megaphone,
  Handshake,
} from 'lucide-react';
import { cn } from '@/utils/helpers';
import {
  createSession,
  listSessions,
  deleteSession,
  getSessionMessages,
  sendMessage,
  getActionLog,
  approveAction,
  rejectAction,
  getTrustSettings,
  updateTrustSetting,
  setAllAutomatic,
  resetTrustDefaults,
  getSkillLibrary,
  createSkill,
  executeSkill,
  deleteSkill,
  getScheduledTasks,
  createScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  runTaskNow,
} from '@/services/adminAssistantApi';
import {
  AdminSession,
  AdminMessage,
  AdminActionLog,
  AdminTrustSetting,
  AdminSkill,
  AdminScheduledTask,
} from '@/types';
import { toast } from 'sonner';

// Lucide icon map for skills
const SKILL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  UserCheck,
  Activity,
  Target,
  BarChart3,
  Megaphone,
  Handshake,
};

// Convert cron expression to human-readable format
function cronToHumanReadable(cron: string): string {
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (minute === '0' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${hour}:00`;
  }
  if (minute === '0' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const dayIndex = parseInt(dayOfWeek);
    return `${days[dayIndex]} at ${hour}:00`;
  }
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*') {
    return `${hour}:${minute} daily`;
  }

  return cron;
}

// Tab component
interface TabProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}

const Tab: React.FC<TabProps> = ({ label, icon: Icon, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2',
      active
        ? 'border-primary-600 text-primary-600'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    )}
  >
    <Icon className="w-5 h-5" />
    {label}
  </button>
);

// Chat Tab Component
const ChatTab: React.FC = () => {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const data = await listSessions();
        setSessions(data);
        if (data.length > 0 && !activeSessionId) {
          setActiveSessionId(data[0].id);
        }
      } catch (error) {
        toast.error('Failed to load sessions');
      }
    };
    loadSessions();
  }, []);

  // Load messages when session changes
  useEffect(() => {
    if (!activeSessionId) return;

    const loadMessages = async () => {
      try {
        setLoadingMessages(true);
        const data = await getSessionMessages(activeSessionId);
        setMessages(data);
      } catch (error) {
        toast.error('Failed to load messages');
      } finally {
        setLoadingMessages(false);
      }
    };
    loadMessages();
  }, [activeSessionId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewSession = async () => {
    try {
      const session = await createSession('New Conversation');
      setSessions([session, ...sessions]);
      setActiveSessionId(session.id);
      setMessages([]);
    } catch (error) {
      toast.error('Failed to create session');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await deleteSession(sessionId);
      setSessions(sessions.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
        if (remaining.length === 0) setMessages([]);
      }
      toast.success('Conversation deleted');
    } catch (error) {
      toast.error('Failed to delete conversation');
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !activeSessionId || loading) return;

    const userMessage = inputValue;
    setInputValue('');
    setLoading(true);

    try {
      const result = await sendMessage(activeSessionId, userMessage);

      // Add user message
      const newUserMsg: AdminMessage = {
        id: `msg-${Date.now()}`,
        session_id: activeSessionId,
        role: 'user',
        content: userMessage,
        tokens_used: 0,
        created_at: new Date().toISOString(),
      };

      // Add assistant response
      const newAssistantMsg: AdminMessage = {
        id: `msg-${Date.now()}-1`,
        session_id: activeSessionId,
        role: 'assistant',
        content: result.response,
        tool_calls: result.tool_results ?? undefined,
        tokens_used: 0,
        created_at: new Date().toISOString(),
      };

      setMessages([...messages, newUserMsg, newAssistantMsg]);

      // Capture pending actions if any
      if (result.pending_actions?.length) {
        setPendingActions((prev) => [...prev, ...result.pending_actions]);
      }
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveAction = async (actionId: string) => {
    try {
      await approveAction(actionId);
      setPendingActions((prev) => prev.filter((a) => a.action_id !== actionId));
      toast.success('Action approved and executed');
    } catch (error) {
      toast.error('Failed to approve action');
    }
  };

  const handleRejectAction = async (actionId: string) => {
    try {
      await rejectAction(actionId);
      setPendingActions((prev) => prev.filter((a) => a.action_id !== actionId));
      toast.success('Action rejected');
    } catch (error) {
      toast.error('Failed to reject action');
    }
  };

  return (
    <div className="flex gap-6 h-[750px]">
      {/* Sidebar */}
      <div className="hidden lg:flex flex-col w-72 bg-slate-50 rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Conversations</h3>
          <button
            onClick={handleNewSession}
            className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
            title="New conversation"
          >
            <Plus className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No conversations yet</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group flex items-center gap-1 px-3 py-2 rounded-lg transition-colors text-sm cursor-pointer',
                  activeSessionId === session.id
                    ? 'bg-primary-50 text-primary-600'
                    : 'hover:bg-slate-200 text-slate-700'
                )}
                onClick={() => setActiveSessionId(session.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{session.title}</p>
                  <p className="text-xs text-slate-500">{session.message_count} messages</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteSession(session.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 bg-white rounded-xl border border-slate-200 p-4">
          {loadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <Loader className="w-6 h-6 text-primary-600 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <p>Start a conversation with your AI assistant</p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div key={message.id}>
                  {message.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="bg-primary-50 rounded-lg p-3 max-w-2xl">
                        <p className="text-slate-900">{message.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 rounded-lg p-3 max-w-3xl">
                        <MarkdownMessage content={message.content} />
                        {message.tool_calls && (
                          <details className="mt-2 text-xs text-slate-600">
                            <summary className="cursor-pointer font-medium">Tool calls</summary>
                            <pre className="mt-1 bg-slate-50 p-2 rounded text-xs overflow-auto">
                              {JSON.stringify(message.tool_calls, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Pending Actions UI */}
              {pendingActions.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-900">Actions awaiting your approval:</p>
                  {pendingActions.map((action) => (
                    <div key={action.action_id} className="bg-white border border-amber-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-slate-900">{action.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={cn(
                            'text-xs px-2 py-0.5 rounded font-medium',
                            action.risk_level === 'HIGH'
                              ? 'bg-red-100 text-red-700'
                              : action.risk_level === 'MEDIUM'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                          )}
                        >
                          {action.risk_level}
                        </span>
                        <span className="text-xs text-slate-500">{action.tool}</span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleApproveAction(action.action_id)}
                          className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center justify-center gap-1 transition-colors"
                        >
                          <Check className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => handleRejectAction(action.action_id)}
                          className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 flex items-center justify-center gap-1 transition-colors"
                        >
                          <X className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask your assistant anything..."
            disabled={loading}
            rows={3}
            className={cn(
              'flex-1 p-3 rounded-lg border border-slate-200 resize-none focus:outline-none focus:ring-2 focus:ring-primary-600',
              loading && 'opacity-50 cursor-not-allowed'
            )}
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !inputValue.trim()}
            className={cn(
              'px-4 py-3 rounded-lg font-medium transition-all flex items-center gap-2',
              loading || !inputValue.trim()
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            )}
          >
            {loading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Skills Tab Component
const SkillsTab: React.FC = () => {
  const [skills, setSkills] = useState<AdminSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateSkill, setShowCreateSkill] = useState(false);
  const [skillForm, setSkillForm] = useState({
    name: '',
    description: '',
    category: 'general' as 'crm' | 'phone' | 'analytics' | 'calendar' | 'email' | 'general',
    steps: [{ tool_name: '', params: '{}' }],
  });
  const [creatingSkill, setCreatingSkill] = useState(false);

  useEffect(() => {
    const loadSkills = async () => {
      try {
        const data = await getSkillLibrary();
        setSkills(data);
      } catch (error) {
        toast.error('Failed to load skills');
      } finally {
        setLoading(false);
      }
    };
    loadSkills();
  }, []);

  const handleRunSkill = async (skillId: string) => {
    try {
      await executeSkill(skillId);
      toast.success('Skill executed');
      const data = await getSkillLibrary();
      setSkills(data);
    } catch (error) {
      toast.error('Failed to execute skill');
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    try {
      await deleteSkill(skillId);
      toast.success('Skill deleted');
      setSkills(skills.filter((s) => s.id !== skillId));
    } catch (error) {
      toast.error('Failed to delete skill');
    }
  };

  const handleCreateSkill = async () => {
    if (!skillForm.name.trim()) {
      toast.error('Skill name is required');
      return;
    }

    setCreatingSkill(true);
    try {
      await createSkill({
        name: skillForm.name,
        description: skillForm.description,
        category: skillForm.category,
        action_steps: skillForm.steps.filter(s => s.tool_name.trim()),
      });
      toast.success('Skill created successfully');
      setShowCreateSkill(false);
      setSkillForm({
        name: '',
        description: '',
        category: 'general',
        steps: [{ tool_name: '', params: '{}' }],
      });
      const data = await getSkillLibrary();
      setSkills(data);
    } catch (error) {
      toast.error('Failed to create skill');
    } finally {
      setCreatingSkill(false);
    }
  };

  const handleAddStep = () => {
    setSkillForm({
      ...skillForm,
      steps: [...skillForm.steps, { tool_name: '', params: '{}' }],
    });
  };

  const handleRemoveStep = (index: number) => {
    setSkillForm({
      ...skillForm,
      steps: skillForm.steps.filter((_, i) => i !== index),
    });
  };

  const handleStepChange = (index: number, field: 'tool_name' | 'params', value: string) => {
    const newSteps = [...skillForm.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSkillForm({ ...skillForm, steps: newSteps });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => setShowCreateSkill(true)}
        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
      >
        + Create Custom Skill
      </button>

      {/* Create Skill Modal */}
      {showCreateSkill && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Create Custom Skill</h2>
              <p className="text-sm text-slate-500">Define a new skill with action steps</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Skill Name *
                </label>
                <input
                  type="text"
                  value={skillForm.name}
                  onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })}
                  placeholder="e.g., Daily Report Generator"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Description
                </label>
                <textarea
                  value={skillForm.description}
                  onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
                  placeholder="Brief description of what this skill does"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Category
                </label>
                <select
                  value={skillForm.category}
                  onChange={(e) => setSkillForm({ ...skillForm, category: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600"
                >
                  <option value="general">General</option>
                  <option value="crm">CRM</option>
                  <option value="phone">Phone</option>
                  <option value="analytics">Analytics</option>
                  <option value="calendar">Calendar</option>
                  <option value="email">Email</option>
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-900">Action Steps</label>
                  <button
                    onClick={handleAddStep}
                    className="flex items-center gap-1 text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Step
                  </button>
                </div>

                {skillForm.steps.map((step, index) => (
                  <div key={index} className="border border-slate-200 rounded-lg p-3 space-y-2 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-slate-500">Step {index + 1}</span>
                      {skillForm.steps.length > 1 && (
                        <button
                          onClick={() => handleRemoveStep(index)}
                          className="p-1 hover:bg-red-50 rounded transition-colors"
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={step.tool_name}
                      onChange={(e) => handleStepChange(index, 'tool_name', e.target.value)}
                      placeholder="Tool name"
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                    />
                    <textarea
                      value={step.params}
                      onChange={(e) => handleStepChange(index, 'params', e.target.value)}
                      placeholder='JSON parameters e.g., {"key": "value"}'
                      rows={2}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowCreateSkill(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSkill}
                disabled={creatingSkill}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creatingSkill ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" /> Creating...
                  </>
                ) : (
                  'Create Skill'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skills.map((skill) => {
          const IconComponent = SKILL_ICONS[skill.icon || 'Zap'] || Zap;
          return (
            <div
              key={skill.id}
              className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-50 rounded-lg">
                    <IconComponent className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{skill.name}</h3>
                    <p className="text-xs text-slate-500">{skill.category}</p>
                  </div>
                </div>
                {skill.is_system && (
                  <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-1 rounded">
                    System
                  </span>
                )}
              </div>

              <p className="text-sm text-slate-600">{skill.description}</p>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                <div className="text-xs text-slate-500">
                  <p>Run {skill.total_runs} times</p>
                  {skill.last_run_at && (
                    <p>{new Date(skill.last_run_at).toLocaleDateString()}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRunSkill(skill.id)}
                    className="p-2 hover:bg-primary-50 rounded-lg transition-colors"
                    title="Run now"
                  >
                    <Play className="w-4 h-4 text-primary-600" />
                  </button>
                  {!skill.is_system && (
                    <button
                      onClick={() => handleDeleteSkill(skill.id)}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Tasks Tab Component
const TasksTab: React.FC = () => {
  const [tasks, setTasks] = useState<AdminScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [skills, setSkillsForTasks] = useState<AdminSkill[]>([]);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    skillId: '',
    name: '',
    cronExpression: '',
    timezone: 'America/New_York',
    description: '',
  });
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        const [tasksData, skillsData] = await Promise.all([
          getScheduledTasks(),
          getSkillLibrary(),
        ]);
        setTasks(tasksData);
        setSkillsForTasks(skillsData);
      } catch (error) {
        toast.error('Failed to load tasks');
      } finally {
        setLoading(false);
      }
    };
    loadTasks();
  }, []);

  const handleRunTaskNow = async (taskId: string) => {
    try {
      await runTaskNow(taskId);
      toast.success('Task executed');
      const data = await getScheduledTasks();
      setTasks(data);
    } catch (error) {
      toast.error('Failed to run task');
    }
  };

  const handleToggleTask = async (taskId: string, enabled: boolean) => {
    try {
      await updateScheduledTask(taskId, { enabled: !enabled });
      setTasks(
        tasks.map((t) => (t.id === taskId ? { ...t, enabled: !enabled } : t))
      );
    } catch (error) {
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteScheduledTask(taskId);
      toast.success('Task deleted');
      setTasks(tasks.filter((t) => t.id !== taskId));
    } catch (error) {
      toast.error('Failed to delete task');
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.name.trim()) {
      toast.error('Task name is required');
      return;
    }
    if (!taskForm.cronExpression.trim()) {
      toast.error('Cron expression is required');
      return;
    }
    if (!taskForm.skillId) {
      toast.error('Please select a skill');
      return;
    }

    setCreatingTask(true);
    try {
      await createScheduledTask({
        skill_id: taskForm.skillId,
        name: taskForm.name,
        description: taskForm.description,
        cron_expression: taskForm.cronExpression,
        timezone: taskForm.timezone,
      });
      toast.success('Task created successfully');
      setShowCreateTask(false);
      setTaskForm({
        skillId: '',
        name: '',
        cronExpression: '',
        timezone: 'America/New_York',
        description: '',
      });
      const data = await getScheduledTasks();
      setTasks(data);
    } catch (error) {
      toast.error('Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => setShowCreateTask(true)}
        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
      >
        + Create Task
      </button>

      {/* Create Task Modal */}
      {showCreateTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Create Scheduled Task</h2>
              <p className="text-sm text-slate-500">Schedule a task to run automatically</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Task Name *
                </label>
                <input
                  type="text"
                  value={taskForm.name}
                  onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
                  placeholder="e.g., Daily Standup Report"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Description
                </label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="What does this task do?"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Cron Expression *
                </label>
                <input
                  type="text"
                  value={taskForm.cronExpression}
                  onChange={(e) => setTaskForm({ ...taskForm, cronExpression: e.target.value })}
                  placeholder="0 9 * * * (Daily at 9 AM)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600 font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Format: minute hour day month weekday</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  value={taskForm.timezone}
                  onChange={(e) => setTaskForm({ ...taskForm, timezone: e.target.value })}
                  placeholder="America/New_York"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowCreateTask(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={creatingTask}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creatingTask ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" /> Creating...
                  </>
                ) : (
                  'Create Task'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-left font-semibold text-slate-900">Name</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-900">Schedule</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-900">Enabled</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-900">Last Run</th>
                <th className="px-5 py-3 text-left font-semibold text-slate-900">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-500">
                    No scheduled tasks
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{task.name}</p>
                      {task.description && (
                        <p className="text-xs text-slate-500">{task.description}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {cronToHumanReadable(task.cron_expression)}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleToggleTask(task.id, task.enabled)}
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium transition-colors',
                          task.enabled
                            ? 'bg-green-50 text-green-700'
                            : 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {task.enabled ? 'On' : 'Off'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {task.last_run_at
                        ? new Date(task.last_run_at).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRunTaskNow(task.id)}
                          className="p-1 hover:bg-primary-50 rounded transition-colors"
                          title="Run now"
                        >
                          <Play className="w-4 h-4 text-primary-600" />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-1 hover:bg-red-50 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Settings Tab Component
const SettingsTab: React.FC = () => {
  const [trustSettings, setTrustSettings] = useState<AdminTrustSetting[]>([]);
  const [actionLog, setActionLog] = useState<AdminActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [allAutomatic, setAllAutomatic] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [trust, log] = await Promise.all([
          getTrustSettings(),
          getActionLog(),
        ]);
        setTrustSettings(trust);
        setActionLog(log);
        setAllAutomatic(trust.every((t) => t.trust_level === 'auto'));
      } catch (error) {
        toast.error('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleToggleAutomatic = async (enabled: boolean) => {
    try {
      await setAllAutomatic(enabled);
      setAllAutomatic(enabled);
      toast.success(enabled ? 'All actions set to automatic' : 'Actions require approval');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  const handleTrustLevelChange = async (actionType: string, trustLevel: string) => {
    try {
      await updateTrustSetting(actionType, trustLevel);
      const updated = trustSettings.map((t) =>
        t.action_type === actionType ? { ...t, trust_level: trustLevel as any } : t
      );
      setTrustSettings(updated);
      toast.success('Trust setting updated');
    } catch (error) {
      toast.error('Failed to update trust setting');
    }
  };

  const handleResetDefaults = async () => {
    try {
      await resetTrustDefaults();
      const data = await getTrustSettings();
      setTrustSettings(data);
      toast.success('Trust settings reset to defaults');
    } catch (error) {
      toast.error('Failed to reset settings');
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW':
        return 'bg-green-50 text-green-700';
      case 'MEDIUM':
        return 'bg-amber-50 text-amber-700';
      case 'HIGH':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-slate-50 text-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <Loader className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Trust Settings */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Trust Settings</h3>
            <p className="text-sm text-slate-500">Control how your assistant handles actions</p>
          </div>
          <button
            onClick={() => handleToggleAutomatic(!allAutomatic)}
            className={cn(
              'px-4 py-2 rounded-lg font-medium transition-all',
              allAutomatic
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-primary-50 text-primary-700 border border-primary-200'
            )}
          >
            {allAutomatic ? '✓ Go Fully Automatic' : 'Go Fully Automatic'}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold text-slate-900">Action Type</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-900">Risk Level</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-900">Trust Level</th>
                  <th className="px-5 py-3 text-left font-semibold text-slate-900">Approvals</th>
                </tr>
              </thead>
              <tbody>
                {trustSettings.map((setting) => (
                  <tr key={setting.action_type} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{setting.action_type}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'text-xs font-medium px-2 py-1 rounded',
                          getRiskColor(setting.risk_level)
                        )}
                      >
                        {setting.risk_level}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={setting.trust_level}
                        onChange={(e) =>
                          handleTrustLevelChange(setting.action_type, e.target.value)
                        }
                        className="px-2 py-1 rounded border border-slate-200 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                      >
                        <option value="auto">Auto</option>
                        <option value="ask">Ask</option>
                        <option value="never">Never</option>
                      </select>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {setting.approval_count} approved
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <button
          onClick={handleResetDefaults}
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
      </div>

      {/* Activity Log */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Recent Activity</h3>
        <div className="space-y-3">
          {actionLog.slice(0, 10).map((log) => (
            <div
              key={log.id}
              className="bg-white rounded-lg border border-slate-200 p-4 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-900">{log.action_name}</p>
                <p className="text-sm text-slate-600">{log.action_type}</p>
                {log.error_message && (
                  <p className="text-sm text-red-600 mt-1">{log.error_message}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-xs font-medium px-2 py-1 rounded whitespace-nowrap',
                    log.execution_status === 'success'
                      ? 'bg-green-50 text-green-700'
                      : log.execution_status === 'pending'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-red-50 text-red-700'
                  )}
                >
                  {log.execution_status}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(log.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Main Page Component
const AdminAssistantPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'skills' | 'tasks' | 'settings'>('chat');
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    const loadSessionCount = async () => {
      try {
        const sessions = await listSessions();
        setSessionCount(sessions.length);
      } catch (error) {
        // Silent fail
      }
    };
    loadSessionCount();
  }, []);

  const tabs = [
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
    { id: 'skills' as const, label: 'Skills', icon: Zap },
    { id: 'tasks' as const, label: 'Tasks', icon: Clock },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-50 rounded-lg">
              <Bot className="w-6 h-6 text-primary-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">Assistant</h1>
          </div>
          <p className="text-slate-600">Your AI-powered administrative assistant</p>
        </div>
        <div className="bg-primary-50 px-4 py-2 rounded-lg">
          <p className="text-sm text-primary-700 font-medium">{sessionCount} conversations</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-2 overflow-x-auto">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      {/* Tab Content — ChatTab stays mounted to preserve conversation state */}
      <div>
        <div className={activeTab === 'chat' ? '' : 'hidden'}><ChatTab /></div>
        {activeTab === 'skills' && <SkillsTab />}
        {activeTab === 'tasks' && <TasksTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
};

export default AdminAssistantPage;
