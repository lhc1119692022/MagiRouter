import { Link } from '@tanstack/react-router'

import { getLobeIcon } from '@/lib/lobe-icon'

interface IntegrationSectionProps {
  isAuthenticated: boolean
}

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

type AppTile =
  | { name: string; kind: 'lobe'; icon: string }
  | { name: string; kind: 'asset'; src: string }

const APP_TILES: readonly AppTile[] = [
  { name: 'Magpie', kind: 'asset', src: '/magpie-icon.svg' },
  { name: 'CC Switch', kind: 'asset', src: '/cc-switch-icon.png' },
  { name: 'Codex', kind: 'lobe', icon: 'Codex.Color' },
  { name: 'Claude Code', kind: 'lobe', icon: 'ClaudeCode.Color' },
  { name: 'WorkBuddy', kind: 'lobe', icon: 'CodeBuddy.Color' },
  { name: '豆包工作', kind: 'lobe', icon: 'Doubao.Color' },
  { name: 'ZCode', kind: 'lobe', icon: 'ZAI' },
  { name: 'Qoder', kind: 'lobe', icon: 'Qoder.Color' },
] as const

export function IntegrationSection(props: IntegrationSectionProps) {
  return (
    <section id='home-integration' className='el-breakout-cream el-section-md'>
      <div className='el-container'>
        <div className='section-head'>
          <div>
            <div className='section-heading-row'>
              <h2 className='el-h2'>三步快速上手</h2>
              <span className='section-title-badge'>工作流程</span>
            </div>
            <p className='el-body-sm' style={{ marginTop: 8, maxWidth: 640 }}>
              一个账号，一把密钥，直接连接全球主流模型与常用 AI 工具。
            </p>
          </div>
          <Link to='/docs' className='el-btn el-btn-lg el-btn-white'>
            查看完整文档 →
          </Link>
        </div>

        <div className='onboarding-grid-3'>
          <article className='onboarding-card'>
            <div className='onboarding-card-head'>
              <span className='onboarding-step-num tabular-nums'>1</span>
              <h3 className='onboarding-card-title'>注册并充值</h3>
            </div>

            <div className='onboarding-stage onboarding-stage-actions'>
              <Link
                to={props.isAuthenticated ? '/dashboard' : '/sign-up'}
                className='el-btn el-btn-lg el-btn-primary onboarding-action-btn'
              >
                <svg
                  width='16'
                  height='16'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.9'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <path d='M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' />
                  <polyline points='10 17 15 12 10 7' />
                  <line x1='15' y1='12' x2='3' y2='12' />
                </svg>
                <span>{props.isAuthenticated ? '前往仪表板' : '注册账号'}</span>
              </Link>
              <Link
                to={props.isAuthenticated ? '/wallet' : '/sign-in'}
                search={
                  props.isAuthenticated ? undefined : { redirect: '/wallet' }
                }
                className='el-btn el-btn-lg el-btn-white onboarding-action-btn'
              >
                <svg
                  width='16'
                  height='16'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.9'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <rect x='2' y='5' width='20' height='14' rx='2' />
                  <path d='M16 12h.01' />
                  <path d='M2 10h20' />
                </svg>
                <span>在线充值</span>
              </Link>
            </div>

            <p className='onboarding-card-desc'>
              登录账号，按需为钱包充值，即可开始调用全站 API。
            </p>
          </article>

          <article className='onboarding-card'>
            <div className='onboarding-card-head'>
              <span className='onboarding-step-num tabular-nums'>2</span>
              <h3 className='onboarding-card-title'>选择模型，创建密钥</h3>
            </div>

            <div className='onboarding-stage onboarding-stage-visual'>
              <div
                className='onboarding-model-cloud'
                aria-label='支持的主流模型品牌'
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

              <Link
                to={props.isAuthenticated ? '/keys' : '/sign-in'}
                search={
                  props.isAuthenticated ? undefined : { redirect: '/keys' }
                }
                className='el-btn el-btn-md el-btn-white onboarding-stage-cta'
              >
                <svg
                  width='15'
                  height='15'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.9'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <circle cx='7.5' cy='15.5' r='5.5' />
                  <path d='m21 2-9.6 9.6' />
                  <path d='m15.5 7.5 3 3L22 7l-3-3' />
                </svg>
                <span>创建 API 密钥</span>
                <span aria-hidden='true'>↗</span>
              </Link>
            </div>

            <p className='onboarding-card-desc'>
              选择模型大类和线路偏好，用一把密钥统一接入。
            </p>
          </article>

          <article className='onboarding-card'>
            <div className='onboarding-card-head'>
              <span className='onboarding-step-num tabular-nums'>3</span>
              <h3 className='onboarding-card-title'>接入常用应用</h3>
            </div>

            <div className='onboarding-stage onboarding-stage-visual'>
              <div
                className='onboarding-app-grid'
                aria-label='支持的常用 AI 应用'
              >
                {APP_TILES.map((app) => (
                  <span
                    key={app.name}
                    className='onboarding-app-tile'
                    title={app.name}
                    aria-label={app.name}
                    data-tooltip={app.name}
                  >
                    {app.kind === 'lobe' ? (
                      getLobeIcon(app.icon, 24)
                    ) : (
                      <img
                        src={app.src}
                        alt=''
                        width={24}
                        height={24}
                        className='onboarding-app-asset'
                      />
                    )}
                  </span>
                ))}
              </div>

              <Link
                to='/docs'
                className='el-btn el-btn-md el-btn-white onboarding-stage-cta'
              >
                <svg
                  width='15'
                  height='15'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.9'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  aria-hidden='true'
                >
                  <path d='M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' />
                  <path d='M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' />
                </svg>
                <span>查看接入指南</span>
                <span aria-hidden='true'>↗</span>
              </Link>
            </div>

            <p className='onboarding-card-desc'>
              在兼容应用中填入密钥与接口地址，按指南快速接入。
            </p>
          </article>
        </div>
      </div>
    </section>
  )
}
