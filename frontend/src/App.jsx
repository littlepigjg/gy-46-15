import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom'
import UrlList from './pages/UrlList.jsx'
import ScreenshotTimeline from './pages/ScreenshotTimeline.jsx'
import AlertsPage from './pages/AlertsPage.jsx'

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">
                网页截图归档与健康监控系统
              </h1>
              <nav className="flex gap-2">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  URL监控
                </NavLink>
                <NavLink
                  to="/alerts"
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-red-100 text-red-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  告警中心
                </NavLink>
              </nav>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<UrlList />} />
            <Route path="/url/:id" element={<ScreenshotTimeline />} />
            <Route path="/alerts" element={<AlertsPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
