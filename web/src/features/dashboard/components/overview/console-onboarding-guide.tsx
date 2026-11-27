import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Plus,
  Sparkles,
  Terminal,
  Wallet,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { fetchTokenKey } from '@/features/keys/api'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

const MODEL_BADGES = [
  { name: 'GPT', icon: 'OpenAI' },
  { name: 'Claude', icon: 'Claude.Color' },
  { name: 'Gemini', icon: 'Gemini.Color' },
  { name: 'DeepSeek', icon: 'DeepSeek.Color' },
  { name: 'Qwen', icon: 'Qwen.Color' },
  { name: 'Doubao', icon: 'Doubao.Color' },
  { name: 'GLM', icon: 'Zhipu.Color' },
  { name: 'Grok', icon: 'Grok' },
  { name: 'Kimi', icon: 'Kimi.Color' },
] as const

type AppGuideTile =
  | { id: string; name: string; kind: 'lobe'; icon: string; tipKey: string }
  | { id: string; name: string; kind: 'asset'; src: string; tipKey: string }

const APP_GUIDE_TILES: readonly AppGuideTile[] = [
  {
    id: 'cc-switch',
    name: 'CC Switch',
    kind: 'asset',
    src: '/cc-switch-icon.png',
    tipKey:
      'Open CC Switch, add a profile, paste the root Base URL (no /v1) and API Key above, then sync to Claude Code / Codex in one click.',
  },
  {
    id: 'magpie',
    name: 'Magpie',
    kind: 'asset',
    src: '/magpie-icon.svg',
    tipKey:
      'Open Magpie → Settings → Model Providers → add a provider, then paste the Base URL and API Key above to start chatting.',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'lobe',
    icon: 'ClaudeCode.Color',
    tipKey:
      'Use CC Switch for one-click setup, or set ANTHROPIC_BASE_URL to the Base URL above and ANTHROPIC_AUTH_TOKEN to your API Key.',
  },
  {
    id: 'codex',
    name: 'Codex',
    kind: 'lobe',
    icon: 'Codex.Color',
    tipKey:
      'Use CC Switch for one-click setup, or paste the Base URL above into Codex base_url together with your API Key.',
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    kind: 'lobe',
    icon: 'CodeBuddy.Color',
    tipKey:
      'Open Settings → Custom Model / API Provider, paste the Base URL and API Key above, then pick a model to start.',
  },
  {
    id: 'doubao-work',
    name: '豆包工作',
    kind: 'lobe',
    icon: 'Doubao.Color',
    tipKey:
      'Open Settings → Custom Model / API Provider, paste the Base URL and API Key above, then pick a model to start.',
  },
  {
    id: 'zcode',
    name: 'ZCode',
    kind: 'lobe',
    icon: 'ZAI',
    tipKey:
      'Open Settings → Custom Model / API Provider, paste the Base URL and API Key above, then pick a model to start.',
  },
  {
    id: 'qoder',
    name: 'Qoder',
    kind: 'lobe',
    icon: 'Qoder.Color',
    tipKey:
      'Open Settings → Custom Model / API Provider, paste the Base URL and API Key above, then pick a model to start.',
  },
] as const

export interface ConsoleOnboardingGuideProps {
  remainQuota: number
  balanceReady: boolean
  hasActiveKey: boolean
  hasFirstRequest: boolean
  keyId?: number
  keyName: string
  keyCount?: number
  displayKey: string
  apiBaseUrl: string
  modelStatus?: string
  developerCurlPreview: ReactNode
}

