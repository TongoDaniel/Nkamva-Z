import { Linking } from 'react-native'
import { router } from 'expo-router'
import { API_URL } from './config'

/**
 * Ouvre un lien du site (celui d'une notification, par exemple) dans l'écran
 * de l'app qui lui correspond. Ce que l'app n'a pas encore (litiges, factures,
 * espace formateur, candidature) s'ouvre sur le site, dans le navigateur.
 */
export function openSiteLink(link: string | null | undefined) {
  if (!link) return
  const [path] = link.split(/[?#]/)
  const parts = path.split('/').filter(Boolean)
  const [head, slug] = parts

  switch (head) {
    case 'accueil':
      return router.navigate('/')
    case 'mes-lives':
      return router.push('/lives')
    case 'mes-communautes':
    case 'communautes':
      return slug
        ? router.push({ pathname: '/communaute/[slug]', params: { slug } })
        : router.push('/communautes')
    case 'messagerie':
      return router.navigate('/messages')
    case 'mes-achats':
    case 'mes-ressources':
      return router.navigate('/bibliotheque')
    case 'ressources':
      if (slug) return router.push({ pathname: '/ressource/[slug]', params: { slug } })
      return router.navigate('/explorer')
    case 'profil':
      return router.push('/profil')
    case 'notifications':
      return
    default:
      void Linking.openURL(`${API_URL}${link.startsWith('/') ? link : `/${link}`}`)
  }
}
