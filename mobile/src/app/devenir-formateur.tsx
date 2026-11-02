import { useState } from 'react'
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from 'react-native'
import { router, Stack } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { CheckCircle2, Clock, FileText, IdCard, Video, XCircle } from 'lucide-react-native'
import { useProfile } from '../lib/queries'
import { useMode } from '../lib/mode'
import {
  DOCUMENTS, documentReady, uploadDocument, useMyApplication, useSaveApplication, useSubmitApplication,
  type ApplicationDocument, type DocumentType, type PickedFile, type TrainerApplication,
} from '../lib/trainer-application'
import { Screen } from '../ui/Screen'
import { Text } from '../ui/Text'
import { Button } from '../ui/Button'
import { Card, Divider, Progress } from '../ui/Bits'
import { Field } from '../ui/Field'
import { ErrorState } from '../ui/States'
import { Bone } from '../ui/Skeleton'
import { colors } from '../ui/theme'

const ICONS: Record<DocumentType, typeof IdCard> = { ID_CARD: IdCard, DIPLOMA: FileText, VIDEO: Video }

/**
 * Devenir formateur depuis l'app, sur le modèle du parcours hôte d'Airbnb :
 * une liste d'étapes qu'on coche une à une, qu'on peut quitter et reprendre.
 * Le profil, les trois pièces (photographiées ou filmées sur place) et l'envoi
 * se font ici ; l'abonnement, lui, ne s'affiche jamais dans l'app (règle 3.1.1
 * de l'App Store).
 */
export default function DevenirFormateur() {
  const application = useMyApplication()
  const profile = useProfile()

  if (application.isLoading) {
    return <Screen edges={['bottom']}><Bone height={28} width="70%" /><Bone height={90} /><Bone height={220} /></Screen>
  }
  if (application.isError) {
    return <ErrorState message={(application.error as Error).message} onRetry={() => application.refetch()} />
  }
  const a = application.data
  const isTrainer = !!profile.data?.isTrainer

  return (
    <Screen edges={['bottom']} keyboard>
      <Stack.Screen options={{ title: 'Devenir formateur' }} />
      {isTrainer ? <Opened />
        : !a || a.status === 'REJECTED' ? <Start previous={a} />
        : a.status === 'SUBMITTED' ? <Submitted />
        : a.status === 'APPROVED' ? <Approved />
        : <Draft application={a} />}
    </Screen>
  )
}

/** Premier écran : ce qu'on demande, puis le profil public. */
function Start({ previous }: { previous: TrainerApplication | null | undefined }) {
  return (
    <>
      <View style={{ gap: 6 }}>
        <Text variant="title">Partage ton savoir sur NKAMVA</Text>
        <Text variant="body">Vends tes ressources et anime ta communauté. Chaque formateur est validé par l’équipe NKAMVA avant de publier.</Text>
      </View>
      {previous?.finalRejectionReason ? (
        <Card style={styles.notice}>
          <View style={styles.row}><XCircle size={18} color={colors.danger} /><Text variant="bodyStrong">Ton précédent dossier n’a pas été retenu</Text></View>
          <Text variant="small">{previous.finalRejectionReason}</Text>
          <Text variant="small">Tu peux en ouvrir un nouveau.</Text>
        </Card>
      ) : null}
      <View style={{ gap: 10 }}>
        <Text variant="heading">Ce qu’il te faut</Text>
        {['Ton profil de formateur, tel que les apprenants le verront', 'Une pièce d’identité et un diplôme ou une attestation', 'Une courte vidéo où tu te présentes'].map((t, i) => (
          <View key={t} style={styles.row}>
            <View style={styles.num}><Text variant="label" style={{ fontSize: 13 }}>{i + 1}</Text></View>
            <Text variant="body" style={{ flex: 1 }}>{t}</Text>
          </View>
        ))}
      </View>
      <ProfileForm application={null} />
    </>
  )
}

