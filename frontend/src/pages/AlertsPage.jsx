import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getAlerts, resolveAlert } from '../api.js'

const SEVERITY_CONFIG = {
  high: {
    label: '高危',
    bgClass: 'bg-red-100',
    textClass: 'text-red-800',
    borderClass: 'border-l-red-500',
    dotClass: 'bg-red-500'
  },
  medium: {
    label: '中危',
    bgClass: 'bg-yellow-100',
    textClass: 'text-yellow-800',
    borderClass: 'border-l-yellow-500',
    dotClass: 'bg-yellow-500'
  },
  low: {
    label: '低危',
    bgClass: 'bg-blue-100',
    textClass: 'text-blue-800',
    borderClass: 'border-l-blue-500',
    dotClass: 'bg-blue-500'
  }
}

function getSeverityConfig(severity) {
  return SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.medium
}

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState('active')
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState(null)
  const navigate = useNavigate()

  const loadAlerts = async () => {
    setLoading(true)
    try {
      const resolved = activeTab === 'resolved'
      const res = await getAlerts(resolved, 100)
      setAlerts(res.data)
    } catch (err) {
      alert('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAlerts()
  }, [activeTab])

  const handleResolve = async (id) => {
    if (!confirm('确认标记此告警为已解决？')) return
    setResolvingId(id)
    try {
      await resolveAlert(id)
      loadAlerts()
    } catch (err) {
      alert('操作失败: ' + err.message)
    } finally {
      setResolvingId(null)
    }
  }

  const groupedAlerts = alerts.reduce((acc, alert) => {
    const date = dayjs(alert.created_at).format('YYYY-MM-DD')
    if (!acc[date]) acc[date] = []
    acc[date].push(alert)
    return acc
  }, {})

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800">告警中心</h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'active'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            未解决告警
            {activeTab !== 'active' && alerts.length > 0 && (
              <span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('resolved')}
            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'resolved'
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            已解决告警
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          加载中...
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <div className="text-gray-600 font-medium">
            {activeTab === 'active' ? '暂无未解决告警' : '暂无已解决告警记录'}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {activeTab === 'active' ? '所有页面运行正常' : ''}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedAlerts).map(([date, dayAlerts]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <div className="text-sm font-semibold text-gray-800">{date}</div>
                <div className="flex-1 h-px bg-gray-200"></div>
                <div className="text-sm text-gray-500">{dayAlerts.length} 条告警</div>
              </div>
              <div className="space-y-3">
                {dayAlerts.map(alert => {
                  const sevConfig = getSeverityConfig(alert.severity)
                  return (
                    <div
                      key={alert.id}
                      className={`bg-white rounded-xl shadow-sm border border-gray-200 border-l-4 ${sevConfig.borderClass} overflow-hidden`}
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium text-gray-900">{alert.title}</h3>
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${sevConfig.bgClass} ${sevConfig.textClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${sevConfig.dotClass}`}></span>
                                {sevConfig.label}
                              </span>
                              {alert.is_resolved === 1 && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  已解决
                                </span>
                              )}
                            </div>
                            <div
                              className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer mt-1 inline-block"
                              onClick={() => navigate(`/url/${alert.url_id}`)}
                            >
                              {alert.url_name}
                            </div>
                            {alert.description && (
                              <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg p-3">
                                {alert.description}
                              </p>
                            )}
                            {alert.suggestion && (
                              <div className="mt-3 bg-blue-50 rounded-lg p-3 border border-blue-100">
                                <div className="text-xs font-semibold text-blue-800 mb-1 flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                                  建议处理方案
                                </div>
                                <p className="text-sm text-blue-700 whitespace-pre-wrap">{alert.suggestion}</p>
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 flex flex-col items-end gap-2">
                            <span className="text-xs text-gray-400">
                              {dayjs(alert.created_at).format('HH:mm:ss')}
                            </span>
                            {alert.is_resolved === 0 && (
                              <button
                                onClick={() => handleResolve(alert.id)}
                                disabled={resolvingId === alert.id}
                                className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-50 whitespace-nowrap"
                              >
                                {resolvingId === alert.id ? '处理中...' : '标记解决'}
                              </button>
                            )}
                            {alert.is_resolved === 1 && alert.resolved_at && (
                              <span className="text-xs text-gray-400">
                                解决于 {dayjs(alert.resolved_at).format('HH:mm')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
