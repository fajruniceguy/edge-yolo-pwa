const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function analyzeImage(imageBlob) {
  const formData = new FormData()
  formData.append('image', imageBlob, 'shelf.jpg')

  const response = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Analisis gagal (${response.status})`)
  }

  return response.json()
}
