/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createFileRoute } from '@tanstack/react-router'

import { Main } from '@/components/layout'
import { PresetWorkspace } from '@/features/creation/preset-workspace'
import { BrandFooter } from '@/features/magirouter-home/components/brand-footer'
import { Playground } from '@/features/playground'
import { playgroundSearchSchema } from '@/features/playground/lib/workspace-search'

export const Route = createFileRoute('/_authenticated/playground/')({
  validateSearch: playgroundSearchSchema,
  component: PlaygroundPage,
})

function PlaygroundPage() {
  const { mode, model, preset, scene, group, editPreset } = Route.useSearch()
  const presetId = preset ?? scene
  return (
    <Main className='console-document-page pg-document-page overflow-visible'>
      {presetId ? (
        <PresetWorkspace id={presetId} group={group} />
      ) : (
        <Playground
          key={JSON.stringify([mode, model, editPreset])}
          editPreset={editPreset}
          initialMode={mode}
          initialModel={model}
        />
      )}
      <BrandFooter />
    </Main>
  )
}
