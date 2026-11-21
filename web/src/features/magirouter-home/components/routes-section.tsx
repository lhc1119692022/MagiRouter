import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import { EXCLUDED_GROUPS } from '@/features/pricing/constants'
import {
  getConfiguredGroupRatio,
  isTokenBasedModel,
} from '@/features/pricing/lib/model-helpers'
import { calculateTokenPrice } from '@/features/pricing/lib/price'
import type { PricingModel } from '@/features/pricing/types'

interface RoutesSectionProps {
  usableGroup: Record<string, unknown>
  groupRatio: Record<string, number>
  models: PricingModel[]
  priceRate: number
}

function formatDollarAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '18.75'
  if (amount >= 1) return Number(amount.toFixed(4)).toString()
  return Number(amount.toFixed(4)).toString()
}

export function RoutesSection(props: RoutesSectionProps) {
  const exampleData = useMemo(() => {
    const groups = Object.keys(props.usableGroup).filter(
      (group) => !EXCLUDED_GROUPS.includes(group)
    )
    let cheapestGroup = 'GPT Pro'
    let cheapestRatio = 0.25

    if (groups.length > 0) {
      const sortedGroups = groups
        .map((group) => ({
          group,
          ratio: getConfiguredGroupRatio(props.groupRatio, group),
        }))
        .filter((entry) => Number.isFinite(entry.ratio) && entry.ratio > 0)
        .sort((left, right) => left.ratio - right.ratio)

      if (sortedGroups.length > 0) {
        cheapestGroup = sortedGroups[0].group
        cheapestRatio = sortedGroups[0].ratio
      }
    }

    const tokenModels = props.models.filter((item) => isTokenBasedModel(item))
    const preferredModel =
      tokenModels.find((item) => /gpt-6\.2-sol/i.test(item.model_name)) ??
      tokenModels.find((item) =>
        (item.enable_groups ?? []).includes(cheapestGroup)
      ) ??
      tokenModels[0]

    const modelName = preferredModel?.model_name ?? 'gpt-6.2-sol'
    const officialPrice = preferredModel
      ? calculateTokenPrice(preferredModel, 'input', 1)
      : 18.75
    const safeOfficial =
      Number.isFinite(officialPrice) && officialPrice > 0
        ? officialPrice
        : 18.75
    const actualQuota = safeOfficial * cheapestRatio
    const actualCny = actualQuota * Math.max(props.priceRate || 1, 0.01)
    const percentText = Math.round(cheapestRatio * 100)

    return {
      modelName,
      cheapestGroup,
      cheapestRatio,
      percentText,
      officialText: formatDollarAmount(safeOfficial),
      actualText: formatDollarAmount(actualQuota),
      cnyText: formatDollarAmount(actualCny),
      rateText: Number((props.priceRate || 1).toFixed(2)).toString(),
    }
  }, [props.groupRatio, props.models, props.priceRate, props.usableGroup])

  return (
    <section id='home-billing' className='el-section-md'>
      <div className='el-container'>
        <div className='section-head'>
          <div>
            <h2 className='el-h2'>透明可预测的平台计费体系</h2>
            <p
              className='el-body-sm'
              style={{ marginTop: 8, maxWidth: 720 }}
            >
              单一余额通用全站模型，无月租或最低消费，按量计费且失败免扣。
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
                单次实际扣费
              </span>
              <span className='formula-op'>=</span>
              <span className='formula-node'>模型官方定价</span>
              <span className='formula-op'>×</span>
              <span className='formula-node'>分组线路倍率</span>
            </div>
            <span
              className='el-pill'
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--el-green-600)',
              }}
            >
              ● 上游报错 / 超时请求 = $0 不计费
            </span>
          </div>

          <div className='billing-formula-example tabular-nums'>
            <div className='example-head-row'>
              <span className='example-caption'>
                <strong>举例：</strong>以{' '}
                <strong>{exampleData.modelName}</strong> 输入计费为例，套用上方公式
              </span>
              <span className='example-caption'>
                {exampleData.cheapestRatio} 倍率（{exampleData.cheapestGroup}）=
                按官方价 {exampleData.percentText}% 扣费 · 本站汇率 1:
                {exampleData.rateText}
              </span>
            </div>
            <div className='example-equation-row'>
              <div className='example-step-card'>
                <span className='example-step-label'>模型官方定价</span>
                <div className='example-step-val'>
                  ${exampleData.officialText} <small>/ 1M</small>
                </div>
                <span className='example-step-note'>
                  {exampleData.modelName} 官方输入原价
                </span>
              </div>
              <span className='example-op' aria-hidden='true'>
                ×
              </span>
              <div className='example-step-card'>
                <span className='example-step-label'>分组线路倍率</span>
                <div className='example-step-val'>
                  {exampleData.cheapestRatio}
                </div>
                <span className='example-step-note'>
                  只按官方价的 {exampleData.percentText}% 扣费
                </span>
              </div>
              <span className='example-op' aria-hidden='true'>
                =
              </span>
              <div className='example-step-card'>
                <span className='example-step-label'>单次实际扣费</span>
                <div className='example-step-val'>
                  ${exampleData.actualText} <small>/ 1M</small>
                </div>
                <span className='example-step-note'>按公式扣减账户额度</span>
              </div>
              <span className='example-op' aria-hidden='true'>
                →
              </span>
              <div className='example-step-card is-result'>
                <span className='example-step-label'>
                  本站汇率为 {exampleData.rateText}（实付）
                </span>
                <div className='example-step-val'>
                  ¥{exampleData.cnyText} <small>/ 1M</small>
                </div>
                <span className='example-step-note'>
                  ¥{exampleData.rateText} 充值 = $1 额度
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className='billing-grid-3'>
          <div className='el-card-cream'>
            <div className='billing-card-head'>
              <h3 className='el-h3'>语言与推理模型计价</h3>
              <span className='billing-card-num tabular-nums'>01</span>
            </div>
            <p className='el-body-sm' style={{ marginTop: 10 }}>
              区分输入、输出、推理思考与 Prompt Cache 读写等多维度，完整对齐官方分档与缓存原生定价，并叠加平台分组折扣倍率（低至官方 {exampleData.percentText}% 成本），按百万 Tokens 实时结算。
            </p>
          </div>

          <div className='el-card-cream'>
            <div className='billing-card-head'>
              <h3 className='el-h3'>图片、视频与多模态灵活计费</h3>
              <span className='billing-card-num tabular-nums'>02</span>
            </div>
            <p className='el-body-sm' style={{ marginTop: 10 }}>
              提供极其丰富的计费方案，按模型原生形态灵活支持按 Token、按张、按秒、按分钟或按次（任务）计费，并细分分辨率、时长与功能档位；调用前清晰可预估，异常失败全额退回。
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
