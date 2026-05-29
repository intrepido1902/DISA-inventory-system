export function formatColombianDate(
  timestamp: number | string,
  includeTime = true,
): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(includeTime && { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
  return new Date(Number(timestamp)).toLocaleString('es-CO', options);
}
