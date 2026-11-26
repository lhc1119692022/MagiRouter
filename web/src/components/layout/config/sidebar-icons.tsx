import type { ReactNode, SVGProps } from 'react'

function glyph(shapes: ReactNode) {
  return (props: SVGProps<SVGSVGElement>) => {
    return (
      <svg
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.75'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
        focusable='false'
        {...props}
      >
        {shapes}
      </svg>
    )
  }
}

const channel = glyph(
  <>
    <path d='M4.9 19.1C1 15.2 1 8.8 4.9 4.9' />
    <path d='M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5' />
    <circle cx='12' cy='12' r='2' />
    <path d='M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5' />
    <path d='M19.1 4.9C23 8.8 23 15.1 19.1 19' />
  </>
)

export const sidebarIcons = {
  home: glyph(
    <>
      <path d='M3 10.5 12 3l9 7.5' />
      <path d='M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5' />
      <path d='M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6' />
    </>
  ),
  console: glyph(<path d='M22 12h-4l-3 9L9 3l-3 9H2' />),
  models: glyph(
    <>
      <rect x='3' y='3' width='7' height='7' rx='1.5' />
      <rect x='14' y='3' width='7' height='7' rx='1.5' />
      <rect x='14' y='14' width='7' height='7' rx='1.5' />
      <rect x='3' y='14' width='7' height='7' rx='1.5' />
    </>
  ),
  keys: glyph(
    <>
      <circle cx='7.5' cy='15.5' r='4.5' />
      <path d='m21 2-9.6 9.6' />
      <path d='m15.5 7.5 3 3L22 7l-3-3' />
    </>
  ),
  channels: channel,
  'task-logs': glyph(
    <>
      <rect x='3' y='5' width='6' height='6' rx='1' />
      <path d='m3 17 2 2 4-4' />
      <path d='M13 6h8' />
      <path d='M13 12h8' />
      <path d='M13 18h8' />
    </>
  ),
  'llm-logs': glyph(
    <>
      <path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
      <path d='M14 2v6h6' />
      <path d='M16 13H8' />
      <path d='M16 17H8' />
    </>
  ),
  audit: glyph(
    <>
      <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
      <path d='m9 12 2 2 4-4' />
    </>
  ),
  chat: glyph(
    <path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' />
  ),
  billing: glyph(
    <>
      <path d='M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1' />
      <path d='M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' />
    </>
  ),
  activity: glyph(
    <>
      <rect x='3' y='8' width='18' height='4' rx='1' />
      <path d='M12 8v13' />
      <path d='M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7' />
      <path d='M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5' />
    </>
  ),
  account: glyph(
    <>
      <path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' />
      <circle cx='12' cy='7' r='4' />
    </>
  ),
  security: glyph(<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />),
  support: glyph(
    <>
      <circle cx='12' cy='12' r='10' />
      <path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' />
      <path d='M12 17h.01' />
    </>
  ),
  docs: glyph(
    <path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20' />
  ),
  'admin-channels': channel,
  'admin-users': glyph(
    <>
      <path d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' />
      <circle cx='9' cy='7' r='4' />
      <path d='M22 21v-2a4 4 0 0 0-3-3.87' />
      <path d='M16 3.13a4 4 0 0 1 0 7.75' />
    </>
  ),
  'admin-models-sort': glyph(
    <>
      <path d='M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z' />
      <path d='m3.3 7 8.7 5 8.7-5' />
      <path d='M12 22V12' />
    </>
  ),
  'admin-ops': glyph(
    <>
      <rect x='2' y='3' width='20' height='7' rx='2' />
      <rect x='2' y='14' width='20' height='7' rx='2' />
      <line x1='6' y1='6.5' x2='6.01' y2='6.5' />
      <line x1='6' y1='17.5' x2='6.01' y2='17.5' />
    </>
  ),
  'admin-profit': glyph(
    <>
      <path d='M3 3v18h18' />
      <path d='m19 9-5 5-4-4-3 3' />
      <path d='M16 9h3v3' />
    </>
  ),
  'admin-media-traffic': glyph(
    <>
      <path d='M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' />
      <path d='M12 12v5' />
      <path d='m9.5 14.5 2.5-2.5 2.5 2.5' />
    </>
  ),
  'admin-settings': glyph(
    <>
      <circle cx='12' cy='12' r='3' />
      <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' />
    </>
  ),
}
