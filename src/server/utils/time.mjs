export function nowIso() {
  return new Date().toISOString();
}

export function addMinutesIso(startIso, minutes) {
  return new Date(new Date(startIso).getTime() + minutes * 60_000).toISOString();
}
