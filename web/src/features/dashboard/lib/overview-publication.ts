const defaults = {
  overview_quickstart_enabled: true,
  overview_report_enabled: true,
  overview_distributions_enabled: true,
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function parseSiteModuleEnvelope(value: unknown) {
  const envelope: unknown =
    typeof value === 'string' ? JSON.parse(value.trim() || '{}') : (value ?? {})
  if (
    !object(envelope) ||
    (envelope.overview_panels != null && !object(envelope.overview_panels))
  ) {
    throw new TypeError('Invalid module settings')
  }
  return {
    envelope,
    flags: object(envelope.overview_panels) ? envelope.overview_panels : {},
  }
}

export function readOverviewPanels(value: unknown) {
  try {
    const { flags } = parseSiteModuleEnvelope(value)
    return {
      overview_quickstart_enabled: flags.overview_quickstart_enabled !== false,
      overview_report_enabled: flags.overview_report_enabled !== false,
      overview_distributions_enabled:
        flags.overview_distributions_enabled !== false,
    }
  } catch {
    return defaults
  }
}
