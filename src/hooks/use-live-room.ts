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
export function useLiveRoom(serverUrl: string | null, token: string | null): LiveRoomState {
  const roomRef = React.useRef<Room | null>(null);
  const [connected, setConnected] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tiles, setTiles] = React.useState<LiveTile[]>([]);
  const [activeSpeaker, setActiveSpeaker] = React.useState<string | null>(null);
  const [micEnabled, setMicEnabled] = React.useState(false);
  const [camEnabled, setCamEnabled] = React.useState(false);
  const [canPublish, setCanPublish] = React.useState(false);

  React.useEffect(() => {
    if (!serverUrl || !token) return;

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
      .connect(serverUrl, token)
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
  }, [serverUrl, token]);

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
