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

export interface LiveTile {
  identity: string;
  name: string;
  isLocal: boolean;
  speaking: boolean;
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
  setMic: (on: boolean) => Promise<void>;
  setCam: (on: boolean) => Promise<void>;
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
  const [tiles, setTiles] = React.useState<LiveTile[]>([]);
  const [activeSpeaker, setActiveSpeaker] = React.useState<string | null>(null);
  const [micEnabled, setMicEnabled] = React.useState(false);
  const [camEnabled, setCamEnabled] = React.useState(false);
  const [canPublish, setCanPublish] = React.useState(false);

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
      setTiles(
        all.map((p) => {
          const publication = p.getTrackPublication(Track.Source.Camera);
          const track = publication?.track;
          return {
            identity: p.identity,
            name: p.name || p.identity,
            isLocal: p === room.localParticipant,
            speaking: p.isSpeaking,
            attach: track
              ? (el: HTMLVideoElement | null) => {
                  if (el) track.attach(el);
                  else track.detach();
                }
              : null,
          };
        }),
      );
      setCanPublish(room.localParticipant.permissions?.canPublish ?? false);
      setMicEnabled(room.localParticipant.isMicrophoneEnabled);
      setCamEnabled(room.localParticipant.isCameraEnabled);
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
    await room.localParticipant.setMicrophoneEnabled(on);
    setMicEnabled(room.localParticipant.isMicrophoneEnabled);
  }, []);

  const setCam = React.useCallback(async (on: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setCameraEnabled(on);
    setCamEnabled(room.localParticipant.isCameraEnabled);
  }, []);

  return {
    connected,
    connecting,
    error,
    tiles,
    activeSpeaker,
    micEnabled,
    camEnabled,
    canPublish,
    setMic,
    setCam,
  };
}
