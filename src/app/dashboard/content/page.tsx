'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Wand2,
  Mail,
  MessageSquare,
  FileText,
  Megaphone,
  Copy,
  RefreshCw,
  Sparkles,
  Save,
  Send,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

type ContentType = 'sms' | 'email' | 'direct_mail' | 'social' | 'script'

interface ContentTemplate {
  id: string
  name: string
  type: ContentType
  content: string
}

const contentTypeIcons: Record<ContentType, typeof Mail> = {
  sms: MessageSquare,
  email: Mail,
  direct_mail: FileText,
  social: Megaphone,
  script: FileText,
}

const savedTemplates: ContentTemplate[] = [
  {
    id: '1',
    name: 'Initial Outreach SMS',
    type: 'sms',
    content: 'Hi {first_name}, I noticed your property at {address}. I work with investors who buy houses as-is. Would you consider an offer? Reply STOP to opt out.',
  },
  {
    id: '2',
    name: 'Follow Up Email',
    type: 'email',
    content: 'Subject: Following up on your property\n\nHi {first_name},\n\nI wanted to follow up on my previous message about your property at {address}. We can close quickly and pay all closing costs.\n\nWould you be available for a quick call this week?\n\nBest regards',
  },
  {
    id: '3',
    name: 'Motivated Seller Script',
    type: 'script',
    content: 'Hi, is this {first_name}? Great! My name is [Your Name] and I was calling about your property at {address}. I understand you might be looking to sell? [Wait for response]\n\nThat\'s great to hear. Can you tell me a little bit about the property and your situation?',
  },
]

