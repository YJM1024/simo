import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app'
import ComponentGallery from './gallery'

const root = document.getElementById('root')
if (!root) throw new Error('缺少 #root')
createRoot(root).render(<StrictMode>{location.hash === '#gallery' ? <ComponentGallery /> : <App />}</StrictMode>)
