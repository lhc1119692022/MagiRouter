import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  KeyRound,
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

const MODEL_BRICK_ROWS = [
  [
    { name: 'GPT', icon: 'OpenAI' },
    { name: 'Claude', icon: 'Claude.Color' },
    { name: 'Gemini', icon: 'Gemini.Color' },
  ],
  [
    { name: 'DeepSeek', icon: 'DeepSeek.Color' },
    { name: 'Qwen', icon: 'Qwen.Color' },
    { name: 'Doubao', icon: 'Doubao.Color' },
  ],
  [
    { name: 'GLM', icon: 'Zhipu.Color' },
    { name: 'Grok', icon: 'Grok' },
    { name: 'Kimi', icon: 'Kimi.Color' },
  ],
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
      'Easiest for beginners: open CC Switch, add a profile, paste Base URL & API Key above, and sync to Claude Code / Codex in one click.',
  },
  {
    id: 'magpie',
    name: 'Magpie',
    kind: 'asset',
    src: '/magpie-icon.svg',
    tipKey:
      'Open Magpie → Settings → Model Providers → add an OpenAI-compatible provider, then paste Base URL & API Key above to start chatting.',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'lobe',
    icon: 'ClaudeCode.Color',
    tipKey:
      'Use CC Switch for one-click setup, or set ANTHROPIC_BASE_URL (without trailing /v1) and ANTHROPIC_AUTH_TOKEN to the values above.',
  },
  {
    id: 'codex',
    name: 'Codex',
    kind: 'lobe',
    icon: 'Codex.Color',
    tipKey:
      'Use CC Switch for one-click import, or set base_url to the Base URL above and enter your API Key in Codex config.',
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy',
    kind: 'lobe',
    icon: 'CodeBuddy.Color',
    tipKey:
      'Open Settings → Custom Model / OpenAI-compatible API, paste Base URL & API Key above, and pick a model to start.',
  },
  {
    id: 'doubao-work',
    name: '豆包工作',
    kind: 'lobe',
    icon: 'Doubao.Color',
    tipKey:
      'Open Settings → Custom Model / OpenAI-compatible API, paste Base URL & API Key above, and pick a model to start.',
  },
  {
    id: 'zcode',
    name: 'ZCode',
    kind: 'lobe',
    icon: 'ZAI',
    tipKey:
      'Open Settings → Custom Model / OpenAI-compatible API, paste Base URL & API Key above, and pick a model to start.',
  },
  {
    id: 'qoder',
    name: 'Qoder',
    kind: 'lobe',
    icon: 'Qoder.Color',
    tipKey:
      'Open Settings → Custom Model / OpenAI-compatible API, paste Base URL & API Key above, and pick a model to start.',
  },
] as const

export interface ConsoleOnboardingGuideProps {
  remainQuota: number
  balanceReady: boolean
  hasActiveKey: boolean
  hasFirstRequest: boolean
  keyId?: number
  keyName: string
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
      <div className='onboarding-grid-3 console-onboarding-grid'>
        <article className='onboarding-card console-onboarding-card'>
          <div className='onboarding-card-head'>
            <span
              className={cn(
                'onboarding-step-num tabular-nums',
                props.balanceReady && 'is-done'
              )}
            >
              {props.balanceReady ? <Check className='size-3.5' /> : 1}
            </span>
            <h3 className='onboarding-card-title'>
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

          <div className='onboarding-stage onboarding-stage-actions console-onboarding-stage'>
            <div className='console-onboarding-balance-box'>
              <span className='console-onboarding-balance-label'>
                {t('Available balance')}
              </span>
              <strong className='console-onboarding-balance-val tabular-nums'>
                {formatQuota(props.remainQuota)}
              </strong>
            </div>

            <Link
              to='/wallet'
              className='el-btn el-btn-md el-btn-primary onboarding-action-btn'
            >
              <Wallet className='size-4' aria-hidden='true' />
              <span>{t('Online top-up')}</span>
            </Link>
            <Link
              to='/pricing'
              className='el-btn el-btn-md el-btn-white onboarding-action-btn'
            >
              <span>{t('Browse models & pricing')}</span>
            </Link>
          </div>

          <p className='onboarding-card-desc'>
            {t(
              'Top up on demand (¥1 = $1 credit, never expires). A few yuan is enough to get started.'
            )}
          </p>
        </article>

        <article className='onboarding-card console-onboarding-card'>
          <div className='onboarding-card-head'>
            <span
              className={cn(
                'onboarding-step-num tabular-nums',
                props.hasActiveKey && 'is-done'
              )}
            >
              {props.hasActiveKey ? <Check className='size-3.5' /> : 2}
            </span>
            <h3 className='onboarding-card-title'>
              {t('Choose models & create key')}
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

