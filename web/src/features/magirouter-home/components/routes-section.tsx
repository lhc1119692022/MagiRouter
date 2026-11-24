import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'

import type { CatalogQuote } from '../lib/catalog-quote'

interface RoutesSectionProps {
  quote?: CatalogQuote
  loading: boolean
  failed: boolean
}

export function RoutesSection(props: RoutesSectionProps) {
  const { t, i18n } = useTranslation()
  const { quote } = props
  let message = t(
    'No current token price is available for an eligible model and group.'
  )
  if (props.loading) message = t('Loading')
  if (props.failed) message = t('Failed to load models')
  const usd = new Intl.NumberFormat(
    toIntlLocale(i18n.resolvedLanguage || i18n.language),
    {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumSignificantDigits: 8,
    }
  )

  return (
    <section id='home-billing' className='el-section-md'>
      <div className='el-container'>
        <div className='section-head'>
          <div>
            <h2 className='el-h2'>透明可预测的平台计费体系</h2>
            <p className='el-body-sm' style={{ marginTop: 8, maxWidth: 720 }}>
              {t('Pricing')}
            </p>
          </div>
          <Link to='/pricing' className='el-btn el-btn-lg el-btn-white'>
            查看完整价格列表 →
          </Link>
        </div>

        <div className='billing-formula-bar'>
          <div className='billing-formula-top'>
            <div className='formula-chain' aria-label='平台计费公式'>
              <span
                className='formula-node'
                style={{
                  background: 'var(--btn-primary-bg)',
                  color: 'var(--btn-primary-fg)',
                }}
              >
                {t('Input price')}
              </span>
              <span className='formula-op'>=</span>
              <span className='formula-node'>{t('Base Price')}</span>
              <span className='formula-op'>×</span>
              <span className='formula-node'>分组线路倍率</span>
            </div>
          </div>

          {quote ? (
            <section
              className='billing-formula-example tabular-nums'
              aria-label={t('Current catalog input price')}
            >
              <div className='example-head-row'>
                <span className='example-caption'>
                  <strong>{t('Current catalog input price')}</strong> ·{' '}
                  {quote.modelName}
                </span>
                <span className='example-caption'>
                  {t('Group')}: {quote.group}
                </span>
              </div>
              <div className='example-equation-row'>
                <div className='example-step-card'>
                  <span className='example-step-label'>{t('Base Price')}</span>
                  <div className='example-step-val'>
                    {usd.format(quote.baseUsd)} <small>USD / 1M</small>
                  </div>
                </div>
                <span className='example-op' aria-hidden='true'>
                  ×
                </span>
                <div className='example-step-card'>
                  <span className='example-step-label'>分组线路倍率</span>
                  <div className='example-step-val'>{quote.groupRatio}</div>
                </div>
                <span className='example-op' aria-hidden='true'>
                  =
                </span>
                <div className='example-step-card'>
                  <span className='example-step-label'>{t('Input price')}</span>
                  <div className='example-step-val'>
                    {usd.format(quote.inputUsd)} <small>USD / 1M</small>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <p role='status' className='billing-formula-example'>
              {message}
            </p>
          )}
        </div>

        <div className='billing-grid-3'>
          <div className='el-card-cream'>
            <div className='billing-card-head'>
              <h3 className='el-h3'>语言与推理模型计价</h3>
              <span className='billing-card-num tabular-nums'>01</span>
            </div>
            <p className='el-body-sm' style={{ marginTop: 10 }}>
              区分输入、输出、推理思考与 Prompt Cache
              读写。各模型支持的计费项和具体分组价格见模型广场。
            </p>
          </div>

          <div className='el-card-cream'>
            <div className='billing-card-head'>
              <h3 className='el-h3'>图片、视频与多模态灵活计费</h3>
              <span className='billing-card-num tabular-nums'>02</span>
            </div>
            <p className='el-body-sm' style={{ marginTop: 10 }}>
              提供极其丰富的计费方案，按模型原生形态灵活支持按
              Token、按张、按秒、按分钟或按次（任务）计费，并细分分辨率、时长与功能档位；调用前清晰可预估，异常失败全额退回。
            </p>
          </div>

          <div className='el-card-cream'>
            <div className='billing-card-head'>
              <h3 className='el-h3'>自选倍率池与自由组合兜底</h3>
              <span className='billing-card-num tabular-nums'>03</span>
            </div>
            <p className='el-body-sm' style={{ marginTop: 10 }}>
              支持自由组合多条上游线路与优先级权重，主线路遇到限流或异常波动时自动切换至备用路由兜底，兼顾成本控制与高可用。
            </p>
          </div>
        </div>

        <div className='billing-pillars-4'>
          <div className='billing-pillar'>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--ink-strong)',
              }}
            >
              余额永久有效，零月租
            </div>
            <p className='el-body-sm' style={{ marginTop: 4 }}>
              用多少充多少，永不强制清零。
            </p>
          </div>
          <div className='billing-pillar'>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--ink-strong)',
              }}
            >
              一把 Key 调通全球模型
            </div>
            <p className='el-body-sm' style={{ marginTop: 4 }}>
              免多平台开户，统一账单结算。
            </p>
          </div>
          <div className='billing-pillar'>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--ink-strong)',
              }}
            >
              没跑通，不花一分钱
            </div>
            <p className='el-body-sm' style={{ marginTop: 4 }}>
              上游报错或超时，$0 扣费。
            </p>
          </div>
          <div className='billing-pillar'>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--ink-strong)',
              }}
            >
              每一笔扣费清晰可查
            </div>
            <p className='el-body-sm' style={{ marginTop: 4 }}>
              协议、倍率与缓存明细留痕。
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
