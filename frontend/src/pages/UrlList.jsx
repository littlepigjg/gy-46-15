import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { getUrls, addUrl, deleteUrl, triggerScreenshot, getDashboardSummary, getAlerts } from '../api.js'

const FREQUENCY_LABELS = {
  hourly: '每小时',
  daily: '每天',
  weekly: '每周',
  monthly: '每月'
}

const HEALTH_STATUS_CONFIG = {
  healthy: {
    label: '健康',
    bgClass: 'bg-green-100',
    textClass: 'text-green-800',
    borderClass: 'border-green-200',
    dotClass: 'bg-green-500'
  },
  warning: {
    label: '警告',
    bgClass: 'bg-yellow-100',
    textClass: 'text-yellow-800',
    borderClass: 'border-yellow-200',
    dotClass: 'bg-yellow-500'
  },
  critical: {
    label: '严重异常',
    bgClass: 'bg-red-100',
    textClass: 'text-red-800',
    borderClass: 'border-red-200',
    dotClass: 'bg-red-500'
  }
}

function getHealthConfig(status) {
  return HEALTH_STATUS_CONFIG[status] || HEALTH_STATUS_CONFIG.healthy
}

function ScoreRing({ score }) {
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(100, score || 0)) / 100
  const strokeDashoffset = circumference * (1 - progress)

  let strokeColor = '#10b981'
  if (score < 50) strokeColor = '#ef4444'
  else if (score < 80) strokeColor = '#f59e0b'

  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      <svg className="transform -rotate-90 w-12 h-12">
        <circle
          cx="24"
          cy="24"
          r={radius}
          stroke="#e5e7eb"
          strokeWidth="4"
          fill="none"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          stroke={strokeColor}
          strokeWidth="4"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </svg>
      <span className={`absolute text-xs font-bold ${score < 50 ? 'text-red-600' : score < 80 ? 'text-yellow-600' : 'text-green-600'}`}>
        {score != null ? score : '-'}
      </span>
    </div>
  )
}

export default function UrlList() {
  const [urls, setUrls] = useState([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ url: '', name: '', frequency: 'daily' })
  const [loading, setLoading] = useState(false)
  const [screenshottingId, setScreenshottingId] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [recentAlerts, setRecentAlerts] = useState([])
  const navigate = useNavigate()

  const loadData = async () => {
    try {
      const [urlsRes, dashboardRes, alertsRes] = await Promise.all([
        getUrls(),
        getDashboardSummary(),
        getAlerts(false, 3)
      ])
      setUrls(urlsRes.data)
      setDashboard(dashboardRes.data)
      setRecentAlerts(alertsRes.data)
    } catch (err) {
      console.error('加载失败:', err)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.url || !formData.name) {
      alert('请填写完整信息')
      return
    }
    setLoading(true)
    try {
      await addUrl(formData)
      setShowAddForm(false)
      setFormData({ url: '', name: '', frequency: 'daily' })
      loadData()
    } catch (err) {
      alert('添加失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`确定删除 "${name}" 及其所有截图和健康记录吗？`)) return
    try {
      await deleteUrl(id)
      loadData()
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  const handleScreenshot = async (id) => {
    setScreenshottingId(id)
    try {
      await triggerScreenshot(id)
      loadData()
      alert('截图与健康检查完成')
    } catch (err) {
      alert('截图失败: ' + (err.response?.data?.error || err.message))
      loadData()
    } finally {
      setScreenshottingId(null)
    }
  }

  return (
    <div>
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">监控URL总数</div>
            <div className="text-2xl font-bold text-gray-900">{dashboard.total_urls}</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">平均健康分数</div>
            <div className={`text-2xl font-bold ${
              dashboard.avg_health_score == null ? 'text-gray-400' :
              dashboard.avg_health_score < 50 ? 'text-red-600' :
              dashboard.avg_health_score < 80 ? 'text-yellow-600' : 'text-green-600'
            }`}>
              {dashboard.avg_health_score != null ? dashboard.avg_health_score : '-'}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-2">健康状态分布</div>
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="text-sm font-medium text-gray-700">{dashboard.health_status_counts.healthy}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="text-sm font-medium text-gray-700">{dashboard.health_status_counts.warning}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="text-sm font-medium text-gray-700">{dashboard.health_status_counts.critical}</span>
              </div>
            </div>
          </div>
          <div
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer hover:border-red-300 transition-colors"
            onClick={() => navigate('/alerts')}
          >
            <div className="text-sm text-gray-500 mb-1">活跃告警</div>
            <div className={`text-2xl font-bold ${dashboard.active_alerts > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {dashboard.active_alerts}
            </div>
          </div>
        </div>
      )}

      {recentAlerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              最近告警
            </h3>
            <button
              onClick={() => navigate('/alerts')}
              className="text-xs text-red-600 hover:text-red-800 underline"
            >
              查看全部
            </button>
          </div>
          <div className="space-y-2">
            {recentAlerts.map(alert => (
              <div
                key={alert.id}
                className="bg-white rounded-lg p-3 border border-red-100 cursor-pointer hover:border-red-300"
                onClick={() => navigate(`/url/${alert.url_id}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{alert.url_name}</div>
                    <div className="text-xs text-gray-600 mt-0.5">{alert.title}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    alert.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {alert.severity === 'high' ? '高危' : '中危'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800">监控URL列表</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + 添加URL
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-800 mb-4">添加新URL</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="例如: 百度首页"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">检查频率</label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hourly">每小时</option>
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '添加中...' : '添加'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {urls.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
            暂无监控URL，点击右上角添加
          </div>
        ) : (
          urls.map((item) => {
            const healthConfig = getHealthConfig(item.last_health_status)
            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl shadow-sm border-2 p-5 hover:shadow-md transition-all ${healthConfig.borderClass}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 cursor-pointer" onClick={() => navigate(`/url/${item.id}`)}>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <ScoreRing score={item.last_health_score} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-medium text-gray-900 hover:text-blue-600">
                            {item.name}
                          </h3>
                          {item.last_health_status && (
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${healthConfig.bgClass} ${healthConfig.textClass}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${healthConfig.dotClass}`}></span>
                              {healthConfig.label}
                            </span>
                          )}
                          {item.active_alert_count > 0 && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              {item.active_alert_count} 个告警
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1 truncate">{item.url}</p>
                        {item.last_error_summary && (
                          <p className="text-xs text-red-600 mt-1 bg-red-50 rounded px-2 py-1 inline-block">
                            {item.last_error_summary}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {FREQUENCY_LABELS[item.frequency]}
                          </span>
                          <span className="text-gray-500">
                            截图数: <span className="font-medium text-gray-700">{item.screenshot_count}</span>
                          </span>
                          {item.last_screenshot_at && (
                            <span className="text-gray-500">
                              上次检查: {dayjs(item.last_health_check_at || item.last_screenshot_at).format('YYYY-MM-DD HH:mm')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4 flex-shrink-0">
                    <button
                      onClick={() => handleScreenshot(item.id)}
                      disabled={screenshottingId === item.id}
                      className="bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-100 disabled:opacity-50 whitespace-nowrap"
                    >
                      {screenshottingId === item.id ? '检查中...' : '立即检查'}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.name)}
                      className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg text-sm hover:bg-red-100 whitespace-nowrap"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
