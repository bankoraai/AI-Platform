import { PropsWithChildren } from 'react'
import { motion, useInView } from 'framer-motion'
import React from 'react'

type FadeInProps = PropsWithChildren<{ delay?: number; y?: number; duration?: number }>
export function FadeIn({ children, delay = 0, y = 16, duration = 0.6 }: FadeInProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration, ease: 'easeOut', delay }}
        >
            {children}
        </motion.div>
    )
}

type RevealProps = PropsWithChildren<{ delay?: number; y?: number; duration?: number; once?: boolean }>
export function Reveal({ children, delay = 0, y = 18, duration = 0.6, once = true }: RevealProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once, amount: 0.25 }}
            transition={{ duration, ease: 'easeOut', delay }}
        >
            {children}
        </motion.div>
    )
}

type HoverLiftProps = PropsWithChildren<{ lift?: number; scale?: number }>
export function HoverLift({ children, lift = 6, scale = 1.01 }: HoverLiftProps) {
    return (
        <motion.div
            whileHover={{ y: -lift, scale }}
            whileTap={{ scale: Math.max(0.98, scale - 0.02) }}
            transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            style={{ willChange: 'transform' }}
        >
            {children}
        </motion.div>
    )
}

export function Stagger({ children, delay = 0, step = 0.08 }: PropsWithChildren<{ delay?: number; step?: number }>) {
    const items = React.Children.toArray(children)
    return (
        <div>
            {items.map((child, idx) => (
                <FadeIn key={idx} delay={delay + idx * step}>{child as any}</FadeIn>
            ))}
        </div>
    )
}


