import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  MessageSquare,
  Search,
  Video,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { PublicLayout } from '@/components/layout'
import { BrandFooter } from '@/features/magirouter-home/components/brand-footer'
import { resolveBaseUrl } from '@/features/magirouter-home/lib/snippets'
import { usePricingData } from '@/features/pricing/hooks'
import type { PricingModel } from '@/features/pricing/types'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import {
  HighlightedCode,
  type CodeLanguage,
} from './components/highlighted-code'
import {
  DOCS_GROUP_ORDER,
  DOCS_MODALITY_ORDER,
  DOCS_MODALITY_TITLES,
  buildDocMarkdown,
  buildDocsModelFamilies,
  buildModelDocArticle,
  buildStaticDocs,
  inferDocsModality,
  type DocsArticle,
  type DocsModality,
  type DocsModelFamily,
} from './data/docs-data'

const CODE_TABS: { value: Exclude<CodeLanguage, 'bash'>; label: string }[] = [
  { value: 'curl', label: 'cURL' },
  { value: 'python', label: 'Python' },
  { value: 'node', label: 'Node.js' },
  { value: 'json', label: 'JSON' },
]

function ModalityIcon(props: { modality: DocsModality }) {
  if (props.modality === 'image') return <ImageIcon size={12} />
  if (props.modality === 'video') return <Video size={12} />
  if (props.modality === 'audio') return <AudioLines size={12} />
  return <MessageSquare size={12} />
}

