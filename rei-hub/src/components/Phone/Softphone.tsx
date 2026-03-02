/// <reference types="node" />

/**
 * Softphone — browser-based calling widget using Twilio Voice SDK (WebRTC).
 *
 * Renders a floating pill in the bottom-right corner that expands into
 * a full dial-pad / active-call UI.  Connects to Twilio via the
 * `/api/phone/token` endpoint which returns an Access Token.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  Mic,
  MicOff,
  Pause,
  Play,
  X,
  Minimize2,
  Maximize2,
  Volume2,
  Hash,
} from 'lucide-react'
import { Device, Call } from '@twilio/voice-sdk'
import * as phoneApi from '@/services/phoneApi'
import { toast } from 'sonner'

type SoftphoneStatus = 'offline' | 'connecting' | 'ready' | 'ringing' | 'on-call'

const DTMF_KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

export default function Softphone() {
  const [status, setStatus] = useState<SoftphoneStatus>('offline')
  const [expanded, setExpanded] = useState(false)
  const [muted, setMuted] = useState(false)
  const [held, setHeld] = useState(false)
  const [showDtmf, setShowDtmf] = useState(false)
  const [dialNumber, setDialNumber] = useState('')
  const [callDuration, setCallDuration] = useState(0)
  const [callerInfo, setCallerInfo] = useState('')
  const [incomingCall, setIncomingCall] = useState<Call | null>(null)

  const deviceRef = useRef<Device | null>(null)
  const activeCallRef = useRef<Call | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const tokenRefreshRef = useRef<NodeJS.Timeout | null>(null)

  // ── Connect to Twilio on mount ──────────────────────────────────

  const initDevice = useCallback(async () => {
    try {
      setStatus('connecting')
      const { token, identity } = await phoneApi.getSoftphoneToken()

      // Demo mode check
      if (token === 'demo-token') {
        setStatus('ready')
        return
      }

      const device = new Device(token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      })

      device.on('registered', () => {
        setStatus('ready')
      })

      device.on('error', (err) => {
        console.error('Twilio Device error:', err)
        toast.error(`Softphone error: ${err.message}`)
        setStatus('offline')
      })

      device.on('incoming', (call: Call) => {
        setIncomingCall(call)
        setCallerInfo(call.parameters?.From || 'Unknown')
        setStatus('ringing')
        setExpanded(true)

        call.on('cancel', () => {
          setIncomingCall(null)
          setStatus('ready')
          setCallerInfo('')
        })
      })

      device.on('tokenWillExpire', async () => {
        try {
          const { token: newToken } = await phoneApi.getSoftphoneToken()
          device.updateToken(newToken)
        } catch {
          console.error('Failed to refresh Twilio token')
        }
      })

      await device.register()
      deviceRef.current = device

      // Schedule token refresh every 50 minutes (tokens last 60 min)
      tokenRefreshRef.current = setInterval(async () => {
        try {
          const { token: newToken } = await phoneApi.getSoftphoneToken()
          device.updateToken(newToken)
        } catch {
          console.error('Failed to refresh token')
        }
      }, 50 * 60 * 1000)

    } catch (err: any) {
      console.error('Softphone init failed:', err)
      setStatus('offline')
    }
  }, [])

  useEffect(() => {
    initDevice()

    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy()
        deviceRef.current = null
      }
      if (timerRef.current) clearInterval(timerRef.current)
      if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current)
    }
  }, [initDevice])

  // ── Call duration timer ─────────────────────────────────────────

  function startTimer() {
    setCallDuration(0)
    timerRef.current = setInterval(() => {
      setCallDuration((d) => d + 1)
    }, 1000)
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setCallDuration(0)
  }

  function formatDuration(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // ── Call actions ────────────────────────────────────────────────

  async function handleDial() {
    if (!dialNumber.trim()) return

    const device = deviceRef.current
    if (!device) {
      toast.error('Softphone not connected')
      return
    }

    try {
      const call = await device.connect({
        params: { To: dialNumber },
      })

      activeCallRef.current = call
      setStatus('on-call')
      setCallerInfo(dialNumber)
      startTimer()

      call.on('disconnect', () => {
        handleCallEnd()
      })

      call.on('cancel', () => {
        handleCallEnd()
      })

      call.on('error', (err) => {
        console.error('Call error:', err)
        toast.error('Call failed')
        handleCallEnd()
      })
    } catch (err: any) {
      toast.error(err.message || 'Failed to place call')
    }
  }

  function handleAccept() {
    if (!incomingCall) return

    incomingCall.accept()
    activeCallRef.current = incomingCall
    setIncomingCall(null)
    setStatus('on-call')
    startTimer()

    incomingCall.on('disconnect', () => {
      handleCallEnd()
    })
  }

  function handleReject() {
    if (incomingCall) {
      incomingCall.reject()
      setIncomingCall(null)
      setStatus('ready')
      setCallerInfo('')
    }
  }

  function handleHangup() {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect()
    }
    handleCallEnd()
  }

  function handleCallEnd() {
    activeCallRef.current = null
    setStatus('ready')
    setMuted(false)
    setHeld(false)
    setShowDtmf(false)
    setCallerInfo('')
    stopTimer()
  }

  function toggleMute() {
    const call = activeCallRef.current
    if (!call) return
    const newMuted = !muted
    call.mute(newMuted)
    setMuted(newMuted)
  }

  function toggleHold() {
    // Twilio JS SDK doesn't have a native hold — we mute as a workaround
    const call = activeCallRef.current
    if (!call) return
    const newHeld = !held
    call.mute(newHeld)
    setHeld(newHeld)
    setMuted(newHeld)
  }

  function sendDtmf(digit: string) {
    const call = activeCallRef.current
    if (!call) return
    call.sendDigits(digit)
  }

  function handleKeypadPress(key: string) {
    if (status === 'on-call') {
      sendDtmf(key)
    } else {
      setDialNumber((n) => n + key)
    }
  }

  // ── Status indicator colors ─────────────────────────────────────

  const statusColor: Record<SoftphoneStatus, string> = {
    offline: 'bg-slate-400',
    connecting: 'bg-yellow-400 animate-pulse',
    ready: 'bg-green-500',
    ringing: 'bg-blue-500 animate-pulse',
    'on-call': 'bg-red-500',
  }

  const statusLabel: Record<SoftphoneStatus, string> = {
    offline: 'Offline',
    connecting: 'Connecting...',
    ready: 'Ready',
    ringing: 'Incoming Call',
    'on-call': formatDuration(callDuration),
  }

  // ── Render ──────────────────────────────────────────────────────

  // Minimized pill
  if (!expanded) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-white text-sm font-medium transition-all hover:scale-105 ${
            status === 'ringing'
              ? 'bg-blue-600 animate-bounce'
              : status === 'on-call'
              ? 'bg-red-600'
              : 'bg-slate-800 hover:bg-slate-700'
          }`}
        >
          <div className={`w-2.5 h-2.5 rounded-full ${statusColor[status]}`} />
          <Phone className="w-4 h-4" />
          <span>{statusLabel[status]}</span>
          {status === 'ringing' && <PhoneIncoming className="w-4 h-4 animate-pulse" />}
        </button>
      </div>
    )
  }

  // Expanded widget
  return (
    <div className="fixed bottom-6 right-6 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColor[status]}`} />
          <span className="text-sm font-medium">Softphone</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-400">{statusLabel[status]}</span>
          <button
            onClick={() => setExpanded(false)}
            className="ml-2 p-1 hover:bg-slate-700 rounded"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Incoming Call UI */}
      {status === 'ringing' && incomingCall && (
        <div className="p-6 text-center">
          <PhoneIncoming className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-pulse" />
          <p className="text-sm font-medium text-slate-900">{callerInfo}</p>
          <p className="text-xs text-slate-500 mb-4">Incoming Call</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleAccept}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm rounded-full hover:bg-green-700"
            >
              <Phone className="w-4 h-4" /> Accept
            </button>
            <button
              onClick={handleReject}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm rounded-full hover:bg-red-700"
            >
              <PhoneOff className="w-4 h-4" /> Decline
            </button>
          </div>
        </div>
      )}

      {/* Active Call UI */}
      {status === 'on-call' && (
        <div className="p-4">
          <div className="text-center mb-4">
            <p className="text-sm font-medium text-slate-900">{callerInfo}</p>
            <p className="text-lg font-mono text-red-600">{formatDuration(callDuration)}</p>
          </div>

          {/* DTMF Keypad */}
          {showDtmf && (
            <div className="grid grid-cols-3 gap-1 mb-3">
              {DTMF_KEYS.flat().map((key) => (
                <button
                  key={key}
                  onClick={() => sendDtmf(key)}
                  className="py-2 text-sm font-medium bg-slate-100 rounded hover:bg-slate-200"
                >
                  {key}
                </button>
              ))}
            </div>
          )}

          {/* Call Controls */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={toggleMute}
              className={`p-2.5 rounded-full ${
                muted ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleHold}
              className={`p-2.5 rounded-full ${
                held ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title={held ? 'Resume' : 'Hold'}
            >
              {held ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setShowDtmf(!showDtmf)}
              className={`p-2.5 rounded-full ${
                showDtmf ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              title="Keypad"
            >
              <Hash className="w-4 h-4" />
            </button>
            <button
              onClick={handleHangup}
              className="p-2.5 rounded-full bg-red-600 text-white hover:bg-red-700"
              title="End Call"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Idle / Dial UI */}
      {(status === 'ready' || status === 'connecting' || status === 'offline') && (
        <div className="p-4">
          {/* Number input */}
          <div className="flex items-center gap-2 mb-3">
            <input
              type="tel"
              value={dialNumber}
              onChange={(e) => setDialNumber(e.target.value)}
              placeholder="+1 (555) 123-4567"
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && dialNumber.trim()) handleDial()
              }}
            />
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-1 mb-3">
            {DTMF_KEYS.flat().map((key) => (
              <button
                key={key}
                onClick={() => handleKeypadPress(key)}
                className="py-2.5 text-sm font-medium bg-slate-50 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
              >
                {key}
              </button>
            ))}
          </div>

          {/* Dial button */}
          <button
            onClick={handleDial}
            disabled={!dialNumber.trim() || status !== 'ready'}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Phone className="w-4 h-4" />
            {status === 'connecting' ? 'Connecting...' : 'Call'}
          </button>

          {status === 'offline' && (
            <button
              onClick={initDevice}
              className="w-full mt-2 py-2 text-xs text-primary-600 hover:underline"
            >
              Reconnect
            </button>
          )}
        </div>
      )}
    </div>
  )
}
