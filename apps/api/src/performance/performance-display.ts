/** Shared PF4 labels for baseline results and subsequent progress snapshots. */
export const performanceDriverName = (name: string) =>
  ({
    'Tecnico-tattica': 'Tecnico-tattico',
    'Preparazione atletica': 'Preparazione',
    'Allenamento mentale': 'Mental',
    Equipaggiamento: 'Attrezzatura',
    Fisioterapia: 'Biomeccanica',
  })[name] ?? name;
