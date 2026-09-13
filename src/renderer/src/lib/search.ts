// Arama için metni sadeleştirir: küçük harf, Türkçe karakterleri ve
// aksanları düz harfe çevirir ("Şahin" → "sahin", "IŞIK" → "isik").
export function fold(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
