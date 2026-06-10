import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getUrl, getScreenshots, deleteScreenshot, getHealthChecks, getHealthTrend, getHealthCheckDetail, getUrlAlerts, resolveAlert } from '../api.js'
import ImageCompare from '../components/ImageCompare.jsx'

function getScreenshotUrl(filePath) {
  const idx = filePath.indexOf('screenshots')
  if (idx === -1) return ''
  return '/' + filePath.slice(idx).replace(/\\/g, '/')
}

const HEALTH_STATUS_CONFIG = {
  healthy: { label: '健康', bgClass: 'bg-green-100', textClass: 'text-green-800', dotClass: 'bg-green-500' },
  warning: { label: '警告', bgClass: 'bg-yellow-100', textClass: 'text-yellow-800', dotClass: 'bg-yellow-500' },
  critical: { label: '严重异常', bgClass: 'bg-red-100', textClass: 'text-red-800', dotClass: 'bg-red-500' }
}

function getHealthConfig(status) {
  return HEALTH_STATUS_CONFIG[status] || HEALTH_STATUS_CONFIG.healthy
}

function HealthTrendChart({ trend }) {
  if (!trend || trend.length === 0) return null

  const maxLoadTime = Math.max(...trend.map(t => t.page_load_time || 0), 1000)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">健康趋势分析 (最近7天)</h3>

      <div className="mb-6">
        <div className="text-sm font-medium text-gray-700 mb-2">健康分数趋势</div>
        <div className="h-32 flex items-end gap-1">
          {trend.map((item, idx) => {
            const height = `${Math.max(5, item.overall_health_score)}%`
            const score = item.overall_health_score
            let barColor = 'bg-green-500'
            if (score < 50) barColor = 'bg-red-500'
            else if (score < 80) barColor = 'bg-yellow-500'
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="absolute -top-7 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                  {score}分 · {dayjs(item.created_at).format('MM-DD HH:mm')}
                </div>
                <div
                  className={`w-full rounded-t ${barColor} transition-all`}
                  style={{ height }}
                  title={`${score}分`}
                ></div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">页面加载时间 (ms)</div>
          <div className="h-20 flex items-end gap-1">
            {trend.map((item, idx) => {
              const height = `${((item.page_load_time || 0) / maxLoadTime) * 100}%`
              return (
                <div
                  key={idx}
                  className="flex-1 bg-blue-400 rounded-t group relative"
                  style={{ height: height || '4px' }}
                  title={`${item.page_load_time || 0}ms`}
                >
                  <div className="absolute -top-7 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {item.page_load_time || 0}ms
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">资源加载成功率</div>
          <div className="h-20 flex items-end gap-1">
            {trend.map((item, idx) => {
              const rate = Math.round((item.resource_load_success_rate || 0) * 100)
              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-t group relative ${rate < 80 ? 'bg-red-400' : rate < 95 ? 'bg-yellow-400' : 'bg-green-400'}`}
                  style={{ height: `${rate}%` }}
                  title={`${rate}%`}
                >
                  <div className="absolute -top-7 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {rate}%
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">JS错误数</div>
          <div className="h-20 flex items-end gap-1">
            {trend.map((item, idx) => {
              const count = item.js_error_count || 0
              const height = `${Math.min(count * 20, 100)}%`
              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-t group relative ${count > 0 ? 'bg-orange-500' : 'bg-gray-300'}`}
                  style={{ height: height || '4px' }}
                  title={`${count}个`}
                >
                  <div className="absolute -top-7 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {count}个错误
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function HealthCheckDetailModal({ checkId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await getHealthCheckDetail(checkId)
        setDetail(res.data)
      } catch (err) {
        alert('加载失败: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [checkId])

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8">加载中...</div>
      </div>
    )
  }

  const healthConfig = getHealthConfig(detail.health_status)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-4xl w-full my-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 rounded-t-xl px-6 py-4 flex justify-between items-center z-10">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              健康检查详情
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${healthConfig.bgClass} ${healthConfig.textClass}`}>
                {healthConfig.label}
              </span>
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {dayjs(detail.created_at).format('YYYY-MM-DD HH:mm:ss')}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">健康分数</div>
              <div className={`text-2xl font-bold ${
                detail.overall_health_score < 50 ? 'text-red-600' :
                detail.overall_health_score < 80 ? 'text-yellow-600' : 'text-green-600'
              }`}>{detail.overall_health_score}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">HTTP状态码</div>
              <div className={`text-2xl font-bold ${
                !detail.http_status_code || detail.http_status_code >= 400 ? 'text-red-600' :
                detail.http_status_code >= 300 ? 'text-yellow-600' : 'text-green-600'
              }`}>{detail.http_status_code || '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">页面加载耗时</div>
              <div className="text-2xl font-bold text-blue-600">
                {detail.page_load_time ? `${detail.page_load_time}ms` : '-'}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-1">首屏渲染</div>
              <div className="text-2xl font-bold text-purple-600">
                {detail.first_contentful_paint_time ? `${detail.first_contentful_paint_time}ms` : '-'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">性能指标</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">DOM加载完成</span>
                  <span className="font-medium text-gray-800">{detail.dom_content_loaded_time ? `${detail.dom_content_loaded_time}ms` : '-'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">首次绘制</span>
                  <span className="font-medium text-gray-800">{detail.first_paint_time ? `${detail.first_paint_time}ms` : '-'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">页面加载状态</span>
                  <span className={`font-medium ${detail.page_load_status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {detail.page_load_status}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">资源统计</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">资源总数</span>
                  <span className="font-medium text-gray-800">{detail.resource_load_total_count}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">成功加载</span>
                  <span className="font-medium text-green-600">{detail.resource_load_success_count}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500">成功率</span>
                  <span className={`font-medium ${
                    (detail.resource_load_success_rate || 0) < 0.8 ? 'text-red-600' :
                    (detail.resource_load_success_rate || 0) < 0.95 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {Math.round((detail.resource_load_success_rate || 0) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className={`rounded-lg p-4 ${detail.js_error_count > 0 ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
              <div className="text-xs text-gray-500 mb-1">JS运行错误</div>
              <div className={`text-xl font-bold ${detail.js_error_count > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {detail.js_error_count}
              </div>
            </div>
            <div className={`rounded-lg p-4 ${detail.console_error_count > 0 ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
              <div className="text-xs text-gray-500 mb-1">控制台错误</div>
              <div className={`text-xl font-bold ${detail.console_error_count > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                {detail.console_error_count}
              </div>
            </div>
            <div className={`rounded-lg p-4 ${detail.console_warn_count > 0 ? 'bg-yellow-50 border border-yellow-100' : 'bg-gray-50'}`}>
              <div className="text-xs text-gray-500 mb-1">控制台警告</div>
              <div className={`text-xl font-bold ${detail.console_warn_count > 0 ? 'text-yellow-600' : 'text-gray-600'}`}>
                {detail.console_warn_count}
              </div>
            </div>
          </div>

          {detail.screenshot_path && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">页面截图证据</h4>
              <img
                src={getScreenshotUrl(detail.screenshot_path)}
                alt="screenshot evidence"
                className="w-full rounded-lg border border-gray-200"
              />
            </div>
          )}

          {detail.console_errors && detail.console_errors.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                JavaScript / 控制台错误 ({detail.console_errors.length})
              </h4>
              <div className="space-y-3">
                {detail.console_errors.map((err, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-100 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-200 text-red-800">
                        {err.type}
                      </span>
                      {err.source && (
                        <span className="text-xs text-gray-500 truncate max-w-xs" title={err.source}>
                          {err.source}
                          {err.line_number != null ? `:${err.line_number}` : ''}
                          {err.column_number != null ? `:${err.column_number}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-red-800 font-mono break-all">{err.message}</p>
                    {err.stack_trace && (
                      <pre className="mt-2 text-xs text-gray-700 bg-white rounded p-2 overflow-x-auto border border-red-100 max-h-40 overflow-y-auto">
                        {err.stack_trace}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.resource_errors && detail.resource_errors.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                资源加载失败 ({detail.resource_errors.length})
              </h4>
              <div className="bg-orange-50 border border-orange-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-orange-100 text-orange-800">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">类型</th>
                      <th className="px-4 py-2 text-left font-medium">资源URL</th>
                      <th className="px-4 py-2 text-left font-medium">状态</th>
                      <th className="px-4 py-2 text-left font-medium">错误信息</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-orange-100">
                    {detail.resource_errors.map((err, idx) => (
                      <tr key={idx} className="hover:bg-orange-100/50">
                        <td className="px-4 py-2 text-xs font-medium text-gray-600 uppercase whitespace-nowrap">
                          {err.resource_type}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-700 font-mono break-all max-w-xs">
                          <span className="truncate" title={err.resource_url}>{err.resource_url}</span>
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {err.status_code ? (
                            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium">{err.status_code}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-orange-700 truncate max-w-xs" title={err.error_message}>
                          {err.error_message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ScreenshotTimeline() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [urlInfo, setUrlInfo] = useState(null)
  const [screenshots, setScreenshots] = useState([])
  const [healthChecks, setHealthChecks] = useState([])
  const [healthTrend, setHealthTrend] = useState([])
  const [alerts, setAlerts] = useState([])
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState([])
  const [showCompare, setShowCompare] = useState(false)
  const [previewImage, setPreviewImage] = useState(null)
  const [detailCheckId, setDetailCheckId] = useState(null)
  const [activeTab, setActiveTab] = useState('screenshots')
  const [resolvingAlertId, setResolvingAlertId] = useState(null)

  const firstCompareId = compareSelection[0] || null
  const secondCompareId = compareSelection[1] || null

  const loadData = async () => {
    try {
      const [urlRes, shotsRes, checksRes, trendRes, alertsRes] = await Promise.all([
        getUrl(id),
        getScreenshots(id),
        getHealthChecks(id, 100),
        getHealthTrend(id, 7),
        getUrlAlerts(id)
      ])
      setUrlInfo(urlRes.data)
      setScreenshots(shotsRes.data)
      setHealthChecks(checksRes.data)
      setHealthTrend(trendRes.data)
      setAlerts(alertsRes.data)
    } catch (err) {
      alert('加载失败: ' + err.message)
    }
  }

  useEffect(() => {
    setCompareSelection([])
    setShowCompare(false)
    setCompareMode(false)
    setPreviewImage(null)
    setDetailCheckId(null)
    loadData()
  }, [id])

  const handleDelete = async (shot) => {
    if (!confirm(`确定删除此截图 (${dayjs(shot.created_at).format('YYYY-MM-DD HH:mm')})？`)) return
    try {
      await deleteScreenshot(shot.id)
      setCompareSelection(prev => prev.filter(id => id !== shot.id))
      loadData()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  const handleSelectCompare = (shotId) => {
    setCompareSelection(prev => {
      const idx = prev.indexOf(shotId)
      if (idx !== -1) {
        return prev.filter(id => id !== shotId)
      }
      if (prev.length === 0) {
        return [shotId]
      }
      if (prev.length === 1) {
        return [prev[0], shotId]
      }
      return [prev[1], shotId]
    })
  }

  const resetCompareSelection = () => {
    setCompareSelection([])
    setShowCompare(false)
    setCompareMode(false)
  }

  const startCompare = () => {
    if (compareSelection.length < 2) {
      alert('请选择两张截图进行对比')
      return
    }
    setShowCompare(true)
  }

  const handleResolveAlert = async (alertId) => {
    if (!confirm('确认标记此告警为已解决？')) return
    setResolvingAlertId(alertId)
    try {
      await resolveAlert(alertId)
      loadData()
    } catch (err) {
      alert('操作失败: ' + err.message)
    } finally {
      setResolvingAlertId(null)
    }
  }

  const groupedByDate = screenshots.reduce((acc, shot) => {
    const date = dayjs(shot.created_at).format('YYYY-MM-DD')
    if (!acc[date]) acc[date] = []
    acc[date].push(shot)
    return acc
  }, {})

  const firstShot = firstCompareId ? screenshots.find(s => s.id === firstCompareId) : null
  const secondShot = secondCompareId ? screenshots.find(s => s.id === secondCompareId) : null

  const orderedShots = firstShot && secondShot
    ? dayjs(firstShot.created_at).isBefore(secondShot.created_at)
      ? [firstShot, secondShot]
      : [secondShot, firstShot]
    : null

  const activeAlerts = alerts.filter(a => a.is_resolved === 0)

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/')}
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
        >
          ← 返回列表
        </button>
        <div className="h-6 w-px bg-gray-300"></div>
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            {urlInfo?.name || '加载中...'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 truncate">{urlInfo?.url}</p>
        </div>
      </div>

      {activeAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              当前告警 ({activeAlerts.length})
            </h3>
          </div>
          <div className="space-y-2">
            {activeAlerts.map(alert => (
              <div key={alert.id} className="bg-white rounded-lg p-3 border border-red-100">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{alert.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        alert.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {alert.severity === 'high' ? '高危' : '中危'}
                      </span>
                    </div>
                    {alert.description && (
                      <p className="text-xs text-gray-600 mt-1">{alert.description}</p>
                    )}
                    {alert.suggestion && (
                      <p className="text-xs text-blue-600 mt-1 bg-blue-50 rounded px-2 py-1 inline-block">
                        💡 {alert.suggestion}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleResolveAlert(alert.id)}
                    disabled={resolvingAlertId === alert.id}
                    className="text-xs bg-green-50 text-green-700 px-3 py-1 rounded hover:bg-green-100 disabled:opacity-50 whitespace-nowrap flex-shrink-0"
                  >
                    {resolvingAlertId === alert.id ? '处理中...' : '标记解决'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <HealthTrendChart trend={healthTrend} />

      <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('screenshots')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'screenshots'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            截图归档 ({screenshots.length})
          </button>
          <button
            onClick={() => setActiveTab('health')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'health'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            健康检查记录 ({healthChecks.length})
          </button>
        </div>

        <div className="p-4">
          {activeTab === 'screenshots' ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-600">
                  共 <span className="font-medium text-gray-900">{screenshots.length}</span> 张截图
                </div>
                {compareMode ? (
                  <div className="flex gap-2">
                    <span className="text-sm text-gray-500 py-1.5">
                      已选: {compareSelection.length} / 2
                      {compareSelection.length === 2 && ' (再点将替换较早的那张)'}
                    </span>
                    <button
                      onClick={startCompare}
                      disabled={compareSelection.length < 2}
                      className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                    >
                      开始对比
                    </button>
                    <button
                      onClick={resetCompareSelection}
                      className="bg-gray-100 text-gray-700 px-4 py-1.5 rounded-lg text-sm hover:bg-gray-200"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (screenshots.length < 2) {
                        alert('至少需要两张截图才能对比')
                        return
                      }
                      setCompareSelection([])
                      setShowCompare(false)
                      setCompareMode(true)
                    }}
                    className="bg-blue-50 text-blue-700 px-4 py-1.5 rounded-lg text-sm hover:bg-blue-100"
                  >
                    对比模式
                  </button>
                )}
              </div>

              {screenshots.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  暂无截图，等待首次执行或返回列表点击"立即检查"
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(groupedByDate).map(([date, shots]) => (
                    <div key={date}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="text-lg font-semibold text-gray-800">{date}</div>
                        <div className="flex-1 h-px bg-gray-200"></div>
                        <div className="text-sm text-gray-500">{shots.length} 张</div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {shots.map((shot) => {
                          const isFirst = firstCompareId === shot.id
                          const isSecond = secondCompareId === shot.id
                          const imgUrl = getScreenshotUrl(shot.file_path)
                          const linkedHealth = healthChecks.find(h => h.screenshot_id === shot.id)
                          const hConfig = linkedHealth ? getHealthConfig(linkedHealth.health_status) : null

                          return (
                            <div
                              key={shot.id}
                              className={`bg-white rounded-xl shadow-sm border-2 overflow-hidden transition-all ${
                                isFirst || isSecond
                                  ? 'border-blue-500 ring-2 ring-blue-200'
                                  : 'border-gray-200 hover:shadow-md'
                              } ${compareMode ? 'cursor-pointer' : ''}`}
                              onClick={() => compareMode && handleSelectCompare(shot.id)}
                            >
                              <div
                                className="relative bg-gray-100 overflow-hidden"
                                style={{ aspectRatio: '16/9' }}
                                onClick={(e) => {
                                  if (!compareMode) {
                                    e.stopPropagation()
                                    setPreviewImage({ src: imgUrl, time: shot.created_at })
                                  }
                                }}
                              >
                                <img
                                  src={imgUrl}
                                  alt={`screenshot-${shot.id}`}
                                  className="w-full h-full object-cover object-top"
                                  loading="lazy"
                                />
                                {hConfig && (
                                  <div className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${hConfig.bgClass} ${hConfig.textClass}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${hConfig.dotClass}`}></span>
                                    {hConfig.label} {linkedHealth.overall_health_score}
                                  </div>
                                )}
                                {(isFirst || isSecond) && (
                                  <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded">
                                    {isFirst ? '已选 1' : '已选 2'}
                                  </div>
                                )}
                              </div>
                              <div className="p-3">
                                <div className="text-sm text-gray-700 font-medium">
                                  {dayjs(shot.created_at).format('HH:mm:ss')}
                                </div>
                                {!compareMode && (
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPreviewImage({ src: imgUrl, time: shot.created_at })
                                      }}
                                      className="flex-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200"
                                    >
                                      查看大图
                                    </button>
                                    {linkedHealth && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setDetailCheckId(linkedHealth.id)
                                        }}
                                        className="flex-1 text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded hover:bg-purple-100"
                                      >
                                        健康详情
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDelete(shot)
                                      }}
                                      className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded hover:bg-red-100"
                                    >
                                      删除
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {healthChecks.length === 0 ? (
                <div className="p-12 text-center text-gray-500">暂无健康检查记录</div>
              ) : (
                healthChecks.map(check => {
                  const hConfig = getHealthConfig(check.health_status)
                  return (
                    <div
                      key={check.id}
                      className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-all ${hConfig.bgClass} border-l-4 ${check.health_status === 'critical' ? 'border-l-red-500' : check.health_status === 'warning' ? 'border-l-yellow-500' : 'border-l-green-500'}`}
                      onClick={() => setDetailCheckId(check.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                            check.overall_health_score < 50 ? 'bg-red-200 text-red-800' :
                            check.overall_health_score < 80 ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'
                          }`}>
                            {check.overall_health_score}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {dayjs(check.created_at).format('YYYY-MM-DD HH:mm:ss')}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${hConfig.bgClass} ${hConfig.textClass} border`}>
                                {hConfig.label}
                              </span>
                            </div>
                            {check.error_summary ? (
                              <p className="text-xs text-gray-600 mt-0.5">{check.error_summary}</p>
                            ) : (
                              <p className="text-xs text-gray-400 mt-0.5">所有指标正常</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                          {check.http_status_code && (
                            <span>HTTP: {check.http_status_code}</span>
                          )}
                          {check.page_load_time && (
                            <span>加载: {check.page_load_time}ms</span>
                          )}
                          {check.resource_load_success_rate != null && (
                            <span>资源: {Math.round(check.resource_load_success_rate * 100)}%</span>
                          )}
                          {check.screenshot_id && (
                            <span className="inline-flex items-center gap-1 text-blue-600">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              已存证
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex flex-col"
          onClick={() => setPreviewImage(null)}
        >
          <div className="bg-gray-900 px-6 py-4 flex justify-between items-center">
            <h3 className="text-white">
              {dayjs(previewImage.time).format('YYYY-MM-DD HH:mm:ss')}
            </h3>
            <button className="text-white hover:text-gray-300 text-2xl leading-none">×</button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-6">
            <img
              src={previewImage.src}
              alt="preview"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {showCompare && orderedShots && (
        <ImageCompare
          beforeImage={getScreenshotUrl(orderedShots[0].file_path)}
          afterImage={getScreenshotUrl(orderedShots[1].file_path)}
          beforeLabel={dayjs(orderedShots[0].created_at).format('YYYY-MM-DD HH:mm:ss')}
          afterLabel={dayjs(orderedShots[1].created_at).format('YYYY-MM-DD HH:mm:ss')}
          onClose={resetCompareSelection}
        />
      )}

      {detailCheckId && (
        <HealthCheckDetailModal
          checkId={detailCheckId}
          onClose={() => setDetailCheckId(null)}
        />
      )}
    </div>
  )
}
