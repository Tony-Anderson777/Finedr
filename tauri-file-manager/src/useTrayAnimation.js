import { useEffect } from 'react'
import { TrayIcon } from '@tauri-apps/api/tray'
import { Image as TauriImage } from '@tauri-apps/api/image'

const FRAMES = 30
const SIZE = 32

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

function generateSvgFrame(step) {
  let folderOpen = 0
  let itemsOut = 0
  let wiggle = 0

  // Phase: closed (0-5), opening (6-9), items out (10-14), wiggle (15-19), back in (20-24), closing (25-29)
  if (step >= 6 && step < 10) {
    folderOpen = easeInOut((step - 6) / 4)
  } else if (step >= 10 && step < 25) {
    folderOpen = 1
  } else if (step >= 25) {
    folderOpen = 1 - easeInOut((step - 25) / 5)
  }

  if (step >= 10 && step < 15) {
    itemsOut = easeInOut((step - 10) / 5)
  } else if (step >= 15 && step < 20) {
    itemsOut = 1
    wiggle = Math.sin(((step - 15) / 5) * Math.PI * 2) * 2.5
  } else if (step >= 20 && step < 25) {
    itemsOut = 1 - easeInOut((step - 20) / 5)
  }

  const gap = folderOpen * 3
  const mgOpacity = Math.min(1, itemsOut * 4).toFixed(2)
  const mgY = (19 - itemsOut * 12 + wiggle).toFixed(2)
  const mgX = (14 - itemsOut * 3).toFixed(2)
  const penX = (20 + itemsOut * 3).toFixed(2)
  const penY = (18 - itemsOut * 11 - wiggle).toFixed(2)
  const penRot = (itemsOut * 25).toFixed(1)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 32 32">
    <defs>
      <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#007AFF"/>
        <stop offset="100%" stop-color="#5AC8FA"/>
      </linearGradient>
    </defs>
    <rect x="4" y="${(11 + gap * 0.3).toFixed(2)}" width="24" height="${(16 - gap * 0.3).toFixed(2)}" rx="2" fill="url(#fg)"/>
    <path d="M4,${(11 + gap * 0.3).toFixed(2)} Q4,${(9 - gap).toFixed(2)} 6,${(9 - gap).toFixed(2)} L12,${(9 - gap).toFixed(2)} L14,${(11 + gap * 0.3).toFixed(2)} Z" fill="#007AFF"/>
    <g opacity="${mgOpacity}">
      <circle cx="${mgX}" cy="${mgY}" r="3.2" stroke="white" stroke-width="1.6" fill="none"/>
      <line x1="${(parseFloat(mgX) + 2.3).toFixed(2)}" y1="${(parseFloat(mgY) + 2.3).toFixed(2)}" x2="${(parseFloat(mgX) + 4.2).toFixed(2)}" y2="${(parseFloat(mgY) + 4.2).toFixed(2)}" stroke="white" stroke-width="1.6" stroke-linecap="round"/>
    </g>
    <g opacity="${mgOpacity}" transform="translate(${penX},${penY}) rotate(${penRot},0,0)">
      <rect x="-1.5" y="-5" width="3" height="8" rx="1.2" fill="white"/>
      <polygon points="-1.5,3 1.5,3 0,6.5" fill="white"/>
    </g>
  </svg>`
}

async function svgToTauriImage(svgString) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    const img = new window.Image()
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.drawImage(img, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(url)
      canvas.toBlob(async (pngBlob) => {
        try {
          const buffer = await pngBlob.arrayBuffer()
          const image = await TauriImage.fromBytes(buffer)
          resolve(image)
        } catch (e) {
          reject(e)
        }
      }, 'image/png')
    }
    img.onerror = reject
    img.src = url
  })
}

export function useTrayAnimation() {
  useEffect(() => {
    let frameInterval = null
    let isRunning = true

    async function start() {
      try {
        const frames = []
        for (let i = 0; i < FRAMES; i++) {
          const image = await svgToTauriImage(generateSvgFrame(i))
          frames.push(image)
        }

        if (!isRunning) return

        const tray = await TrayIcon.getById('main-tray')
        if (!tray) return

        let idx = 0
        frameInterval = setInterval(async () => {
          try {
            await tray.setIcon(frames[idx])
          } catch (_) {}
          idx = (idx + 1) % frames.length
        }, 80)
      } catch (e) {
        console.warn('Tray animation unavailable:', e)
      }
    }

    start()

    return () => {
      isRunning = false
      if (frameInterval) clearInterval(frameInterval)
    }
  }, [])
}
