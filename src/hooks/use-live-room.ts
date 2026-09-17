"use client";

import * as React from "react";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

/**
 * `TrackSource.SCREEN_SHARE` du protocole LiveKit, écrit ici plutôt qu'importé.
 *
 * L'énumération vit dans `@livekit/protocol`, que `livekit-client` tire sans
 * que le projet le déclare : l'importer nous rendrait dépendants d'un paquet
 * transitif, qu'une montée de version de `livekit-client` pourrait déplacer
 * sans prévenir. La valeur, elle, est figée par le protocole — c'est un numéro
 * de champ, pas un détail d'implémentation. Voir `publishableSources` côté
 * serveur, qui pose la même correspondance dans l'autre sens.
 */
const SCREEN_SHARE_SOURCE = 3;

export interface LiveTile {
  /** Clé de rendu : l'identité, suffixée pour la tuile d'écran d'une même personne. */
  key: string;
  /** L'identité LiveKit — c'est-à-dire l'identifiant de l'utilisateur. */
  identity: string;
  name: string;
  isLocal: boolean;
  speaking: boolean;
  /**
   * Arbitrage 144 — la caméra et l'écran partagé d'une même personne sont deux
   * tuiles, pas une tuile qui change de contenu. Les fondre ferait disparaître
   * le visage de qui présente au moment précis où l'on veut le voir.
   */
  kind: "camera" | "screen";
  /** Piste vidéo à attacher, s'il y en a une de publiée. */
  attach: ((el: HTMLVideoElement | null) => void) | null;
}

export interface LiveRoomState {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  tiles: LiveTile[];
  /** Qui parle en ce moment (arbitrage 37). Vide quand personne n'émet. */
  activeSpeaker: string | null;
  micEnabled: boolean;
  camEnabled: boolean;
  /** Le serveur a-t-il retiré le droit de publier ? C'est le verrou de l'animateur. */
  canPublish: boolean;
  /**
   * Arbitrage 144 — le serveur a-t-il ouvert la source « écran » ? Lu sur les
   * permissions du participant local et jamais sur un état React : c'est ce qui
   * rend l'autorisation non négociable depuis la console du navigateur.
   */
  canShareScreen: boolean;
  /** Ce navigateur partage-t-il son écran en ce moment ? */
  screenEnabled: boolean;
  setMic: (on: boolean) => Promise<void>;
  setCam: (on: boolean) => Promise<void>;
  setScreen: (on: boolean) => Promise<void>;
  /**
   * Pourquoi le micro ou la caméra n'ont pas pu s'ouvrir. Nul quand tout va
   * bien, et remis à nul dès qu'une tentative réussit.
   */
  deviceError: string | null;
}

/**
 * Ce que le navigateur refuse, dit en français.
 *
 * `setMicrophoneEnabled` **rejette** — permission refusée, aucun périphérique,
 * micro déjà pris par une autre application. Personne ne rattrapait ce rejet :
 * la promesse partait dans le vide, le bouton restait éteint, et l'écran ne
 * disait rien. La personne recliquait sans comprendre, ce qui est exactement le
 * scénario « le micro ne marche pas » qu'un test à deux participants aurait
 * révélé.
 */
function messageDePeripherique(err: unknown, quoi: 'micro' | 'caméra'): string {
  const nom = err instanceof Error ? err.name : ''
  if (nom === 'NotAllowedError' || nom === 'SecurityError') {
    return `Votre navigateur a refusé l'accès au ${quoi}. Autorisez-le dans la barre d'adresse, puis réessayez.`
  }
  if (nom === 'NotFoundError' || nom === 'OverconstrainedError') {
    return `Aucun ${quoi} détecté sur cet appareil.`
  }
  if (nom === 'NotReadableError' || nom === 'AbortError') {
    return `Votre ${quoi} est déjà utilisé par une autre application. Fermez-la, puis réessayez.`
  }
  return `Le ${quoi} n'a pas pu être activé. Réessayez.`
}