function escapeHtmlText(raw: string): string {
  return raw
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function buildDocHtml(article: DocsArticle): string {
  const sectionsHtml = article.sections
    .map((section) => {
      const paragraphsHtml = section.paragraphs
        .map((paragraph) => `<p>${escapeHtmlText(paragraph)}</p>`)
        .join('\n')
      const tableHtml = section.table
        ? `<table><thead><tr>${section.table.headers
            .map((header) => `<th>${escapeHtmlText(header)}</th>`)
            .join('')}</tr></thead><tbody>${section.table.rows
            .map(
              (row) =>
                `<tr>${row
                  .map((cell) => `<td>${escapeHtmlText(cell)}</td>`)
                  .join('')}</tr>`
            )
            .join('')}</tbody></table>`
        : ''
      return `<section><h2>${escapeHtmlText(section.title)}</h2>${paragraphsHtml}${tableHtml}</section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${escapeHtmlText(article.title)} - MagiRouter Docs</title></head>
<body>
<h1>${escapeHtmlText(article.title)}</h1>
<p>${escapeHtmlText(article.summary)}</p>
<p><strong>${escapeHtmlText(article.urlLabel)}:</strong> <code>${escapeHtmlText(article.urlValue)}</code></p>
${sectionsHtml}
<h2>cURL</h2>
<pre><code>${escapeHtmlText(article.snippets.curl)}</code></pre>
</body>
</html>`
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function getMethodBadgeClass(method: string): string {
  if (method === 'GET') return 'docs-ref-method is-get'
  if (method === 'DELETE') return 'docs-ref-method is-delete'
  return 'docs-ref-method'
}

export function DocsCenter() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/docs/' })
  const { status } = useStatus()
  const pricing = usePricingData(true)
  const baseUrl = resolveBaseUrl(status?.server_address)

  const [query, setQuery] = useState('')
  const [codeTab, setCodeTab] =
    useState<Exclude<CodeLanguage, 'bash'>>('curl')
  const [expandedFamilies, setExpandedFamilies] = useState<string[]>([])
  const [exportOpen, setExportOpen] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string>('')
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousPage = document.body.dataset.currentPage
    document.body.dataset.currentPage = 'docs'
    return () => {
      if (previousPage) {
        document.body.dataset.currentPage = previousPage
      } else {
        delete document.body.dataset.currentPage
      }
    }
  }, [])

  useEffect(() => {
    if (!exportOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [exportOpen])

  const liveModelMap = useMemo(() => {
    const map = new Map<string, PricingModel>()
    for (const model of pricing.models) {
      map.set(model.model_name, model)
    }
    return map
  }, [pricing.models])

  const staticDocs = useMemo(() => buildStaticDocs(baseUrl), [baseUrl])

  // Family tree is derived from the live catalog so the sidebar can never
  // list a model that is not actually callable, or miss a newly added one.
  const modelFamilies = useMemo(
    () => buildDocsModelFamilies(pricing.models),
    [pricing.models]
  )

  useEffect(() => {
    if (modelFamilies.length === 0) return
    setExpandedFamilies((prev) =>
      prev.length > 0 ? prev : [modelFamilies[0].name]
    )
  }, [modelFamilies])

  const modelArticles = useMemo(() => {
    const list: DocsArticle[] = []
    for (const family of modelFamilies) {
      for (const modelId of family.models) {
        list.push(
          buildModelDocArticle(
            modelId,
            baseUrl,
            family,
            liveModelMap.get(modelId)
          )
        )
      }
    }
    return list
  }, [baseUrl, liveModelMap, modelFamilies])

  const orderedArticles = useMemo(() => {
    const list: DocsArticle[] = []
    for (const group of DOCS_GROUP_ORDER) {
      if (group === 'API 概览') {
        for (const cap of DOCS_MODALITY_ORDER) {
          list.push(...modelArticles.filter((article) => article.cap === cap))
        }
      } else {
        list.push(...staticDocs.filter((article) => article.group === group))
      }
    }
    return list
  }, [modelArticles, staticDocs])

  const articleById = useMemo(() => {
    const map = new Map<string, DocsArticle>()
    for (const article of orderedArticles) {
      map.set(article.id, article)
    }
    return map
  }, [orderedArticles])

  const activeArticle = useMemo(() => {
    const requestedId = search.doc
    if (requestedId && articleById.has(requestedId)) {
      return articleById.get(requestedId) as DocsArticle
    }
    if (requestedId && requestedId.startsWith('model:')) {
      const dynamicModelId = requestedId.slice('model:'.length).trim()
      if (dynamicModelId) {
        const liveModel = liveModelMap.get(dynamicModelId)
        const cap = inferDocsModality({
          model_name: dynamicModelId,
          tags: liveModel?.tags,
          supported_endpoint_types: liveModel?.supported_endpoint_types,
        })
        const fallbackFamily: DocsModelFamily = {
          name: liveModel?.vendor_name
            ? `${liveModel.vendor_name} 系列`
            : '在线模型',
          cap,
          vendor: liveModel?.vendor_name || 'MagiRouter',
          models: [dynamicModelId],
        }
        return buildModelDocArticle(
          dynamicModelId,
          baseUrl,
          fallbackFamily,
          liveModel
        )
      }
    }
    return orderedArticles[0] ?? staticDocs[0]
  }, [
    articleById,
    baseUrl,
    liveModelMap,
    orderedArticles,
    search.doc,
    staticDocs,
  ])

  const activeIndex = orderedArticles.findIndex(
    (article) => article.id === activeArticle.id
  )
  const prevArticle = activeIndex > 0 ? orderedArticles[activeIndex - 1] : null
  const nextArticle =
    activeIndex >= 0 && activeIndex < orderedArticles.length - 1
      ? orderedArticles[activeIndex + 1]
      : null

  useEffect(() => {
    const familyName = activeArticle.familyName
    if (familyName) {
      setExpandedFamilies((prev) =>
        prev.includes(familyName) ? prev : [...prev, familyName]
      )
    }
    setActiveSectionId(activeArticle.sections[0]?.id ?? 'reference')
  }, [activeArticle.familyName, activeArticle.id, activeArticle.sections])

  const selectArticle = (id: string) => {
    void navigate({
      to: '/docs',
      search: { doc: id },
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleFamily = (familyName: string) => {
    setExpandedFamilies((prev) =>
      prev.includes(familyName)
        ? prev.filter((name) => name !== familyName)
        : [...prev, familyName]
    )
  }

  const normalizedQuery = query.trim().toLowerCase()

  const matchesQuery = (text: string) =>
    !normalizedQuery || text.toLowerCase().includes(normalizedQuery)

  const copyWithFeedback = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current))
    }, 1800)
  }

  const buildAllMarkdown = () =>
    [
      '# MagiRouter 开发接入全量文档',
      '',
      `- Base URL: \`${baseUrl}/v1\``,
      '',
      ...orderedArticles.map((article) => buildDocMarkdown(article)),
    ].join('\n---\n\n')

  const handleDownloadCurrentMarkdown = () => {
    const safeName = activeArticle.id.replaceAll(/[^a-zA-Z0-9-_]+/g, '-')
    downloadFile(
      `magirouter-${safeName}.md`,
      buildDocMarkdown(activeArticle),
      'text/markdown;charset=utf-8'
    )
    setExportOpen(false)
  }

  const handleDownloadCurrentHtml = () => {
    const safeName = activeArticle.id.replaceAll(/[^a-zA-Z0-9-_]+/g, '-')
    downloadFile(
      `magirouter-${safeName}.html`,
      buildDocHtml(activeArticle),
      'text/html;charset=utf-8'
    )
    setExportOpen(false)
  }

  const handleDownloadAllMarkdown = () => {
    downloadFile(
      'magirouter-docs-all.md',
      buildAllMarkdown(),
      'text/markdown;charset=utf-8'
    )
    setExportOpen(false)
  }

  const isModelDoc = activeArticle.id.startsWith('model:')

  const tocItems = [
    ...activeArticle.sections.map((section) => ({
      id: section.id,
      title: section.title,
    })),
    { id: 'reference', title: '接口端点与调用示例' },
  ]

  const scrollToSection = (sectionId: string) => {
    setActiveSectionId(sectionId)
    const target = document.querySelector(`#doc-sec-${sectionId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <PublicLayout showMainContainer={false}>
      <section data-page='docs' id='docs-page'>
        <div className='el-container'>
          <div className='docs-shell'>
            <aside
              className='docs-sidebar mr-no-scrollbar'
              aria-label='文档目录'
            >
              <div className='catalog-search-wrap' style={{ width: '100%' }}>
                <span className='catalog-search-icon' aria-hidden='true'>
                  <Search size={14} />
                </span>
                <input
                  type='search'
                  id='docs-search-input'
                  className='el-search-input'
                  style={{ width: '100%' }}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder='筛选文档章节或模型…'
                />
              </div>

              <nav id='docs-sidebar-groups'>
                {DOCS_GROUP_ORDER.map((groupName) => {
                  if (groupName === 'API 概览') {
                    const visibleBlocks = DOCS_MODALITY_ORDER.map((cap) => {
                      const families = modelFamilies.filter(
                        (family) => family.cap === cap
                      )
                        .map((family) => {
                          const matchedModels = family.models.filter(
                            (modelId) =>
                              matchesQuery(modelId) ||
                              matchesQuery(family.name) ||
                              matchesQuery(family.vendor) ||
                              matchesQuery(DOCS_MODALITY_TITLES[cap])
                          )
                          return {
                            ...family,
                            models: matchedModels,
                          }
                        })
                        .filter((family) => family.models.length > 0)
                      return {
                        cap,
                        title: DOCS_MODALITY_TITLES[cap],
                        families,
                      }
                    }).filter((block) => block.families.length > 0)

                    if (modelFamilies.length === 0) {
                      return (
                        <div key={groupName} className='docs-group'>
                          <div className='docs-group-title'>{groupName}</div>
                          <p className='docs-nav-empty'>
                            {pricing.isLoading
                              ? '正在读取线上模型目录…'
                              : '模型目录为空。请先在控制台上线模型与分组。'}
                          </p>
                        </div>
                      )
                    }

                    if (visibleBlocks.length === 0) return null

                    return (
                      <div key={groupName} className='docs-group'>
                        <div className='docs-group-title'>{groupName}</div>
                        <div className='docs-nav-list'>
                          {visibleBlocks.map((block) => (
                            <div key={block.cap} className='docs-modality-block'>
                              <div className='docs-cap-divider'>
                                {block.title}
                              </div>
                              {block.families.map((family: DocsModelFamily) => {
                                const isOpen =
                                  Boolean(normalizedQuery) ||
                                  expandedFamilies.includes(family.name)
                                return (
                                  <div key={family.name} className='docs-folder'>
                                    <button
                                      type='button'
                                      onClick={() => toggleFamily(family.name)}
                                      className={cn(
                                        'docs-folder-btn',
                                        isOpen && 'is-open'
                                      )}
                                    >
                                      <span className='docs-family-lead'>
                                        <span
                                          className={cn(
                                            'docs-cap-icon',
                                            `is-${family.cap}`
                                          )}
                                        >
                                          <ModalityIcon modality={family.cap} />
                                        </span>
                                        <span className='truncate'>
                                          {family.name}
                                        </span>
                                      </span>
                                      <span className='docs-family-right'>
                                        <span className='docs-family-count'>
                                          {family.models.length}
                                        </span>
                                        <ChevronRight
                                          size={13}
                                          className='docs-folder-chevron'
                                        />
                                      </span>
                                    </button>
                                    {isOpen && (
                                      <div className='docs-folder-children'>
                                        {family.models.map((modelId) => {
                                          const docId = `model:${modelId}`
                                          const isActive =
                                            activeArticle.id === docId
                                          return (
                                            <button
                                              key={modelId}
                                              type='button'
                                              onClick={() =>
                                                selectArticle(docId)
                                              }
                                              className={cn(
                                                'docs-nav-btn is-model-item',
                                                isActive && 'is-active'
                                              )}
                                            >
                                              {modelId}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }

                  const groupArticles = staticDocs.filter(
                    (article) =>
                      article.group === groupName &&
                      (matchesQuery(article.title) ||
                        matchesQuery(article.summary) ||
                        matchesQuery(groupName))
                  )
                  if (groupArticles.length === 0) return null

                  return (
                    <div key={groupName} className='docs-group'>
                      <div className='docs-group-title'>{groupName}</div>
                      <div className='docs-nav-list'>
                        {groupArticles.map((article) => {
                          const isActive = activeArticle.id === article.id
                          return (
                            <button
                              key={article.id}
                              type='button'
                              onClick={() => selectArticle(article.id)}
                              className={cn(
                                'docs-nav-btn',
                                isActive && 'is-active'
                              )}
                            >
                              {article.title}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </nav>
            </aside>

            <article className='docs-article' id='docs-article-host'>
              <div className='docs-breadcrumb'>
                <span>开发文档</span>
                <span>/</span>
                <span>{activeArticle.group}</span>
                {activeArticle.cap && (
                  <>
                    <span>/</span>
                    <span>{DOCS_MODALITY_TITLES[activeArticle.cap]}</span>
                  </>
                )}
                {activeArticle.familyName && (
                  <>
                    <span>/</span>
                    <span>{activeArticle.familyName}</span>
                  </>
                )}
                <span>/</span>
                <span style={{ color: 'var(--ink-strong)' }}>
                  {activeArticle.title}
                </span>
              </div>

              <div className='docs-title-row'>
                <h1 className='docs-article-title'>{activeArticle.title}</h1>
                <div className='docs-export-wrap' ref={exportMenuRef}>
                  <button
                    type='button'
                    className='el-btn el-btn-sm el-btn-white'
                    aria-haspopup='menu'
                    aria-expanded={exportOpen}
                    onClick={() => setExportOpen((prev) => !prev)}
                  >
                    {copiedKey === 'markdown' || copiedKey === 'html' ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    <span>
                      {copiedKey === 'markdown' || copiedKey === 'html'
                        ? '已复制'
                        : '复制 Markdown'}
                    </span>
                    <ChevronDown size={13} />
                  </button>
                  {exportOpen && (
                    <div
                      className='docs-export-menu'
                      role='menu'
                      aria-label='文档复制与下载选项'
                    >
                      <div className='docs-export-group-label'>当前文档</div>
                      <button
                        type='button'
                        className='docs-export-item'
                        role='menuitem'
                        onClick={() => {
                          void copyWithFeedback(
                            'markdown',
                            buildDocMarkdown(activeArticle)
                          )
                          setExportOpen(false)
                        }}
                      >
                        <span>复制当前 Markdown</span>
                        <span className='docs-export-ext'>.md</span>
                      </button>
                      <button
                        type='button'
                        className='docs-export-item'
                        role='menuitem'
                        onClick={handleDownloadCurrentMarkdown}
                      >
                        <span>下载当前 Markdown</span>
                        <span className='docs-export-ext'>.md</span>
                      </button>
                      <button
                        type='button'
                        className='docs-export-item'
                        role='menuitem'
                        onClick={() => {
                          void copyWithFeedback(
                            'html',
                            buildDocHtml(activeArticle)
                          )
                          setExportOpen(false)
                        }}
                      >
                        <span>复制当前 HTML</span>
                        <span className='docs-export-ext'>.html</span>
                      </button>
                      <button
                        type='button'
                        className='docs-export-item'
                        role='menuitem'
                        onClick={handleDownloadCurrentHtml}
                      >
                        <span>下载当前 HTML</span>
                        <span className='docs-export-ext'>.html</span>
                      </button>
                      <div className='docs-export-sep' />
                      <div className='docs-export-group-label'>全量文档</div>
                      <button
                        type='button'
                        className='docs-export-item'
                        role='menuitem'
                        onClick={() => {
                          void copyWithFeedback('markdown', buildAllMarkdown())
                          setExportOpen(false)
                        }}
                      >
                        <span>复制全量指南</span>
                        <span className='docs-export-ext'>.md</span>
                      </button>
                      <button
                        type='button'
                        className='docs-export-item'
                        role='menuitem'
                        onClick={handleDownloadAllMarkdown}
                      >
                        <span>下载全量 Markdown</span>
                        <span className='docs-export-ext'>.md</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <p
                style={{
                  margin: '-6px 0 0',
                  fontSize: '15px',
                  lineHeight: 1.65,
                  color: 'var(--ink-muted)',
                }}
              >
                {activeArticle.summary}
              </p>

              {activeArticle.urlValue && (
                <div className='docs-url-bar'>
                  <div className='docs-url-main'>
                    <span className='docs-url-label'>
                      {activeArticle.urlLabel}
                    </span>
                    <code className='docs-url-value'>
                      {activeArticle.urlValue}
                    </code>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type='button'
                      className='el-btn el-btn-sm el-btn-white'
                      onClick={() =>
                        void copyWithFeedback('url', activeArticle.urlValue)
                      }
                    >
                      {copiedKey === 'url' ? '已复制' : '复制地址'}
                    </button>
                    {isModelDoc && (
                      <Link
                        to='/playground'
                        className='el-btn el-btn-sm el-btn-primary'
                      >
                        在 Playground 调试 →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {activeArticle.sections.map((section) => (
                <div
                  key={section.id}
                  id={`doc-sec-${section.id}`}
                  className='docs-section-block scroll-mt-24'
                >
                  <h2>{section.title}</h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={`${section.id}-${paragraph.slice(0, 40)}`}>
                      {paragraph}
                    </p>
                  ))}
                  {section.table && (
                    <div className='docs-table-wrap'>
                      <table className='docs-param-table'>
                        <thead>
                          <tr>
                            {section.table.headers.map((header) => (
                              <th key={header}>{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {section.table.rows.map((row) => {
                            const rowKey = row.join('|')
                            const headers = section.table?.headers ?? []
                            return (
                              <tr key={rowKey}>
                                {row.map((cell, cellIndex) => (
                                  <td
                                    key={`${rowKey}-${headers[cellIndex] ?? cell}`}
                                  >
                                    {cellIndex === 1 && !cell.includes(' ') ? (
                                      <code>{cell}</code>
                                    ) : (
                                      cell
                                    )}
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}

              <div
                id='doc-sec-reference'
                className='docs-section-block scroll-mt-24'
              >
                <h2>接口端点与调用示例</h2>
                <div
                  id='docs-inline-ref-host'
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div className='docs-ref-card'>
                    <div className='docs-ref-head'>
                      <span>Endpoints</span>
                      <span>
                        {activeArticle.familyName || activeArticle.group}
                      </span>
                    </div>
                    <div className='docs-ref-endpoints'>
                      {activeArticle.endpoints.map((endpoint) => {
                        const epKey = `ep:${endpoint.method}:${endpoint.path}`
                        return (
                          <div key={epKey} className='docs-ref-ep-row'>
                            <span className='docs-ref-ep-main'>
                              <span
                                className={getMethodBadgeClass(endpoint.method)}
                              >
                                {endpoint.method}
                              </span>
                              <span className='docs-ref-ep-path'>
                                {endpoint.path}
                              </span>
                            </span>
                            <button
                              type='button'
                              className='docs-ref-copy'
                              onClick={() =>
                                void copyWithFeedback(
                                  epKey,
                                  `${baseUrl}${endpoint.path}`
                                )
                              }
                            >
                              {copiedKey === epKey ? '已复制' : '复制'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className='docs-ref-card'>
                    <div className='docs-ref-head'>
                      <div className='docs-ref-tabs'>
                        {CODE_TABS.map((tab) => (
                          <button
                            key={tab.value}
                            type='button'
                            onClick={() => setCodeTab(tab.value)}
                            className={cn(
                              'docs-ref-tab',
                              codeTab === tab.value && 'is-active'
                            )}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type='button'
                        className='docs-ref-copy'
                        onClick={() =>
                          void copyWithFeedback(
                            'snippet',
                            activeArticle.snippets[codeTab]
                          )
                        }
                      >
                        {copiedKey === 'snippet' ? '已复制' : '复制示例'}
                      </button>
                    </div>
                    <HighlightedCode
                      code={activeArticle.snippets[codeTab]}
                      language={codeTab}
                      className='docs-ref-pre'
                    />
                  </div>

                  <div className='docs-ref-card'>
                    <div className='docs-ref-head'>
                      <span>{activeArticle.responseTitle}</span>
                      <button
                        type='button'
                        className='docs-ref-copy'
                        onClick={() =>
                          void copyWithFeedback(
                            'response',
                            activeArticle.responseJson
                          )
                        }
                      >
                        {copiedKey === 'response' ? '已复制' : '复制响应'}
                      </button>
                    </div>
                    <HighlightedCode
                      code={activeArticle.responseJson}
                      language='json'
                      className='docs-ref-pre'
                    />
                  </div>
                </div>
              </div>

              <div className='docs-pager'>
                {prevArticle ? (
                  <button
                    type='button'
                    className='docs-pager-card'
                    onClick={() => selectArticle(prevArticle.id)}
                  >
                    <span className='el-eyebrow'>← 上一篇</span>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--ink-strong)',
                      }}
                    >
                      {prevArticle.title}
                    </span>
                  </button>
                ) : (
                  <div />
                )}
                {nextArticle ? (
                  <button
                    type='button'
                    className='docs-pager-card is-next'
                    onClick={() => selectArticle(nextArticle.id)}
                  >
                    <span className='el-eyebrow'>下一篇 →</span>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--ink-strong)',
                      }}
                    >
                      {nextArticle.title}
                    </span>
                  </button>
                ) : (
                  <div />
                )}
              </div>
            </article>

            <aside className='docs-toc' aria-label='本页目录'>
              <div className='docs-toc-title'>本页目录</div>
              {tocItems.map((item) => (
                <button
                  key={item.id}
                  type='button'
                  onClick={() => scrollToSection(item.id)}
                  className={cn(
                    'docs-toc-link',
                    activeSectionId === item.id && 'is-active'
                  )}
                >
                  {item.title}
                </button>
              ))}
            </aside>
          </div>
        </div>
      </section>
      <BrandFooter />
    </PublicLayout>
  )
}
