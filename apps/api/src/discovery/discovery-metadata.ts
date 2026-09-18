import { BadRequestException } from '@nestjs/common';

/** Metadata is stored in the existing template optionsJson and managed by its admin API. */
export function assertDiscoveryMetadata(value: unknown, required: boolean) {
  const fail = (): never => {
    throw new BadRequestException('Metadati discovery non validi');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const m = value as Record<string, unknown>;
  if (
    ![
      'single_choice',
      'multi_choice',
      'number',
      'scale',
      'boolean',
      'date',
    ].includes(String(m.type))
  )
    return fail();
  if (
    m.target !== undefined &&
    (!['sportId', 'specializationId', 'goalId'].includes(
      typeof m.target === 'string' ? m.target : '',
    ) ||
      m.type !== 'single_choice' ||
      !required)
  )
    return fail();
  if (m.ui !== undefined) {
    if (!m.ui || typeof m.ui !== 'object' || Array.isArray(m.ui)) return fail();
    const ui = m.ui as Record<string, unknown>;
    if (
      ui.presentation !== undefined &&
      !['cards', 'compact_cards', 'scale'].includes(
        typeof ui.presentation === 'string' ? ui.presentation : '',
      )
    )
      return fail();
    if (ui.columns !== undefined && ![1, 2].includes(Number(ui.columns)))
      return fail();
    if (
      ui.unit !== undefined &&
      (typeof ui.unit !== 'string' || ui.unit.length > 30)
    )
      return fail();
  }
  if (
    m.contextKey !== undefined &&
    (typeof m.contextKey !== 'string' ||
      !/^[a-z][a-z0-9_]{0,99}$/.test(m.contextKey))
  )
    return fail();
  if (m.type === 'date') return;
  if (m.type === 'number' || m.type === 'scale') {
    if (
      typeof m.min !== 'number' ||
      typeof m.max !== 'number' ||
      !Number.isFinite(m.min) ||
      !Number.isFinite(m.max) ||
      m.max <= m.min
    )
      return fail();
    if (
      m.step !== undefined &&
      (typeof m.step !== 'number' || !Number.isFinite(m.step) || m.step <= 0)
    )
      return fail();
  } else if (
    !['sportId', 'specializationId'].includes(
      typeof m.target === 'string' ? m.target : '',
    )
  ) {
    if (
      !Array.isArray(m.options) ||
      !m.options.length ||
      m.options.length > 100
    )
      return fail();
    const ids = new Set<string>();
    for (const option of m.options as unknown[]) {
      if (!option || typeof option !== 'object') return fail();
      const o = option as Record<string, unknown>;
      if (
        typeof o.id !== 'string' ||
        !o.id ||
        o.id.length > 100 ||
        ids.has(o.id) ||
        typeof o.label !== 'string' ||
        !o.label ||
        o.label.length > 500
      )
        return fail();
      if (!['string', 'number', 'boolean'].includes(typeof o.value))
        return fail();
      if (
        o.description !== undefined &&
        (typeof o.description !== 'string' || o.description.length > 2000)
      )
        return fail();
      ids.add(o.id);
    }
    if (
      m.type === 'boolean' &&
      (m.options.length !== 2 ||
        ![true, false].every((v) =>
          (m.options as { value: unknown }[]).some((o) => o.value === v),
        ))
    )
      return fail();
  }
}
