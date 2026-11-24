import { Fragment, useId, useState } from 'react'

import type { CreationPreset } from './presets'

const palettes = {
  image: ['#eadfd3', '#c6a385', '#5f4a3a'],
  video: ['#dcc8b0', '#8b6a4e', '#2a2019'],
  chat: ['#e6e2db', '#a8a096', '#47423c'],
  audio: ['#dedad5', '#8d8680', '#24201d'],
}

export function SceneArt({
  scene,
}: {
  scene: Pick<CreationPreset, 'id' | 'mode' | 'cover_url'>
}) {
  const id = useId()
  const [failedCover, setFailedCover] = useState<string>()
  if (scene.cover_url && failedCover !== scene.cover_url) {
    return (
      <img
        src={scene.cover_url}
        alt=''
        referrerPolicy='no-referrer'
        loading='lazy'
        decoding='async'
        onError={() => setFailedCover(scene.cover_url)}
      />
    )
  }
  const [start, middle, end] = palettes[scene.mode]
  return (
    <svg
      viewBox='0 0 320 136'
      preserveAspectRatio='xMidYMid slice'
      aria-hidden='true'
    >
      <defs>
        <linearGradient id={id} x1='0' y1='0' x2='1' y2='1'>
          <stop offset='0' stopColor={start} />
          <stop offset='.55' stopColor={middle} />
          <stop offset='1' stopColor={end} />
        </linearGradient>
      </defs>
      <rect width='320' height='136' fill={`url(#${id})`} />
      <circle cx='292' cy='6' r='64' fill='none' stroke='#ffffff33' />
      <circle cx='292' cy='6' r='104' fill='none' stroke='#ffffff1f' />
      {scene.mode === 'video' && (
        <>
          <rect
            x='96'
            y='30'
            width='128'
            height='76'
            rx='10'
            fill='#ffffff24'
            stroke='#ffffffb3'
            strokeWidth='1.2'
          />
          {Array.from({ length: 8 }, (_, index) => (
            <Fragment key={index}>
              <rect
                x={104 + index * 15}
                y='36'
                width='7'
                height='5'
                rx='1.5'
                fill='#ffffff8c'
              />
              <rect
                x={104 + index * 15}
                y='95'
                width='7'
                height='5'
                rx='1.5'
                fill='#ffffff8c'
              />
            </Fragment>
          ))}
          <circle cx='160' cy='68' r='14' fill='#ffffffeb' />
          <path d='M155.5 60.5 167.5 68 155.5 75.5Z' fill={end} />
        </>
      )}
      {scene.mode === 'image' && (
        <>
          <rect
            x='112'
            y='22'
            width='104'
            height='80'
            rx='10'
            fill='#ffffff1a'
            stroke='#ffffff73'
            transform='rotate(-6 164 62)'
          />
          <rect
            x='104'
            y='28'
            width='112'
            height='82'
            rx='10'
            fill='#ffffff29'
            stroke='#ffffffbf'
            strokeWidth='1.2'
          />
          <circle cx='188' cy='50' r='8' fill='#ffffffe0' />
          <path d='M112 104 144 70 164 90 178 78 208 104Z' fill='#ffffff9e' />
        </>
      )}
      {scene.mode === 'audio' &&
        Array.from({ length: 24 }, (_, index) => {
          const height =
            8 + Math.abs(Math.sin(index * 0.82 + scene.id.length)) * 44
          return (
            <rect
              key={index}
              x={88 + index * 6.2}
              y={68 - height / 2}
              width='3'
              height={height}
              rx='1.5'
              fill='#ffffffd1'
            />
          )
        })}
    </svg>
  )
}