export default function ContentCreatorPage() {
  const [activeTab, setActiveTab] = useState<ContentType>('sms')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedContent, setGeneratedContent] = useState('')
  const [prompt, setPrompt] = useState('')
  const [tone, setTone] = useState('professional')
  const [purpose, setPurpose] = useState('')

  const handleGenerate = async () => {
    if (!purpose) {
      toast.error('Please describe what you want to create')
      return
    }

    setIsGenerating(true)
    setGeneratedContent('')

    // Simulate AI generation - in production, this would call OpenAI API
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const templates: Record<ContentType, string> = {
      sms: `Hi {first_name}, I noticed your property at {address}. ${purpose.includes('distressed') ? 'I specialize in buying properties in any condition' : 'I\'m an investor looking to buy in your area'}. Would you consider a quick, hassle-free sale? Reply STOP to opt out.`,
      email: `Subject: Quick Question About Your Property at {address}\n\nHi {first_name},\n\n${purpose.includes('follow') ? 'I wanted to follow up on my previous message.' : 'I came across your property and wanted to reach out.'}\n\n${purpose.includes('distressed') ? 'I understand selling a property can be stressful. That\'s why we offer a simple process - no repairs needed, no agent commissions, and we can close on your timeline.' : 'I work with a group of investors actively buying properties in your area. We can offer a fair price and close quickly.'}\n\nWould you be open to a brief conversation about your property?\n\nBest regards,\n[Your Name]`,
      direct_mail: `ATTENTION: {first_name} {last_name}\n{address}\n{city}, {state} {zip}\n\nDear {first_name},\n\n${purpose.includes('distressed') ? 'Are you dealing with a property that needs work? We buy houses in ANY condition!' : 'I\'m reaching out because I\'m interested in buying properties in your neighborhood.'}\n\n✓ No repairs needed\n✓ No agent commissions\n✓ Close on YOUR schedule\n✓ Cash offer in 24 hours\n\nCall or text me today: [Your Phone]\n\nSincerely,\n[Your Name]`,
      social: `🏠 Looking to sell your property fast?\n\n${purpose.includes('distressed') ? 'We buy houses in ANY condition!' : 'We\'re actively buying in your area!'}\n\n✅ No repairs needed\n✅ No agent fees\n✅ Close in as little as 7 days\n✅ Fair cash offers\n\nDM me or comment "INFO" below to learn more!\n\n#RealEstate #WeBuyHouses #CashBuyer`,
      script: `OPENING:\n"Hi, is this {first_name}? Great! My name is [Your Name] and I was calling about your property at {address}."\n\nQUALIFYING QUESTIONS:\n1. "Are you the owner of this property?"\n2. "${purpose.includes('distressed') ? 'I understand the property might need some work. Can you tell me about its current condition?' : 'What made you consider selling?'}"\n3. "What timeframe are you looking at for selling?"\n4. "Do you have a price in mind?"\n\nVALUE PROPOSITION:\n"We can close quickly, buy as-is, and handle all the paperwork. No repairs, no commissions, no hassle."\n\nCLOSE:\n"I'd love to take a look at the property. Would tomorrow or the day after work better for you?"`,
    }

    setGeneratedContent(templates[activeTab])
    setIsGenerating(false)
    toast.success('Content generated!')
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent)
    toast.success('Copied to clipboard!')
  }

  const handleSaveTemplate = () => {
    toast.success('Template saved!')
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Content Creator"
        description="AI-powered content generation for your marketing campaigns"
      />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Content Generator */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Content Generator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Content Type Tabs */}
                <Tabs defaultValue="sms" onValueChange={(v) => setActiveTab(v as ContentType)}>
                  <TabsList className="w-full grid grid-cols-5">
                    <TabsTrigger value="sms">
                      <MessageSquare className="h-4 w-4 mr-1" />
                      SMS
                    </TabsTrigger>
                    <TabsTrigger value="email">
                      <Mail className="h-4 w-4 mr-1" />
                      Email
                    </TabsTrigger>
                    <TabsTrigger value="direct_mail">
                      <FileText className="h-4 w-4 mr-1" />
                      Mail
                    </TabsTrigger>
                    <TabsTrigger value="social">
                      <Megaphone className="h-4 w-4 mr-1" />
                      Social
                    </TabsTrigger>
                    <TabsTrigger value="script">
                      <FileText className="h-4 w-4 mr-1" />
                      Script
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Generation Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Tone</label>
                    <Select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      options={[
                        { value: 'professional', label: 'Professional' },
                        { value: 'friendly', label: 'Friendly' },
                        { value: 'urgent', label: 'Urgent' },
                        { value: 'empathetic', label: 'Empathetic' },
                        { value: 'casual', label: 'Casual' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Target Audience</label>
                    <Select
                      options={[
                        { value: 'motivated_seller', label: 'Motivated Sellers' },
                        { value: 'distressed', label: 'Distressed Property Owners' },
                        { value: 'absentee', label: 'Absentee Owners' },
                        { value: 'pre_foreclosure', label: 'Pre-Foreclosure' },
                        { value: 'probate', label: 'Probate' },
                        { value: 'general', label: 'General' },
                      ]}
                      placeholder="Select audience..."
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">
                    Describe what you want to create *
                  </label>
                  <Textarea
                    rows={3}
                    placeholder="e.g., Create a follow-up SMS for motivated sellers who haven't responded to initial outreach..."
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      Generate Content
                    </>
                  )}
                </Button>

                {/* Generated Content */}
                {generatedContent && (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Generated Content</h4>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleGenerate}>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Regenerate
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleCopy}>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      rows={10}
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleSaveTemplate}>
                        <Save className="h-4 w-4 mr-2" />
                        Save as Template
                      </Button>
                      <Button>
                        <Send className="h-4 w-4 mr-2" />
                        Use in Campaign
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Saved Templates */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Saved Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {savedTemplates.map((template) => {
                    const Icon = contentTypeIcons[template.type]
                    return (
                      <div
                        key={template.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => {
                          setActiveTab(template.type)
                          setGeneratedContent(template.content)
                        }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium text-sm">{template.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {template.content}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-sm">Tips for Better Content</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• Keep SMS messages under 160 characters</li>
                  <li>• Always include a clear call-to-action</li>
                  <li>• Personalize with merge fields like {'{first_name}'}</li>
                  <li>• Include opt-out instructions for compliance</li>
                  <li>• Test different tones to see what works best</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