/** Profil public : les champs de la candidature du site, mêmes bornes. */
function ProfileForm({ application, onDone }: { application: TrainerApplication | null; onDone?: () => void }) {
  const save = useSaveApplication(!!application)
  const [slogan, setSlogan] = useState(application?.slogan ?? '')
  const [domains, setDomains] = useState(application?.domains.join(', ') ?? '')
  const [years, setYears] = useState(application?.experienceYears != null ? String(application.experienceYears) : '')
  const [website, setWebsite] = useState(application?.websiteUrl ?? '')
  const [description, setDescription] = useState(application?.description ?? '')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    const n = years.trim() ? Number(years) : undefined
    if (n !== undefined && (!Number.isInteger(n) || n < 0 || n > 80)) return setError('Les années d’expérience vont de 0 à 80.')
    const list = domains.split(',').map((d) => d.trim()).filter(Boolean)
    if (list.length > 10) return setError('Dix domaines au plus.')
    save.mutate(
      {
        slogan: slogan.trim() || undefined,
        description: description.trim() || undefined,
        websiteUrl: website.trim() || undefined,
        domains: list,
        experienceYears: n,
      },
      { onSuccess: () => onDone?.(), onError: (e) => setError((e as Error).message) },
    )
  }

  return (
    <View style={{ gap: 14 }}>
      {application ? null : <Text variant="heading">Ton profil</Text>}
      <Field label="Ta phrase d’accroche" value={slogan} onChangeText={setSlogan} maxLength={200} placeholder="Ex. Comptabilité simple pour les PME" />
      <Field label="Tes domaines" value={domains} onChangeText={setDomains} placeholder="Séparés par des virgules" autoCapitalize="sentences" />
      <Field label="Années d’expérience" value={years} onChangeText={setYears} keyboardType="number-pad" maxLength={2} />
      <Field label="Site ou portfolio (facultatif)" value={website} onChangeText={setWebsite} keyboardType="url" autoCapitalize="none" placeholder="https://" />
      <Field label="Présente-toi" value={description} onChangeText={setDescription} multiline maxLength={5000} placeholder="Ton parcours, ce que tu enseignes, à qui." />
      {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : null}
      <Button label={application ? 'Enregistrer' : 'Commencer ma candidature'} loading={save.isPending} onPress={submit} />
    </View>
  )
}

