import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { HtmlContent } from '@/components/html-content'
import {
  LegalLinks,
  ProjectAttribution,
} from '@/components/layout/components/footer'
import { MagiRouterWordmark } from '@/components/layout/components/magirouter-wordmark'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { getDocumentationLink } from '@/lib/documentation-link'
import { parseHeaderNavModules } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export function BrandFooter() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { status } = useStatus()
  const modules = parseHeaderNavModules(status?.HeaderNavModules)
  const { systemName, footerHtml } = useSystemConfig()
  const { auth } = useAuthStore()
  const isAuthenticated = Boolean(auth.user)
  const displayName = systemName || 'MagiRouter'
  const currentYear = new Date().getFullYear()

  const docs = getDocumentationLink(status?.docs_link)

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
            <p className='el-body-sm' style={{ marginTop: 12, maxWidth: 240 }}>
              {t(
                'One gateway for OpenAI Responses, Chat Completions, Anthropic Messages and Gemini.'
              )}
            </p>
          </div>

          <div>
            <div className='el-eyebrow'>产品</div>
            <ul className='footer-list'>
              {modules.pricing.enabled && (
                <li>
                  <Link to='/pricing'>{t('Model Square')}</Link>
                </li>
              )}
              {modules.home && (
                <li>
                  <a href='/#home-billing'>平台计费体系</a>
                </li>
              )}
              {modules.creation && (
                <li>
                  <button type='button' onClick={() => goProtected('/create')}>
                    {t('AI Studio')}
                  </button>
                </li>
              )}
              {modules.console && (
                <li>
                  <button
                    type='button'
                    onClick={() => goProtected('/dashboard')}
                  >
                    {t('Console')}
                  </button>
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className='el-eyebrow'>开发者</div>
            <ul className='footer-list'>
              {modules.home && (
                <li>
                  <a href='/#home-integration'>快速接入</a>
                </li>
              )}
              {modules.docs && (
                <li>
                  {docs.external ? (
                    <a
                      href={docs.href}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      {t('Developer documentation')}
                    </a>
                  ) : (
                    <Link to='/docs' search={docs.search} hash={docs.hash}>
                      {t('Developer documentation')}
                    </Link>
                  )}
                </li>
              )}
              <li>
                <a
                  href='https://ccswitch.io'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  CC Switch 接入
                </a>
              </li>
              {modules.rankings.enabled && (
                <li>
                  <Link to='/rankings'>{t('Rankings')}</Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <div className='el-eyebrow'>平台与条款</div>
            <ul className='footer-list'>
              {modules.about && (
                <li>
                  <Link to='/about'>{t('Timeline')}</Link>
                </li>
              )}
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
