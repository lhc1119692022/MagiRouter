import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, PlugZap, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { handleServerError } from '@/lib/handle-server-error'

import {
  getViolationAuditSettings,
  testViolationAuditConnection,
  updateViolationAuditSettings,
} from '../api'
import type {
  ViolationAuditProtocol,
  ViolationAuditSettings,
  ViolationConnectionTestResult,
} from '../types'

const BUILTIN_SECURITY_PLUGINS = [
  { key: 'request-filter', labelKey: 'Request filter (Keywords / Regex)' },
  { key: 'llm-security-guard', labelKey: 'LLM security guard' },
  { key: 'content-moderation', labelKey: 'Content moderation' },
]

const DEFAULT_SETTINGS: ViolationAuditSettings = {
  enabled: true,
  auto_audit_enabled: false,
  interval_minutes: 30,
  threshold_count: 3,
  window_hours: 24,
  retention_days: 30,
  max_excerpt_chars: 4000,
  max_events_per_audit: 20,
  protocol: 'auto',
  endpoint: 'https://api.deepseek.com/v1/chat/completions',
  model: 'deepseek-flash',
  api_key: '',
  has_api_key: false,
  clear_api_key: false,
  timeout_seconds: 60,
  extra_policy: '',
  tracked_plugins: [
    'request-filter',
    'content-moderation',
    'llm-security-guard',
  ],
}

