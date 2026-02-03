import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { ghlApi } from '@/services/ghl-api'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type, contactId, message, subject } = body

    if (!contactId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (type === 'sms') {
      await ghlApi.sendSMS(contactId, message)
    } else if (type === 'email') {
      if (!subject) {
        return NextResponse.json(
          { error: 'Subject is required for email' },
          { status: 400 }
        )
      }
      await ghlApi.sendEmail(contactId, subject, message)
    } else {
      return NextResponse.json(
        { error: 'Invalid message type' },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
