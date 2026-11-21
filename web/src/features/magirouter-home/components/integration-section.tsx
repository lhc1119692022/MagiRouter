import { Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'

import { copyToClipboard } from '@/lib/copy-to-clipboard'

import {
  PROTOCOL_OPTIONS,
  SNIPPET_LANGUAGES,
  buildSnippet,
  buildToolConfigs,
  type ProtocolId,
  type SampleModels,
  type SnippetLanguage,
} from '../lib/snippets'

interface IntegrationSectionProps {
  baseUrl: string
  isAuthenticated: boolean
  sampleModels: SampleModels
  defaultGroup: string
}

export function IntegrationSection(props: IntegrationSectionProps) {
  const navigate = useNavigate()
  const [protocol, setProtocol] = useState<ProtocolId>('responses')
  const [language, setLanguage] = useState<SnippetLanguage>('curl')
  const [copiedCode, setCopiedCode] = useState(false)
  const [activeTool, setActiveTool] = useState<'magpie' | 'cc-switch' | null>(
    null
  )
  const [copiedTool, setCopiedTool] = useState(false)

  const currentProtoOption =
    PROTOCOL_OPTIONS.find((item) => item.value === protocol) ??
    PROTOCOL_OPTIONS[0]

  const codeText = useMemo(
    () => buildSnippet(language, props.baseUrl, props.sampleModels, protocol),
    [language, protocol, props.baseUrl, props.sampleModels]
  )

  const toolConfigs = useMemo(
    () =>
      buildToolConfigs(props.baseUrl, props.sampleModels, props.defaultGroup),
    [props.baseUrl, props.defaultGroup, props.sampleModels]
  )

  const activeToolConfig = activeTool ? toolConfigs[activeTool] : null

  const handleCopyCode = useCallback(async () => {
    const copied = await copyToClipboard(codeText)
    if (copied) {
      setCopiedCode(true)
      window.setTimeout(() => setCopiedCode(false), 1800)
    }
  }, [codeText])

  const handleCopyToolCode = useCallback(async () => {
    if (!activeToolConfig) return
    const copied = await copyToClipboard(activeToolConfig.code)
    if (copied) {
      setCopiedTool(true)
      window.setTimeout(() => setCopiedTool(false), 1800)
    }
  }, [activeToolConfig])

  return (
    <section id='home-integration' className='el-breakout-cream el-section-md'>
      <div className='el-container'>
        <div className='section-head'>
          <div>
            <h2 className='el-h2'>三步快速完成接入</h2>
            <p
              className='el-body-sm'
              style={{ marginTop: 8, maxWidth: 740 }}
            >
              无需多平台注册与反复适配，用一把密钥即可快速使用全球顶级语言、图片、视频与音频模型。
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              to={props.isAuthenticated ? '/dashboard' : '/sign-up'}
              className='el-btn el-btn-lg el-btn-primary'
            >
              {props.isAuthenticated ? '进入控制台 →' : '立即开始 →'}
            </Link>
            <Link
              to={props.isAuthenticated ? '/playground' : '/sign-in'}
              search={
                props.isAuthenticated ? undefined : { redirect: '/playground' }
              }
              className='el-btn el-btn-lg el-btn-white'
            >
              进入 AI 创作 →
            </Link>
            <Link to='/docs' className='el-btn el-btn-lg el-btn-white'>
              接入文档
            </Link>
          </div>
        </div>

        <div className='integration-grid'>
          <div className='steps-stack'>
            <div className='step-row-card'>
              <span className='step-num-badge tabular-nums'>01</span>
              <div>
                <h3 className='el-h3'>注册，创建密钥</h3>
                <p className='el-body-sm' style={{ marginTop: 5 }}>
                  注册账号并登录控制台，几秒即可生成专属 API 密钥。
                </p>
              </div>
            </div>
            <div className='step-row-card'>
              <span className='step-num-badge tabular-nums'>02</span>
              <div>
                <h3 className='el-h3'>修改配置</h3>
                <p className='el-body-sm' style={{ marginTop: 5 }}>
                  将 API 端点改为平台地址，使用官方 SDK 仅需改一行 Base URL。
                </p>
              </div>
            </div>
            <div className='step-row-card'>
              <span className='step-num-badge tabular-nums'>03</span>
              <div>
                <h3 className='el-h3'>开始调用模型</h3>
                <p className='el-body-sm' style={{ marginTop: 5 }}>
                  通过统一接口访问各种全球顶级模型，即刻开启 AI 之旅。
                </p>
              </div>
            </div>
          </div>

          <div className='code-panel'>
            <div
              className='code-panel-proto-bar'
              role='tablist'
              aria-label='接口协议优先级'
            >
              {PROTOCOL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type='button'
                  className={`el-btn el-btn-xs ${
                    protocol === option.value
                      ? 'el-btn-primary'
                      : 'el-btn-ghost'
                  }`}
                  onClick={() => setProtocol(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className='code-panel-head'>
              <div
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                role='tablist'
                aria-label='代码示例语言'
              >
                {SNIPPET_LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    type='button'
                    className={`el-btn el-btn-xs ${
                      language === lang.value
                        ? 'el-btn-primary'
                        : 'el-btn-ghost'
                    }`}
                    onClick={() => setLanguage(lang.value)}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  className='tabular-nums'
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11.5px',
                    color: 'var(--ink-muted)',
                  }}
                >
                  {currentProtoOption.endpoint}
                </span>
                <button
                  type='button'
                  className='el-btn el-btn-xs el-btn-white'
                  onClick={() => void handleCopyCode()}
                >
                  {copiedCode ? '已复制 ✓' : '复制代码'}
                </button>
              </div>
            </div>
            <pre className='code-body' id='code-sample-box'>
              {codeText}
            </pre>
          </div>
        </div>

        <div className='tools-inline-strip' id='home-tools'>
          <span className='tools-inline-label'>
            推荐使用管理供应商配置工具：
          </span>
          <div className='tools-inline-links'>
            <button
              type='button'
              className='tool-inline-pill'
              onClick={() => {
                setCopiedTool(false)
                setActiveTool('magpie')
              }}
            >
              <span className='tool-inline-logo' aria-hidden='true'>
                <img
                  src='/magpie-icon.svg'
                  alt='Magpie'
                  style={{ width: 18, height: 18, display: 'block' }}
                />
              </span>
              <span>Magpie</span>
            </button>
            <button
              type='button'
              className='tool-inline-pill'
              onClick={() => {
                setCopiedTool(false)
                setActiveTool('cc-switch')
              }}
            >
              <span className='tool-inline-logo' aria-hidden='true'>
                <img
                  src='/cc-switch-icon.png'
                  alt='CC Switch'
                  style={{ width: 18, height: 18, display: 'block' }}
                />
              </span>
              <span>CC Switch</span>
            </button>
          </div>
        </div>
      </div>

      {activeToolConfig && (
        <div
          className='el-modal-backdrop'
          role='dialog'
          aria-modal='true'
          aria-label={activeToolConfig.title}
          onClick={(event) => {
            if (event.target === event.currentTarget) setActiveTool(null)
          }}
        >
          <div className='el-modal-card' style={{ maxWidth: 560 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <div className='el-eyebrow'>{activeToolConfig.eyebrow}</div>
                <h2 className='el-h3' style={{ margin: '4px 0 0', fontSize: 21 }}>
                  {activeToolConfig.title}
                </h2>
              </div>
              <button
                type='button'
                className='el-btn el-btn-sm el-btn-white'
                onClick={() => setActiveTool(null)}
              >
                关闭
              </button>
            </div>
            <p className='el-body-sm' style={{ marginTop: 10 }}>
              {activeToolConfig.desc}
            </p>
            <div
              className='mr-code-card'
              style={{ marginTop: 14, borderRadius: 12 }}
            >
              <div
                className='mr-code-head'
                style={{ padding: '9px 14px', fontSize: 12 }}
              >
                <span className='el-eyebrow'>{activeToolConfig.protoNote}</span>
                <button
                  type='button'
                  className='el-btn el-btn-xs el-btn-white'
                  onClick={() => void handleCopyToolCode()}
                >
                  {copiedTool ? '已复制 ✓' : '复制配置'}
                </button>
              </div>
              <pre
                className='code-body'
                style={{ padding: '14px 16px', fontSize: 12 }}
              >
                {activeToolConfig.code}
              </pre>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 10,
                marginTop: 16,
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              {activeToolConfig.url && (
                <a
                  href={activeToolConfig.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='el-btn el-btn-md el-btn-white'
                >
                  访问官网 ↗
                </a>
              )}
              <button
                type='button'
                className='el-btn el-btn-md el-btn-primary'
                onClick={() => {
                  setActiveTool(null)
                  void navigate({
                    to: props.isAuthenticated ? '/keys' : '/sign-up',
                  })
                }}
              >
                {props.isAuthenticated ? '前往密钥管理' : '前往创建密钥'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