export function ConsoleOnboardingGuide(props: ConsoleOnboardingGuideProps) {
  const { t } = useTranslation()
  const [selectedAppId, setSelectedAppId] = useState<string>(
    APP_GUIDE_TILES[0].id
  )
  const [copyingKey, setCopyingKey] = useState(false)
  const [copiedField, setCopiedField] = useState<'url' | 'key' | null>(null)
  const [devCurlOpen, setDevCurlOpen] = useState(false)
  const { copyToClipboard } = useCopyToClipboard({ notify: false })

  const selectedApp =
    APP_GUIDE_TILES.find((item) => item.id === selectedAppId) ??
    APP_GUIDE_TILES[0]

  const markCopied = (field: 'url' | 'key') => {
    setCopiedField(field)
    window.setTimeout(() => {
      setCopiedField((current) => (current === field ? null : current))
    }, 1800)
  }

  const handleCopyBaseUrl = async () => {
    const copied = await copyToClipboard(props.apiBaseUrl)
    if (copied) {
      markCopied('url')
      toast.success(t('Copied to clipboard'))
    } else {
      toast.error(t('Failed to copy to clipboard'))
    }
  }

  const handleCopyApiKey = async () => {
    if (!props.keyId || copyingKey) return
    setCopyingKey(true)
    try {
      const result = await fetchTokenKey(props.keyId)
      const key = result.success && result.data?.key ? result.data.key : ''
      if (!key) {
        handleServerError(result, t('Failed to copy to clipboard'))
        return
      }
      const copied = await copyToClipboard(`sk-${key}`)
      if (copied) {
        markCopied('key')
        toast.success(t('Copied to clipboard'))
      } else {
        toast.error(t('Failed to copy to clipboard'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to copy to clipboard'))
    } finally {
      setCopyingKey(false)
    }
  }

  return (
    <div className='console-onboarding-wrap'>
      <div className='console-onboarding-board'>
        <section className='console-onboarding-step'>
          <div className='console-onboarding-step-head'>
            <span
              className={cn(
                'onboarding-step-num tabular-nums',
                props.balanceReady && 'is-done'
              )}
            >
              {props.balanceReady ? <Check className='size-3.5' /> : 1}
            </span>
            <h3 className='console-onboarding-step-title'>
              {t('Prepare account balance')}
            </h3>
            <span
              className={cn(
                'console-onboarding-status',
                props.balanceReady && 'is-done'
              )}
            >
              {props.balanceReady ? t('Ready') : t('Step 1')}
            </span>
          </div>

          <div className='console-onboarding-step-body'>
            <div className='console-onboarding-balance-block'>
              <span className='console-onboarding-balance-label'>
                {t('Available balance')}
              </span>
              <strong className='console-onboarding-balance-val tabular-nums'>
                {formatQuota(props.remainQuota)}
              </strong>
              <p className='console-onboarding-step-note'>
                {t(
                  'Top up on demand (¥1 = $1 credit, never expires). A few yuan is enough to get started.'
                )}
              </p>
            </div>

            <div className='console-onboarding-stack-actions'>
              <Link
                to='/wallet'
                className='el-btn el-btn-md el-btn-primary console-onboarding-btn-full'
              >
                <Wallet className='size-4' aria-hidden='true' />
                <span>{t('Online top-up')}</span>
              </Link>
              <Link
                to='/pricing'
                className='el-btn el-btn-md el-btn-white console-onboarding-btn-full'
              >
                <span>{t('Browse models & pricing')}</span>
              </Link>
            </div>
          </div>
        </section>

        <section className='console-onboarding-step'>
          <div className='console-onboarding-step-head'>
            <span
              className={cn(
                'onboarding-step-num tabular-nums',
                props.hasActiveKey && 'is-done'
              )}
            >
              {props.hasActiveKey ? <Check className='size-3.5' /> : 2}
            </span>
            <h3 className='console-onboarding-step-title'>
              {t('Create & manage API keys')}
            </h3>
            <span
              className={cn(
                'console-onboarding-status',
                props.hasActiveKey && 'is-done'
              )}
            >
              {props.hasActiveKey ? t('Ready') : t('Step 2')}
            </span>
          </div>

          <div className='console-onboarding-step-body'>
            <div className='console-onboarding-key-summary'>
              <div className='console-onboarding-key-summary-top'>
                <span className='console-onboarding-key-summary-label'>
                  <span
                    className={cn(
                      'console-onboarding-key-dot',
                      props.hasActiveKey && 'is-active'
                    )}
                    aria-hidden='true'
                  />
                  {props.hasActiveKey
                    ? t('Active API key')
                    : t('No active API key yet')}
                </span>
                {typeof props.keyCount === 'number' && props.keyCount > 0 && (
                  <span className='console-onboarding-key-count tabular-nums'>
                    {t('{{count}} keys total', { count: props.keyCount })}
                  </span>
                )}
              </div>
              {props.hasActiveKey ? (
                <div className='console-onboarding-key-summary-val'>
                  <strong className='console-onboarding-key-name'>
                    {props.keyName}
                  </strong>
                  <span className='console-onboarding-key-mask'>
                    {props.displayKey}
                  </span>
                </div>
              ) : (
                <p className='console-onboarding-step-note'>
                  {t(
                    'Create one key to unlock all major models, then copy it in step 3.'
                  )}
                </p>
              )}
            </div>

            <div className='console-onboarding-inline-actions'>
              <Link
                to='/keys'
                search={{ action: 'create' }}
                className='el-btn el-btn-md el-btn-primary'
              >
                <Plus className='size-3.5' aria-hidden='true' />
                <span>{t('Create API Key')}</span>
              </Link>
              <Link to='/keys' className='el-btn el-btn-md el-btn-white'>
                <KeyRound className='size-3.5' aria-hidden='true' />
                <span>{t('Manage Keys')}</span>
              </Link>
            </div>

            <div className='console-onboarding-models-block'>
              <span className='console-onboarding-sublabel'>
                {t('One key works across all major models')}
              </span>
              <div
                className='console-onboarding-model-list'
                aria-label={t('Supported model families')}
              >
                {MODEL_BADGES.map((badge) => (
                  <span
                    key={badge.name}
                    className='console-onboarding-model-chip'
                  >
                    <span className='onboarding-model-pill-icon'>
                      {getLobeIcon(badge.icon, 14)}
                    </span>
                    <span>{badge.name}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className='console-onboarding-step console-onboarding-step-connect'>
          <div className='console-onboarding-step-head'>
            <span
              className={cn(
                'onboarding-step-num tabular-nums',
                props.hasFirstRequest && 'is-done'
              )}
            >
              {props.hasFirstRequest ? <Check className='size-3.5' /> : 3}
            </span>
            <h3 className='console-onboarding-step-title'>
              {t('Paste into an app & start')}
            </h3>
            <span
              className={cn(
                'console-onboarding-status',
                props.hasFirstRequest && 'is-done'
              )}
            >
              {props.hasFirstRequest ? t('Connected') : t('Step 3')}
            </span>
          </div>

          <div className='console-onboarding-step-body'>
            <div className='console-onboarding-credentials'>
              <div className='console-onboarding-cred-row'>
                <div className='console-onboarding-cred-main'>
                  <div className='console-onboarding-cred-meta'>
                    <span className='console-onboarding-cred-label'>
                      {t('Base URL')}
                    </span>
                    <span className='console-onboarding-cred-hint'>
                      {t('No /v1 needed')}
                    </span>
                  </div>
                  <input
                    type='text'
                    readOnly
                    aria-label={t('API Base URL')}
                    value={props.apiBaseUrl}
                    onFocus={(event) => event.currentTarget.select()}
                    className='console-onboarding-cred-value'
                  />
                </div>
                <button
                  type='button'
                  className='console-onboarding-copy-btn'
                  onClick={handleCopyBaseUrl}
                >
                  {copiedField === 'url' ? (
                    <Check className='size-3.5' aria-hidden='true' />
                  ) : (
                    <Copy className='size-3.5' aria-hidden='true' />
                  )}
                  <span>
                    {copiedField === 'url' ? t('Copied') : t('Copy URL')}
                  </span>
                </button>
              </div>

              <div className='console-onboarding-cred-row'>
                <div className='console-onboarding-cred-main'>
                  <div className='console-onboarding-cred-meta'>
                    <span className='console-onboarding-cred-label'>
                      {t('API Key')}
                    </span>
                    {props.hasActiveKey && (
                      <span className='console-onboarding-cred-keytag'>
                        {props.keyName}
                      </span>
                    )}
                  </div>
                  <input
                    type='text'
                    readOnly
                    aria-label={t('Active API key')}
                    value={
                      props.hasActiveKey
                        ? props.displayKey
                        : t('Create in step 2 first')
                    }
                    className='console-onboarding-cred-value'
                  />
                </div>
                {props.hasActiveKey && props.keyId ? (
                  <button
                    type='button'
                    className='console-onboarding-copy-btn'
                    disabled={copyingKey}
                    onClick={handleCopyApiKey}
                  >
                    {copiedField === 'key' ? (
                      <Check className='size-3.5' aria-hidden='true' />
                    ) : (
                      <Copy className='size-3.5' aria-hidden='true' />
                    )}
                    <span>
                      {copiedField === 'key' ? t('Copied') : t('Copy API key')}
                    </span>
                  </button>
                ) : (
                  <Link
                    to='/keys'
                    search={{ action: 'create' }}
                    className='console-onboarding-copy-btn'
                  >
                    <Plus className='size-3.5' aria-hidden='true' />
                    {t('Create')}
                  </Link>
                )}
              </div>
            </div>

            <div className='console-onboarding-app-section'>
              <span className='console-onboarding-sublabel'>
                {t('Pick your AI app and paste the two fields above')}
              </span>
              <div
                className='console-onboarding-apps'
                role='group'
                aria-label={t('Choose an AI app to see setup steps')}
              >
                {APP_GUIDE_TILES.map((app) => {
                  const selected = app.id === selectedApp.id
                  return (
                    <button
                      key={app.id}
                      type='button'
                      aria-pressed={selected}
                      className={cn(
                        'console-onboarding-app-chip',
                        selected && 'is-selected'
                      )}
                      onClick={() => setSelectedAppId(app.id)}
                    >
                      <span className='console-onboarding-app-icon'>
                        {app.kind === 'lobe' ? (
                          getLobeIcon(app.icon, 16)
                        ) : (
                          <img
                            src={app.src}
                            alt=''
                            width={16}
                            height={16}
                            className='console-onboarding-app-asset'
                          />
                        )}
                      </span>
                      <span className='console-onboarding-app-name'>
                        {app.name}
                      </span>
                    </button>
                  )
                })}
              </div>

              <p className='console-onboarding-app-tip'>
                <span className='console-onboarding-app-tip-name'>
                  {selectedApp.name}
                </span>
                <span>{t(selectedApp.tipKey)}</span>
              </p>
            </div>

            <div className='console-onboarding-inline-actions'>
              <Link
                to='/playground'
                className='el-btn el-btn-md el-btn-primary'
              >
                <Sparkles className='size-3.5' aria-hidden='true' />
                <span>{t('Try in Playground')}</span>
              </Link>
              <Link to='/docs' className='el-btn el-btn-md el-btn-white'>
                <BookOpen className='size-3.5' aria-hidden='true' />
                <span>{t('Setup guide')}</span>
              </Link>
            </div>
          </div>
        </section>
      </div>

      <div className='console-onboarding-dev-bar'>
        <button
          type='button'
          className='console-onboarding-dev-toggle'
          aria-expanded={devCurlOpen}
          onClick={() => setDevCurlOpen((open) => !open)}
        >
          <Terminal className='size-3.5' aria-hidden='true' />
          <span>{t('Developer cURL example')}</span>
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform duration-150',
              devCurlOpen && 'rotate-180'
            )}
            aria-hidden='true'
          />
        </button>
        {props.modelStatus && (
          <span className='text-muted-foreground text-xs' role='status'>
            {props.modelStatus}
          </span>
        )}
      </div>

      {devCurlOpen && (
        <div className='console-onboarding-dev-body'>
          {props.developerCurlPreview}
        </div>
      )}
    </div>
  )
}