/** Dossier ouvert : la liste des étapes, comme celle d'Airbnb pour les hôtes. */
function Draft({ application }: { application: TrainerApplication }) {
  const [editing, setEditing] = useState(false)
  const submit = useSubmitApplication()
  const byType = new Map(application.documents.map((d) => [d.type, d]))
  const ready = DOCUMENTS.every((d) => documentReady(byType.get(d.type)))
  const resubmission = application.status === 'RESUBMISSION_PENDING'

  function send() {
    submit.mutate(undefined, {
      onError: (e) => Alert.alert('Envoi impossible', (e as Error).message),
    })
  }

  return (
    <>
      <View style={{ gap: 6 }}>
        <Text variant="title">Ta candidature</Text>
        <Text variant="body">{resubmission ? 'L’équipe te demande de reprendre certaines pièces. Remplace celles qui sont signalées, puis renvoie ton dossier.' : 'Ton dossier est enregistré : tu peux le reprendre à tout moment.'}</Text>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="heading">1. Ton profil</Text>
        {editing ? (
          <ProfileForm application={application} onDone={() => setEditing(false)} />
        ) : (
          <Card style={styles.summary} onPress={() => setEditing(true)}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1}>{application.slogan || 'Sans phrase d’accroche'}</Text>
              <Text variant="caption" numberOfLines={1}>{application.domains.length ? application.domains.join(' · ') : 'Aucun domaine'}</Text>
            </View>
            <Text variant="label" style={{ color: colors.brand }}>Modifier</Text>
          </Card>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="heading">2. Tes pièces</Text>
        <Card style={{ overflow: 'hidden' }}>
          {DOCUMENTS.map((d, i) => (
            <View key={d.type}>
              {i > 0 ? <Divider inset={60} /> : null}
              <DocumentRow spec={d} doc={byType.get(d.type)} />
            </View>
          ))}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="heading">3. Envoie ton dossier</Text>
        <Text variant="small">{ready ? 'Tout est prêt. L’équipe NKAMVA l’examine, et tu es prévenu par une notification.' : 'Il reste des pièces à déposer.'}</Text>
        <Button label={resubmission ? 'Renvoyer mon dossier' : 'Envoyer mon dossier'} disabled={!ready} loading={submit.isPending} onPress={send} />
      </View>
    </>
  )
}

function statusOf(doc: ApplicationDocument | undefined): { text: string; tone: string; Icon?: typeof CheckCircle2 } {
  if (!doc || doc.status === 'AWAITING_UPLOAD') return { text: 'À déposer', tone: colors.ink3 }
  if (doc.status === 'REJECTED') return { text: doc.rejectionReason ? `À reprendre : ${doc.rejectionReason}` : 'À reprendre', tone: colors.danger, Icon: XCircle }
  if (doc.status === 'APPROVED') return { text: 'Validée', tone: colors.success, Icon: CheckCircle2 }
  return { text: 'Déposée', tone: colors.success, Icon: CheckCircle2 }
}

/** Ce que propose le téléphone pour chaque pièce : appareil photo, galerie, fichier. */
function chooseSource(type: DocumentType): Promise<'camera' | 'library' | 'file' | null> {
  const options: { key: 'camera' | 'library' | 'file'; label: string }[] = type === 'VIDEO'
    ? [{ key: 'camera', label: 'Filmer maintenant' }, { key: 'library', label: 'Choisir une vidéo' }]
    : [{ key: 'camera', label: 'Prendre une photo' }, { key: 'library', label: 'Choisir une photo' }, { key: 'file', label: 'Choisir un PDF' }]
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options.map((o) => o.label), 'Annuler'], cancelButtonIndex: options.length },
        (i) => resolve(options[i]?.key ?? null),
      )
    } else {
      Alert.alert('Ajouter la pièce', undefined, [
        ...options.map((o) => ({ text: o.label, onPress: () => resolve(o.key) })),
        { text: 'Annuler', style: 'cancel' as const, onPress: () => resolve(null) },
      ], { cancelable: true, onDismiss: () => resolve(null) })
    }
  })
}

async function pick(type: DocumentType, source: 'camera' | 'library' | 'file'): Promise<PickedFile | null> {
  if (source === 'file') {
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true })
    const f = res.canceled ? null : res.assets[0]
    return f ? { uri: f.uri, name: f.name, mimeType: f.mimeType ?? 'application/pdf', size: f.size ?? 0 } : null
  }
  const video = type === 'VIDEO'
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: video ? ['videos'] : ['images'], quality: 0.8, videoMaxDuration: 300 }
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Appareil photo refusé', 'Autorise l’appareil photo dans les réglages du téléphone, ou choisis un fichier existant.')
      return null
    }
  }
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
  const f = res.canceled ? null : res.assets[0]
  if (!f) return null
  return {
    uri: f.uri,
    name: f.fileName ?? (video ? 'presentation.mp4' : 'piece.jpg'),
    mimeType: f.mimeType ?? (video ? 'video/mp4' : 'image/jpeg'),
    size: f.fileSize ?? 0,
  }
}

