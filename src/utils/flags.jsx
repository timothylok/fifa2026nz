import 'flag-icons/css/flag-icons.min.css'

export const FLAGS = {
  Argentina: '🇦🇷', France: '🇫🇷', Brazil: '🇧🇷', Spain: '🇪🇸', Portugal: '🇵🇹',
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Germany: '🇩🇪', Netherlands: '🇳🇱', Belgium: '🇧🇪', Croatia: '🇭🇷',
  Uruguay: '🇺🇾', Japan: '🇯🇵', Morocco: '🇲🇦', Colombia: '🇨🇴', Senegal: '🇸🇳',
  Mexico: '🇲🇽', USA: '🇺🇸', Switzerland: '🇨🇭', Austria: '🇦🇹', Ecuador: '🇪🇨',
  Australia: '🇦🇺', Algeria: '🇩🇿', Egypt: '🇪🇬', Canada: '🇨🇦', 'Saudi Arabia': '🇸🇦',
  Ghana: '🇬🇭', Qatar: '🇶🇦', Iraq: '🇮🇶', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Paraguay: '🇵🇾',
  Jordan: '🇯🇴', 'New Zealand': '🇳🇿', Panama: '🇵🇦', Sweden: '🇸🇪', Tunisia: '🇹🇳',
  'South Africa': '🇿🇦', Norway: '🇳🇴', 'Korea Republic': '🇰🇷', 'Türkiye': '🇹🇷',
  'IR Iran': '🇮🇷', 'Congo DR': '🇨🇩', 'Bosnia and Herzegovina': '🇧🇦', 'Czechia': '🇨🇿',
  "Côte d'Ivoire": '🇨🇮', 'Curaçao': '🇨🇼', 'Cabo Verde': '🇨🇻', 'Haiti': '🇭🇹',
  'Uzbekistan': '🇺🇿',
}

// ISO 3166-1 alpha-2 codes for flag-icons CSS library
const ISO = {
  Argentina: 'ar', France: 'fr', Brazil: 'br', Spain: 'es', Portugal: 'pt',
  England: 'gb-eng', Germany: 'de', Netherlands: 'nl', Belgium: 'be', Croatia: 'hr',
  Uruguay: 'uy', Japan: 'jp', Morocco: 'ma', Colombia: 'co', Senegal: 'sn',
  Mexico: 'mx', USA: 'us', Switzerland: 'ch', Austria: 'at', Ecuador: 'ec',
  Australia: 'au', Algeria: 'dz', Egypt: 'eg', Canada: 'ca', 'Saudi Arabia': 'sa',
  Ghana: 'gh', Qatar: 'qa', Iraq: 'iq', Scotland: 'gb-sct', Paraguay: 'py',
  Jordan: 'jo', 'New Zealand': 'nz', Panama: 'pa', Sweden: 'se', Tunisia: 'tn',
  'South Africa': 'za', Norway: 'no', 'Korea Republic': 'kr', 'Türkiye': 'tr',
  'IR Iran': 'ir', 'Congo DR': 'cd', 'Bosnia and Herzegovina': 'ba', 'Czechia': 'cz',
  "Côte d'Ivoire": 'ci', 'Curaçao': 'cw', 'Cabo Verde': 'cv', 'Haiti': 'ht',
  'Uzbekistan': 'uz',
}

// Emoji fallback — used for plain-text contexts (e.g. clipboard share)
export const flag = name => FLAGS[name] ?? '🏳️'

// SVG flag via flag-icons — use this in JSX
export function FlagIcon({ name }) {
  const code = ISO[name]
  if (!code) return <span>🏳️</span>
  return (
    <span
      className={`fi fi-${code}`}
      style={{ width: '1.33em', height: '1em', display: 'inline-block', verticalAlign: 'text-bottom' }}
    />
  )
}