/**
 * Connexion à la salle temps réel.
 *
 * Tout ce qui relève du direct — pistes, locuteur actif, droit de publier — vit
 * ici et nulle part ailleurs : l'écran ne connaît que l'état rendu.
 *
 * Le **droit de publier** n'est pas décidé par le client : il vient des
 * permissions du jeton, que le serveur met à jour quand l'animateur pose ou lève
 * un verrou (arbitrages 35 et 41). D'où `canPublish` lu sur le participant local
 * plutôt que déduit d'un état React — sinon le verrou serait négociable depuis
 * la console du navigateur.
 */
export function useLiveRoom(
  serverUrl: string | null,
  token: string | null,
  /**
   * Identité **stable** de la salle — l'identifiant de la session.
   *
   * C'est elle qui commande la connexion, et non le jeton : `mintJoinToken`
   * forge un JWT neuf à chaque rendu serveur (il porte son `iat`), si bien que
   * la chaîne change à chaque `router.refresh()`. Les deux écrans en
   * déclenchent un toutes les dix à quinze secondes pour suivre les mains
   * levées : la salle était donc détruite et reconstruite en boucle, et **le
   * micro comme la caméra retombaient à chaque fois** — LiveKit ne republie pas
   * les pistes locales sur une nouvelle instance de `Room`.
   *
   * Rien n'est perdu à ignorer le jeton rafraîchi : les droits d'un participant
   * déjà connecté sont poussés par le serveur (`setParticipantCanPublish`), et
   * reçus ici par `ParticipantPermissionsChanged`.
   */
  roomKey: string | null,
): LiveRoomState {
  const roomRef = React.useRef<Room | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deviceError, setDeviceError] = React.useState<string | null>(null);
  const [tiles, setTiles] = React.useState<LiveTile[]>([]);
  const [activeSpeaker, setActiveSpeaker] = React.useState<string | null>(null);
  const [micEnabled, setMicEnabled] = React.useState(false);
  const [camEnabled, setCamEnabled] = React.useState(false);
  const [screenEnabled, setScreenEnabled] = React.useState(false);
  const [canPublish, setCanPublish] = React.useState(false);
  const [canShareScreen, setCanShareScreen] = React.useState(false);

  // Le jeton n'est lu qu'au moment de se connecter. Déclaré **avant** l'effet de
  // connexion : React exécute les effets dans l'ordre de déclaration, la
  // référence est donc à jour quand la connexion s'établit.
  const tokenRef = React.useRef(token);
  React.useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  React.useEffect(() => {
    const joinToken = tokenRef.current;
    if (!serverUrl || !roomKey || !joinToken) return;

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    let alive = true;

    const snapshot = () => {
      if (!alive) return;
      const all: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];

      const attacherOf = (source: Track.Source, p: Participant) => {
        const track = p.getTrackPublication(source)?.track;
        return track
          ? (el: HTMLVideoElement | null) => {
              if (el) track.attach(el);
              else track.detach();
            }
          : null;
      };

      const next: LiveTile[] = [];
      for (const p of all) {
        const base = {
          identity: p.identity,
          name: p.name || p.identity,
          isLocal: p === room.localParticipant,
          speaking: p.isSpeaking,
        };
        next.push({ ...base, key: p.identity, kind: "camera", attach: attacherOf(Track.Source.Camera, p) });
        // La tuile d'écran n'existe que tant que la piste est publiée : elle
        // disparaît d'elle-même à l'arrêt du partage, sans qu'aucun écran ait à
        // suivre un état « quelqu'un présente-t-il ? ».
        const screen = attacherOf(Track.Source.ScreenShare, p);
        if (screen) {
          next.push({ ...base, key: `${p.identity}:ecran`, kind: "screen", speaking: false, attach: screen });
        }
      }
      setTiles(next);

      const permissions = room.localParticipant.permissions;
      setCanPublish(permissions?.canPublish ?? false);
      // `canPublishSources` est vide quand le serveur n'a rien restreint : dans
      // ce cas `canPublish` fait foi, et tout est publiable. Ne lire que la
      // liste ferait passer une salle sans restriction pour une salle fermée.
      const sources = permissions?.canPublishSources ?? [];
      setCanShareScreen(
        (permissions?.canPublish ?? false) &&
          (sources.length === 0 || sources.includes(SCREEN_SHARE_SOURCE)),
      );
      setMicEnabled(room.localParticipant.isMicrophoneEnabled);
      setCamEnabled(room.localParticipant.isCameraEnabled);
      setScreenEnabled(room.localParticipant.isScreenShareEnabled);
    };

    const onSpeakers = (speakers: Participant[]) => {
      if (!alive) return;
      setActiveSpeaker(speakers[0]?.name || speakers[0]?.identity || null);
      snapshot();
    };

    room
      .on(RoomEvent.ParticipantConnected, snapshot)
      .on(RoomEvent.ParticipantDisconnected, snapshot)
      .on(RoomEvent.TrackSubscribed, (_t: RemoteTrack, _p: RemoteTrackPublication) => snapshot())
      .on(RoomEvent.TrackUnsubscribed, snapshot)
      .on(RoomEvent.LocalTrackPublished, snapshot)
      .on(RoomEvent.LocalTrackUnpublished, snapshot)
      .on(RoomEvent.ActiveSpeakersChanged, onSpeakers)
      // Le verrou de l'animateur arrive par là : le serveur révoque `canPublish`
      // et le client doit s'y plier immédiatement, pas au prochain rendu.
      .on(RoomEvent.ParticipantPermissionsChanged, snapshot)
      .on(RoomEvent.Disconnected, () => {
        if (alive) setConnected(false);
      });

    setConnecting(true);
    room
      .connect(serverUrl, joinToken)
      .then(() => {
        if (!alive) return;
        setConnected(true);
        snapshot();
      })
      .catch((err: unknown) => {
        if (alive) setError(String(err));
      })
      .finally(() => {
        if (alive) setConnecting(false);
      });

    return () => {
      alive = false;
      void room.disconnect();
      roomRef.current = null;
    };
    // `token` est volontairement absent des dépendances — voir `roomKey`.
  }, [serverUrl, roomKey]);

  const setMic = React.useCallback(async (on: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(on);
      setDeviceError(null);
    } catch (err) {
      setDeviceError(messageDePeripherique(err, 'micro'));
    }
    // L'état se relit sur la salle, jamais sur ce qu'on a demandé : un refus
    // laissait le bouton allumé sur une piste qui n'existe pas.
    setMicEnabled(room.localParticipant.isMicrophoneEnabled);
  }, []);

  const setCam = React.useCallback(async (on: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(on);
      setDeviceError(null);
    } catch (err) {
      setDeviceError(messageDePeripherique(err, 'caméra'));
    }
    setCamEnabled(room.localParticipant.isCameraEnabled);
  }, []);

  /**
   * Arbitrage 144 — le partage d'écran, une fois le serveur d'accord.
   *
   * Deux refus se ressemblent et ne se disent pas pareil : le navigateur qui
   * n'obtient pas la fenêtre (la personne a fermé le sélecteur, ou le système
   * interdit la capture), et le serveur qui n'a pas ouvert la source. Le second
   * ne devrait pas se produire — le bouton n'apparaît qu'autorisé — mais s'il
   * arrive, il vaut mieux le dire que laisser un bouton sans effet.
   */
  const setScreen = React.useCallback(async (on: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(on, { audio: true });
      setDeviceError(null);
    } catch (err) {
      const nom = err instanceof Error ? err.name : '';
      setDeviceError(
        nom === 'NotAllowedError'
          ? "Le partage d'écran a été refusé, ou la fenêtre n'a pas été choisie."
          : "L'écran n'a pas pu être partagé. Réessayez.",
      );
    }
    setScreenEnabled(room.localParticipant.isScreenShareEnabled);
  }, []);

  return {
    connected,
    connecting,
    error,
    tiles,
    activeSpeaker,
    micEnabled,
    camEnabled,
    screenEnabled,
    canPublish,
    canShareScreen,
    setMic,
    setCam,
    setScreen,
    deviceError,
  };
}