function DocumentRow({ spec, doc }: { spec: (typeof DOCUMENTS)[number]; doc: ApplicationDocument | undefined }) {
  const { refetch } = useMyApplication(false)
  const [progress, setProgress] = useState<number | null>(null)
  const status = statusOf(doc)
  const Icon = ICONS[spec.type]
  const locked = doc?.status === 'APPROVED'

  async function add() {
    const source = await chooseSource(spec.type)
    if (!source) return
    const file = await pick(spec.type, source)
    if (!file) return
    // Les mêmes contrôles que le serveur, dits avant d'envoyer quoi que ce soit.
    if (!spec.mimes.includes(file.mimeType)) {
      return Alert.alert('Format refusé', spec.type === 'VIDEO' ? 'La vidéo doit être au format MP4.' : 'Une photo (JPEG, PNG, WebP) ou un PDF.')
    }
    if (!file.size || file.size > spec.maxBytes) {
      return Alert.alert('Fichier trop lourd', spec.hint)
    }
    setProgress(0)
    try {
      await uploadDocument(spec.type, file, setProgress)
      await refetch()
    } catch (e) {
      Alert.alert('Dépôt impossible', (e as Error).message)
    } finally {
      setProgress(null)
    }
  }

  return (
    <Pressable
      onPress={locked || progress !== null ? undefined : add}
      style={({ pressed }) => [styles.doc, pressed && !locked && { backgroundColor: colors.paper }]}
      accessibilityRole="button"
      accessibilityLabel={`${spec.label}, ${status.text}`}
    >
      <Icon size={22} color={colors.ink2} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="bodyStrong">{spec.label}</Text>
        {progress !== null ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Progress value={Math.round(progress * 100)} /></View>
            <Text variant="caption">{Math.round(progress * 100)} %</Text>
          </View>
        ) : (
          <View style={styles.row}>
            {status.Icon ? <status.Icon size={14} color={status.tone} /> : null}
            <Text variant="caption" style={{ color: status.tone, flexShrink: 1 }} numberOfLines={2}>
              {doc && doc.status !== 'AWAITING_UPLOAD' ? status.text : spec.hint}
            </Text>
          </View>
        )}
      </View>
      {locked || progress !== null ? null : (
        <Text variant="label" style={{ color: colors.brand }}>{documentReady(doc) ? 'Remplacer' : 'Ajouter'}</Text>
      )}
    </Pressable>
  )
}

function Submitted() {
  return (
    <View style={styles.center}>
      <Clock size={44} color={colors.ink3} strokeWidth={1.5} />
      <Text variant="title" style={styles.centerText}>Dossier envoyé</Text>
      <Text variant="body" style={styles.centerText}>L’équipe NKAMVA l’examine. Tu es prévenu par une notification dès qu’une décision est prise.</Text>
    </View>
  )
}

/**
 * Dossier validé, espace pas encore ouvert : il reste l'abonnement. L'app ne
 * le montre pas et n'y renvoie pas ; elle dit seulement où sont les étapes,
 * l'e-mail que le serveur envoie à l'approbation.
 */
function Approved() {
  return (
    <View style={styles.center}>
      <CheckCircle2 size={44} color={colors.success} strokeWidth={1.5} />
      <Text variant="title" style={styles.centerText}>Dossier validé</Text>
      <Text variant="body" style={styles.centerText}>Les étapes pour ouvrir ton espace formateur t’ont été envoyées par e-mail. Une fois ton espace ouvert, tu le retrouves ici.</Text>
    </View>
  )
}

function Opened() {
  const { setMode } = useMode()
  return (
    <View style={styles.center}>
      <CheckCircle2 size={44} color={colors.success} strokeWidth={1.5} />
      <Text variant="title" style={styles.centerText}>Ton espace formateur est ouvert</Text>
      <Text variant="body" style={styles.centerText}>Tableau de bord, ressources, lives et ventes : tout est dans le mode formateur.</Text>
      <Button label="Passer en mode formateur" onPress={() => { void setMode('trainer'); router.back() }} style={{ alignSelf: 'stretch', marginTop: 8 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  num: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  notice: { padding: 16, gap: 6 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  center: { alignItems: 'center', gap: 10, paddingTop: 40 },
  centerText: { textAlign: 'center' },
})