interface ViolationAuditSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function ViolationAuditSettingsDialog(
  props: ViolationAuditSettingsDialogProps
) {
  const { open, onOpenChange, onSaved } = props
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ViolationAuditSettings>(DEFAULT_SETTINGS)
  const [testResult, setTestResult] =
    useState<ViolationConnectionTestResult | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['violation-audit', 'settings'],
    queryFn: getViolationAuditSettings,
    enabled: open,
  })

  useEffect(() => {
    if (settingsQuery.data) {
      setForm({
        ...settingsQuery.data,
        tracked_plugins: settingsQuery.data.tracked_plugins ?? [],
        api_key: '',
        clear_api_key: false,
      })
      setTestResult(null)
    }
  }, [settingsQuery.data, open])

  const saveMutation = useMutation({
    mutationFn: updateViolationAuditSettings,
    onSuccess: (saved) => {
      queryClient.setQueryData(['violation-audit', 'settings'], saved)
      toast.success(t('Violation audit settings saved'))
      onSaved()
      onOpenChange(false)
    },
    onError: (error) => {
      handleServerError(error, t('Failed to save violation audit settings'))
    },
  })

  const testMutation = useMutation({
    mutationFn: testViolationAuditConnection,
    onSuccess: (result) => {
      setTestResult(result)
      toast.success(t('Audit model connection succeeded'))
    },
    onError: (error) => {
      setTestResult(null)
      handleServerError(error, t('Audit model connection failed'))
    },
  })

  const togglePlugin = (pluginKey: string, checked: boolean) => {
    setForm((prev) => {
      const current = prev.tracked_plugins ?? []
      const next = checked
        ? [...new Set([...current, pluginKey])]
        : current.filter((item) => item !== pluginKey)
      return { ...prev, tracked_plugins: next }
    })
  }

  const updateNumberField = (
    key:
      | 'threshold_count'
      | 'window_hours'
      | 'interval_minutes'
      | 'retention_days'
      | 'max_events_per_audit'
      | 'timeout_seconds',
    raw: string
  ) => {
    const parsed = Number.parseInt(raw, 10)
    setForm((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) ? parsed : 0,
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[90vh] max-w-2xl flex-col overflow-hidden'>
        <DialogHeader>
          <DialogTitle>{t('Violation Audit Settings')}</DialogTitle>
          <DialogDescription>
            {t(
              'Configure violation evidence capture thresholds and the scheduled LLM reviewer used for account-level audits.'
            )}
          </DialogDescription>
        </DialogHeader>

        {settingsQuery.isLoading ? (
          <LoadingState />
        ) : (
          <div className='min-h-0 flex-1 overflow-y-auto pr-2'>
            <div className='space-y-5 pb-2'>
              <div className='space-y-3 rounded-lg border p-4'>
                <div className='flex items-center justify-between gap-4'>
                  <div>
                    <div className='text-sm font-medium'>
                      {t('Capture blocked violation evidence')}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      {t(
                        'Only store prompts rejected by selected security plugins; normal traffic is never stored.'
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, enabled: checked }))
                    }
                    aria-label={t('Capture blocked violation evidence')}
                  />
                </div>

                <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-threshold'>
                      {t('Screening threshold (hits)')}
                    </Label>
                    <Input
                      id='va-threshold'
                      type='number'
                      min={1}
                      max={100}
                      value={form.threshold_count}
                      onChange={(e) =>
                        updateNumberField('threshold_count', e.target.value)
                      }
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-window'>
                      {t('Screening window (hours)')}
                    </Label>
                    <Input
                      id='va-window'
                      type='number'
                      min={1}
                      max={720}
                      value={form.window_hours}
                      onChange={(e) =>
                        updateNumberField('window_hours', e.target.value)
                      }
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-retention'>
                      {t('Evidence retention (days)')}
                    </Label>
                    <Input
                      id='va-retention'
                      type='number'
                      min={1}
                      max={365}
                      value={form.retention_days}
                      onChange={(e) =>
                        updateNumberField('retention_days', e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label>{t('Tracked interception plugins')}</Label>
                  <div className='flex flex-wrap gap-4'>
                    {BUILTIN_SECURITY_PLUGINS.map((plugin) => (
                      <label
                        key={plugin.key}
                        className='flex cursor-pointer items-center gap-2 text-sm'
                      >
                        <Checkbox
                          checked={form.tracked_plugins.includes(plugin.key)}
                          onCheckedChange={(checked) =>
                            togglePlugin(plugin.key, checked === true)
                          }
                        />
                        <span>{t(plugin.labelKey)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className='space-y-3 rounded-lg border p-4'>
                <div className='flex items-center justify-between gap-4'>
                  <div>
                    <div className='text-sm font-medium'>
                      {t('Scheduled background LLM audit')}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      {t(
                        'Periodically review screened accounts using DeepSeek Flash or any compatible model.'
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={form.auto_audit_enabled}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({
                        ...prev,
                        auto_audit_enabled: checked,
                      }))
                    }
                    aria-label={t('Scheduled background LLM audit')}
                  />
                </div>

                <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-interval'>
                      {t('Audit interval (minutes)')}
                    </Label>
                    <Input
                      id='va-interval'
                      type='number'
                      min={1}
                      max={10080}
                      value={form.interval_minutes}
                      onChange={(e) =>
                        updateNumberField('interval_minutes', e.target.value)
                      }
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-protocol'>{t('API protocol')}</Label>
                    <Select
                      value={form.protocol}
                      onValueChange={(value) => {
                        if (!value) return
                        setForm((prev) => ({
                          ...prev,
                          protocol: value as ViolationAuditProtocol,
                        }))
                      }}
                    >
                      <SelectTrigger id='va-protocol'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='auto'>
                          {t('Auto detect from URL')}
                        </SelectItem>
                        <SelectItem value='openai_chat'>
                          OpenAI Chat Completions
                        </SelectItem>
                        <SelectItem value='openai_responses'>
                          OpenAI Responses
                        </SelectItem>
                        <SelectItem value='anthropic'>
                          Anthropic Messages
                        </SelectItem>
                        <SelectItem value='gemini'>Google Gemini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className='space-y-1.5'>
                  <Label htmlFor='va-endpoint'>
                    {t('Audit model endpoint URL')}
                  </Label>
                  <Input
                    id='va-endpoint'
                    value={form.endpoint}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, endpoint: e.target.value }))
                    }
                    placeholder='https://api.deepseek.com/v1/chat/completions'
                  />
                </div>

                <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-model'>{t('Audit model name')}</Label>
                    <Input
                      id='va-model'
                      value={form.model}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, model: e.target.value }))
                      }
                      placeholder='deepseek-flash'
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-apikey'>{t('Audit API key')}</Label>
                    <div className='flex gap-2'>
                      <Input
                        id='va-apikey'
                        type='password'
                        value={form.api_key ?? ''}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            api_key: e.target.value,
                            clear_api_key: false,
                          }))
                        }
                        placeholder={
                          form.has_api_key && !form.clear_api_key
                            ? t('API key configured (leave blank to keep)')
                            : 'sk-...'
                        }
                      />
                      {form.has_api_key && !form.clear_api_key && (
                        <Button
                          type='button'
                          variant='outline'
                          size='icon'
                          title={t('Clear saved API key')}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              api_key: '',
                              clear_api_key: true,
                            }))
                          }
                        >
                          <Trash2 className='size-4' />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-max-events'>
                      {t('Max events per account audit')}
                    </Label>
                    <Input
                      id='va-max-events'
                      type='number'
                      min={1}
                      max={50}
                      value={form.max_events_per_audit}
                      onChange={(e) =>
                        updateNumberField(
                          'max_events_per_audit',
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='va-timeout'>
                      {t('Request timeout (seconds)')}
                    </Label>
                    <Input
                      id='va-timeout'
                      type='number'
                      min={5}
                      max={180}
                      value={form.timeout_seconds}
                      onChange={(e) =>
                        updateNumberField('timeout_seconds', e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className='space-y-1.5'>
                  <Label htmlFor='va-policy'>
                    {t('Additional site policy instructions (optional)')}
                  </Label>
                  <Textarea
                    id='va-policy'
                    rows={3}
                    value={form.extra_policy}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        extra_policy: e.target.value,
                      }))
                    }
                    placeholder={t(
                      'Optional extra rules for distinguishing malicious abuse from legitimate use...'
                    )}
                  />
                </div>

                {testResult && (
                  <Alert>
                    <CheckCircle2 className='size-4 text-emerald-600' />
                    <AlertDescription>
                      {t(
                        'Connected ({{protocol}}, {{latency}} ms): {{reply}}',
                        {
                          protocol: testResult.protocol,
                          latency: testResult.latency_ms,
                          reply: testResult.reply,
                        }
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className='gap-2 sm:justify-between'>
          <Button
            type='button'
            variant='outline'
            disabled={testMutation.isPending || settingsQuery.isLoading}
            onClick={() => testMutation.mutate(form)}
          >
            {testMutation.isPending ? (
              <Loader2 className='mr-1.5 size-4 animate-spin' />
            ) : (
              <PlugZap className='mr-1.5 size-4' />
            )}
            {t('Test Connection')}
          </Button>
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              disabled={saveMutation.isPending || settingsQuery.isLoading}
              onClick={() => saveMutation.mutate(form)}
            >
              {saveMutation.isPending && (
                <Loader2 className='mr-1.5 size-4 animate-spin' />
              )}
              {t('Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
