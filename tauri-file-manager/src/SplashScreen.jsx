import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

export default function SplashScreen({ onFinish }) {
  const [isVisible, setIsVisible] = useState(true)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const duration = 2500
    const startTime = Date.now()

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const newProgress = Math.min((elapsed / duration) * 100, 100)
      setProgress(newProgress)

      if (newProgress >= 100) {
        clearInterval(interval)
        setTimeout(() => setIsVisible(false), 200)
      }
    }, 16)

    return () => clearInterval(interval)
  }, [])

  return (
    <AnimatePresence onExitComplete={() => onFinish?.()}>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          <motion.div
            className="relative flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-white/5 px-16 py-12 backdrop-blur-xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {/* Animated folder icon */}
            <motion.div
              initial={{ opacity: 0, filter: "blur(12px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="splashGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#007AFF" />
                    <stop offset="100%" stopColor="#5AC8FA" />
                  </linearGradient>
                </defs>

                {/* Folder body */}
                <path
                  d="M8 24C8 19.5817 11.5817 16 16 16H28L36 24H64C68.4183 24 72 27.5817 72 32V60C72 64.4183 68.4183 68 64 68H16C11.5817 68 8 64.4183 8 60V24Z"
                  fill="url(#splashGradient)"
                />

                {/* Folder top edge — animates up to "open" */}
                <motion.path
                  d="M8 24C8 19.5817 11.5817 16 16 16H28C29.0609 16 30.0783 16.4214 30.8284 17.1716L36 22.3431C36.7501 23.0933 37.7674 23.5147 38.8284 23.5147H64C68.4183 23.5147 72 27.0964 72 31.5147V32H8V24Z"
                  fill="url(#splashGradient)"
                  fillOpacity="0.85"
                  animate={{ y: [0, -7, -7, -7, 0] }}
                  transition={{ duration: 2.5, delay: 0.7, times: [0, 0.25, 0.5, 0.75, 1], ease: "easeInOut" }}
                />

                {/* Magnifying glass — slides out top-left then back in */}
                <motion.g
                  animate={{
                    x: [0, -10, -13, -10, 0],
                    y: [0, -22, -22, -22, 0],
                    opacity: [0, 1, 1, 1, 0],
                  }}
                  transition={{ duration: 2.5, delay: 0.9, times: [0, 0.28, 0.55, 0.75, 1], ease: "easeInOut" }}
                >
                  <circle cx="36" cy="46" r="9" stroke="white" strokeWidth="3" fill="none" />
                  <line x1="42.4" y1="52.4" x2="49" y2="59" stroke="white" strokeWidth="3" strokeLinecap="round" />
                </motion.g>

                {/* Pen — slides out top-right then back in */}
                <motion.g
                  animate={{
                    x: [0, 10, 13, 10, 0],
                    y: [0, -20, -20, -20, 0],
                    opacity: [0, 1, 1, 1, 0],
                    rotate: [0, 20, 25, 20, 0],
                  }}
                  style={{ originX: "50px", originY: "44px" }}
                  transition={{ duration: 2.5, delay: 0.9, times: [0, 0.28, 0.55, 0.75, 1], ease: "easeInOut" }}
                >
                  <rect x="46" y="32" width="9" height="22" rx="3" fill="white" />
                  <polygon points="46,54 55,54 50.5,63" fill="white" />
                  <rect x="47.5" y="29" width="6" height="4" rx="1" fill="#5AC8FA" />
                </motion.g>
              </svg>
            </motion.div>

            {/* App name */}
            <motion.h1
              className="text-4xl font-light tracking-widest text-white"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3, ease: "easeOut" }}
            >
              Finedr
            </motion.h1>

            {/* Tagline */}
            <motion.p
              className="text-sm tracking-wide text-zinc-500"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
            >
              Your files, reimagined.
            </motion.p>

            {/* Progress bar */}
            <motion.div
              className="mt-4 w-64"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.6 }}
            >
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <motion.div
                  className="h-full rounded-full bg-[#007AFF]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
