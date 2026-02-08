import { Routes, Route, Navigate } from 'react-router-dom'
import { useBookStatus } from './hooks/useBook'
import BookPicker from './pages/BookPicker'
import Dashboard from './pages/Dashboard'
import Ledger from './pages/Ledger'
import Payees from './pages/Payees'
import Categories from './pages/Categories'
import Reports from './pages/Reports'
import Search from './pages/Search'
import BudgetPage from './pages/BudgetPage'
import Layout from './components/Layout'

function App() {
  const { data: bookStatus, isLoading } = useBookStatus()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-content-secondary">Loading...</div>
      </div>
    )
  }

  // If no book is open, show book picker
  if (!bookStatus?.is_open) {
    return <BookPicker />
  }

  return (
    <Layout bookName={bookStatus.name || 'Budget'}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/search" element={<Search />} />
        <Route path="/accounts/:accountId" element={<Ledger />} />
        <Route path="/payees" element={<Payees />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