          <div className='onboarding-stage onboarding-stage-visual console-onboarding-stage'>
            <div
              className='onboarding-model-cloud'
              aria-label={t('Supported model families')}
            >
              {MODEL_BRICK_ROWS.map((row, rowIndex) => (
                <div
                  key={row[0].name}
                  className={`onboarding-model-brick-row${rowIndex === 1 ? ' is-offset' : ''}`}
                >
                  {row.map((badge) => (
                    <span key={badge.name} className='onboarding-model-pill'>
                      <span className='onboarding-model-pill-icon'>
                        {getLobeIcon(badge.icon, 15)}
                      </span>
                      <span>{badge.name}</span>
                    </span>
                  ))}
                </div>
              ))}
            </div>

            <div className='console-onboarding-step-actions'>
              {props.hasActiveKey && props.keyId ? (
                <>
                  <button
                    type='button'
                    className='el-btn el-btn-md el-btn-primary'
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
                  <Link to='/keys' className='el-btn el-btn-md el-btn-white'>
                    <KeyRound className='size-3.5' aria-hidden='true' />
                    <span>{t('Manage Keys')}</span>
                  </Link>
                </>
              ) : (
                <Link
                  to='/keys'
                  search={{ action: 'create' }}
                  className='el-btn el-btn-md el-btn-white onboarding-stage-cta'
                >
                  <KeyRound className='size-3.5' aria-hidden='true' />
                  <span>{t('Create API Key')}</span>
                  <span aria-hidden='true'>↗</span>
                </Link>
              )}
            </div>
          </div>

          <p className='onboarding-card-desc'>
            {props.hasActiveKey
              ? t(
                  'Active key "{{name}}" is ready. Copy it and paste into any AI app in step 3.',
                  { name: props.keyName }
                )
              : t(
                  'One key unlocks all major models. Create a key and copy it for the next step.'
                )}
          </p>
        </article>

        <article className='onboarding-card console-onboarding-card'>
          <div className='onboarding-card-head'>
            <span
              className={cn(
                'onboarding-step-num tabular-nums',
                props.hasFirstRequest && 'is-done'
              )}
            >
              {props.hasFirstRequest ? <Check className='size-3.5' /> : 3}
            </span>
            <h3 className='onboarding-card-title'>
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

          <div className='onboarding-stage onboarding-stage-visual console-onboarding-stage console-onboarding-connect-stage'>
            <div className='console-onboarding-config-box'>
              <div className='console-onboarding-config-row'>
                <span className='console-onboarding-config-label'>
                  {t('Base URL')}
                </span>
                <input
                  type='text'
                  readOnly
                  aria-label={t('API Base URL')}
                  value={props.apiBaseUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className='console-onboarding-config-input'
                />
                <button
                  type='button'
                  className='console-onboarding-copy-mini'
                  onClick={handleCopyBaseUrl}
                >
                  {copiedField === 'url' ? t('Copied') : t('Copy')}
                </button>
              </div>
              <div className='console-onboarding-config-row'>
                <span className='console-onboarding-config-label'>
                  {t('API Key')}
                </span>
                <input
                  type='text'
                  readOnly
                  aria-label={t('Active API key')}
                  value={
                    props.hasActiveKey
                      ? props.displayKey
                      : t('Create in step 2 first')
                  }
                  className='console-onboarding-config-input'
                />
                {props.hasActiveKey && props.keyId ? (
                  <button
                    type='button'
                    className='console-onboarding-copy-mini'
                    disabled={copyingKey}
                    onClick={handleCopyApiKey}
                  >
                    {copiedField === 'key' ? t('Copied') : t('Copy')}
                  </button>
                ) : (
                  <Link
                    to='/keys'
                    search={{ action: 'create' }}
                    className='console-onboarding-copy-mini'
                  >
                    {t('Create')}
                  </Link>
                )}
              </div>
            </div>

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
                    className={cn(
                      'onboarding-app-tile console-onboarding-app-btn',
                      selected && 'is-selected'
                    )}
                    title={app.name}
                    aria-label={app.name}
                    aria-pressed={selected}
                    onClick={() => setSelectedAppId(app.id)}
                  >
                    {app.kind === 'lobe' ? (
                      getLobeIcon(app.icon, 20)
                    ) : (
                      <img
                        src={app.src}
                        alt=''
                        width={20}
                        height={20}
                        className='onboarding-app-asset'
                      />
                    )}
                  </button>
                )
              })}
            </div>

            <div className='console-onboarding-app-tip'>
              <span className='console-onboarding-app-tip-name'>
                {selectedApp.name}
              </span>
              <span>{t(selectedApp.tipKey)}</span>
            </div>

            <div className='console-onboarding-step-actions'>
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

          <p className='onboarding-card-desc'>
            {t(
              'No coding needed: paste Base URL & API Key into your AI app, or click Try in Playground right away.'
            )}
          </p>
        </article>
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
