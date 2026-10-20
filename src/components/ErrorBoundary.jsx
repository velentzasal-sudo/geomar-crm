import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-slate-800 border border-red-800 rounded-2xl p-8 max-w-md text-center space-y-4">
            <p className="text-4xl">⚠️</p>
            <p className="text-white font-semibold text-lg">Κάτι πήγε στραβά</p>
            <p className="text-slate-400 text-sm font-mono break-all">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors"
            >
              Δοκίμασε ξανά
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
