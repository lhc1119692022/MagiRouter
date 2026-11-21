import { Link, useNavigate } from '@tanstack/react-router'

import { HtmlContent } from '@/components/html-content'
import {
  LegalLinks,
  ProjectAttribution,
} from '@/components/layout/components/footer'
import { MagiRouterWordmark } from '@/components/layout/components/magirouter-wordmark'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useAuthStore } from '@/stores/auth-store'

export function BrandFooter() {
  const navigate = useNavigate()
  const { status } = useStatus()
  const { systemName, footerHtml } = useSystemConfig()
  const { auth } = useAuthStore()
  const isAuthenticated = Boolean(auth.user)
  const displayName = systemName || 'MagiRouter'
  const currentYear = new Date().getFullYear()

  const docsLink =
    typeof status?.docs_link === 'string' ? status.docs_link.trim() : ''
  const isDefaultUpstreamDocs =
    docsLink === 'https://docs.newapi.pro' ||
    docsLink === 'https://docs.newapi.pro/'
  const externalDocsHref =
    docsLink &&
    docsLink !== '/docs' &&
    !isDefaultUpstreamDocs &&
    /^https?:\/\//i.test(docsLink)
      ? docsLink
      : ''

  const goProtected = (target: string) => {
    if (isAuthenticated) {
      void navigate({ to: target })
    } else {
      void navigate({ to: '/sign-in', search: { redirect: target } })
    }
  }

  return (
    <footer className='el-footer' id='site-footer'>
      <div className='el-container'>
        <div className='footer-cols'>
          <div>
            <Link to='/' className='brand-lockup' aria-label={displayName}>
              <MagiRouterWordmark height={22} />
            </Link>
            <p
              className='el-body-sm'
              style={{ marginTop: 12, maxWidth: 240 }}
            >
              优先支持 OpenAI Responses、Anthropic Messages 与 Gemini 协议的多模型统一路由网关。
            </p>
          </div>

          <div>
            <div className='el-eyebrow'>产品</div>
            <ul className='footer-list'>
              <li>
                <Link to='/pricing'>模型广场</Link>
              </li>
              <li>
                <a href='/#home-billing'>平台计费体系</a>
              </li>
              <li>
                <button
                  type='button'
                  onClick={() => goProtected('/playground')}
                >
                  AI 创作
                </button>
              </li>
              <li>
                <button
                  type='button'
                  onClick={() => goProtected('/dashboard')}
                >
                  控制台
                </button>
              </li>
            </ul>
          </div>

          <div>
            <div className='el-eyebrow'>开发者</div>
            <ul className='footer-list'>
              <li>
                <a href='/#home-integration'>快速接入</a>
              </li>
              <li>
                {externalDocsHref ? (
                  <a
                    href={externalDocsHref}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    开发文档
                  </a>
                ) : (
                  <Link to='/docs'>开发文档</Link>
                )}
              </li>
              <li>
                <a
                  href='https://ccswitch.io'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  CC Switch 接入
                </a>
              </li>
              <li>
                <Link to='/rankings'>模型排行榜</Link>
              </li>
            </ul>
          </div>

          <div>
            <div className='el-eyebrow'>平台与条款</div>
            <ul className='footer-list'>
              <li>
                <Link to='/about'>时间线</Link>
              </li>
              <li>
                <Link to='/user-agreement'>服务条款</Link>
              </li>
              <li>
                <Link to='/privacy-policy'>隐私政策</Link>
              </li>
            </ul>
          </div>
        </div>

        {footerHtml && (
          <HtmlContent
            content={footerHtml}
            className='custom-footer text-muted-foreground mt-8 text-[13px]'
          />
        )}

        <div
          style={{
            marginTop: 40,
            paddingTop: 20,
            borderTop: 'var(--hairline) solid var(--divider-color)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            fontSize: 12.5,
            color: 'var(--ink-muted)',
          }}
        >
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <span>
              © {currentYear} {displayName}
            </span>
            <LegalLinks leadingSeparator />
          </div>
          <ProjectAttribution currentYear={currentYear} />
        </div>
      </div>
    </footer>
  )
}
