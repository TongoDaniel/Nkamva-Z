import { useEffect, useState } from 'react'
import { Alert, StyleSheet, Switch, View } from 'react-native'
import { router, usePreventRemove } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../lib/api'
import { keys, useProfile } from '../lib/queries'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { Card, Divider } from '../ui/Bits'
import { Bone } from '../ui/Skeleton'
import { colors } from '../ui/theme'
import type { Profile } from '../lib/types'

interface Draft {
  fullName: string
  preferredName: string
  phone: string
  bio: string
  relationalEmails: boolean
  subscriptionNoticeEmails: boolean
}

function toDraft(p: Profile): Draft {
  return {
    fullName: p.fullName ?? '',
    preferredName: p.preferredName ?? '',
    phone: p.phone ?? '',
    bio: p.bio ?? '',
    relationalEmails: p.relationalEmails ?? true,
    subscriptionNoticeEmails: p.subscriptionNoticeEmails ?? true,
  }
}

export default function Profil() {
  const profile = useProfile()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (profile.data && !draft) setDraft(toDraft(profile.data))
  }, [profile.data, draft])

  const save = useMutation({
    mutationFn: (d: Draft) =>
      api.patch<Profile>('me/profile', {
        fullName: d.fullName.trim(),
        preferredName: d.preferredName.trim() || null,
        phone: d.phone.trim() || null,
        bio: d.bio.trim() || null,
        relationalEmails: d.relationalEmails,
        subscriptionNoticeEmails: d.subscriptionNoticeEmails,
      }),
    onSuccess: (p) => {
      queryClient.setQueryData(keys.profile, p)
      // Le retour attend le rendu suivant, une fois la garde des
      // modifications levée.
      setSaved(true)
    },
    onError: (err) => {
      // Le serveur renvoie le champ fautif dans `details` ; à défaut, le message.
      setErrors({ form: err instanceof ApiError ? err.message : 'Enregistrement impossible.' })
    },
  })

  // Modifications non enregistrées : le retour (flèche, geste ou bouton
  // Android) demande confirmation, comme dans Contacts. Plus de bouton
  // « Annuler » en bas de page.
  const dirty = !saved && !leaving && !!profile.data && !!draft && JSON.stringify(toDraft(profile.data)) !== JSON.stringify(draft)
  usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('Abandonner les modifications ?', 'Tes changements ne seront pas enregistrés.', [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Abandonner', style: 'destructive', onPress: () => { setLeaving(true); repeat() } },
    ])
  })
  useEffect(() => { if (saved) router.back() }, [saved])

  if (!draft) {
    return (
      <Screen edges={['bottom']}>
        {[0, 1, 2, 3].map((i) => <Bone key={i} height={52} style={{ borderRadius: 14 }} />)}
      </Screen>
    )
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value })

  function submit() {
    if (!draft) return
    const next: Record<string, string> = {}
    if (draft.fullName.trim().split(/\s+/).length < 2) next.fullName = 'Indique ton prénom et ton nom.'
    if (draft.phone.trim() && !/^\+?[0-9 ]{6,20}$/.test(draft.phone.trim())) next.phone = 'Numéro au format international, par exemple +237 6 12 34 56 78.'
    setErrors(next)
    if (Object.keys(next).length) return
    save.mutate(draft)
  }

  return (
    <Screen keyboard edges={['bottom']}>
      <Field label="Prénom et nom" value={draft.fullName} onChangeText={(v) => set('fullName', v)} autoComplete="name" error={errors.fullName} />
      <Field
        label="Comment t’appeler"
        hint="Facultatif. Utilisé dans l’app et dans les e-mails à la place de ton prénom."
        value={draft.preferredName}
        onChangeText={(v) => set('preferredName', v)}
        maxLength={80}
      />
      <Field
        label="Téléphone"
        value={draft.phone}
        onChangeText={(v) => set('phone', v)}
        keyboardType="phone-pad"
        autoComplete="tel"
        placeholder="+237 6 12 34 56 78"
        error={errors.phone}
      />
      <Field
        label="Bio"
        value={draft.bio}
        onChangeText={(v) => set('bio', v)}
        multiline
        maxLength={1000}
        style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 14 }}
      />

      <View style={{ gap: 8 }}>
        <Text variant="label">E-mails</Text>
        <Card style={{ overflow: 'hidden' }}>
          <View style={styles.toggle}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" style={{ color: colors.ink }}>Messages et communautés</Text>
              <Text variant="caption">Nouveaux messages, membres, annonces.</Text>
            </View>
            <Switch
              value={draft.relationalEmails}
              onValueChange={(v) => set('relationalEmails', v)}
              trackColor={{ true: colors.brand, false: colors.line }}
              thumbColor="#fff"
            />
          </View>
          <Divider inset={16} />
          <View style={styles.toggle}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body" style={{ color: colors.ink }}>Rappels d’adhésion</Text>
              <Text variant="caption">Renouvellements et échéances de tes communautés.</Text>
            </View>
            <Switch
              value={draft.subscriptionNoticeEmails}
              onValueChange={(v) => set('subscriptionNoticeEmails', v)}
              trackColor={{ true: colors.brand, false: colors.line }}
              thumbColor="#fff"
            />
          </View>
        </Card>
        <Text variant="caption">Les e-mails de sécurité, de reçu et de facture partent toujours.</Text>
      </View>

      {errors.form ? <Text variant="small" style={{ color: colors.danger }}>{errors.form}</Text> : null}
      <Button label="Enregistrer" onPress={submit} loading={save.isPending} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
})
