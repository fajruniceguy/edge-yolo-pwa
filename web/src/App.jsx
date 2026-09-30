import { useRef, useState } from 'react'
import { compressImage } from './compressImage'
import { analyzeImage } from './api'
import './App.css'

const STATUS = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  DONE: 'done',
  ERROR: 'error',
}

export default function App() {
  const fileInputRef = useRef(null)
  const [status, setStatus] = useState(STATUS.IDLE)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [items, setItems] = useState([])
  const [errorMessage, setErrorMessage] = useState('')

  const handlePickPhoto = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setPreviewUrl(URL.createObjectURL(file))
    setItems([])
    setErrorMessage('')
    setStatus(STATUS.UPLOADING)

    try {
      const compressed = await compressImage(file)
      const result = await analyzeImage(compressed)
      setItems(result.items)
      setStatus(STATUS.DONE)
    } catch (err) {
      setErrorMessage(err.message || 'Terjadi kesalahan')
      setStatus(STATUS.ERROR)
    }
  }

  const handleRetake = () => {
    setPreviewUrl(null)
    setItems([])
    setErrorMessage('')
    setStatus(STATUS.IDLE)
  }

  return (
    <div className="screen">
      <h1 className="title">Penghitung Stok</h1>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        hidden
      />

      {!previewUrl && (
        <button className="btn-primary" onClick={handlePickPhoto}>
          📷 Foto Rak
        </button>
      )}

      {previewUrl && (
        <>
          <img src={previewUrl} alt="Foto rak" className="preview" />

          {status === STATUS.UPLOADING && (
            <p className="status status-loading">Menganalisis foto...</p>
          )}

          {status === STATUS.ERROR && (
            <p className="status status-error">{errorMessage}</p>
          )}

          {status === STATUS.DONE && (
            <ul className="items">
              {items.map((item) => (
                <li
                  key={item.label}
                  className={
                    item.needs_review ? 'item item-review' : 'item'
                  }
                >
                  <div className="item-label">{item.label}</div>
                  <div className="item-count">{item.count}</div>
                  <div className="item-confidence">
                    {Math.round(item.confidence * 100)}%
                  </div>
                  {item.needs_review && (
                    <div className="item-badge">Perlu Dicek</div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button className="btn-secondary" onClick={handleRetake}>
            Foto Ulang
          </button>
        </>
      )}
    </div>
  )
}
