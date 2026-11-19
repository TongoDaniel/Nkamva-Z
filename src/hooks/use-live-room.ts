"use client";

import * as React from "react";
import {
  ConnectionQuality,
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

/**
 * Le sujet des signaux de salle, sur le canal de données LiveKit.
 *
 * Le salon et les mains levées restent écrits en base, et lus par la vue
 * serveur : rien ne change à ce qui fait foi. Mais cette vue n'était relue que
 * toutes les dix à quinze secondes, et un message mettait ce temps-là à
 * apparaître chez les autres. Qui écrit ou lève la main envoie désormais un
 * signal vide sur ce sujet ; qui le reçoit relit la vue tout de suite. Le
 * rafraîchissement périodique reste, en filet : un signal perdu coûte dix
 * secondes, pas un message.
 */
const ROOM_SIGNAL_TOPIC = "nk.salle";

/** Ce qu'un écouteur de sujet reçoit : le message, et qui l'a envoyé. */
export type RoomDataHandler = (
  payload: unknown,
  from: { identity: string; name: string } | null,
) => void;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/** Les périphériques choisis au test d'avant-séance (`nk/device-check.tsx`). */
export const MIC_DEVICE_KEY = "nk.live.micro";
export const CAM_DEVICE_KEY = "nk.live.camera";

function storedDevice(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
}

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
  /**
   * Ce **navigateur** sait-il capturer un écran ? `getDisplayMedia` n'existe pas
   * sur les navigateurs mobiles (iOS Safari, Chrome Android) : aucun jeton ni
   * aucune autorisation serveur ne peut l'y faire apparaître. L'UI s'en sert
   * pour expliquer l'indisponibilité plutôt que d'offrir un bouton sans effet.
   * Distinct de `canShareScreen`, qui est la permission *serveur*.
   */
  screenShareSupported: boolean;
  /** Ce navigateur partage-t-il son écran en ce moment ? */
  screenEnabled: boolean;
  setMic: (on: boolean) => Promise<void>;
  setCam: (on: boolean) => Promise<void>;
  setScreen: (on: boolean) => Promise<void>;
  /**
   * La connexion est tombée et se rétablit seule. Les pistes reviennent d'elles-
   * mêmes : l'écran n'a qu'à le dire, pour qu'une image figée ne passe pas pour
   * une panne du site.
   */
  reconnecting: boolean;
  /** Le réseau de **ce** participant est-il trop faible pour tenir l'image ? */
  weakNetwork: boolean;
  /**
   * Prévient les autres qu'il y a du nouveau à lire dans la salle (un message,
   * une main levée). Sans effet hors d'une salle connectée.
   */
  signal: () => void;
  /**
   * Envoie un message éphémère à toute la salle, sur un sujet. Rien n'est
   * écrit en base : c'est le canal des réactions et du sondage éclair
   * (`nk/live-interactions.tsx`). Sans effet hors d'une salle connectée.
   */
  send: (topic: string, payload: unknown) => void;
  /**
   * Écoute un sujet. Le gestionnaire reçoit le message décodé et son auteur ;
   * la fonction rendue cesse l'écoute.
   */
  subscribe: (topic: string, handler: RoomDataHandler) => () => void;
  /** Les micros et caméras de cet appareil, connus une fois l'accès accordé. */
  devices: { micros: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] };
  /** Le micro et la caméra en service, par identifiant de périphérique. */
  activeDevices: { micro: string | null; camera: string | null };
  /** Change de micro ou de caméra **sans quitter la salle**. */
  switchDevice: (kind: "audioinput" | "videoinput", deviceId: string) => Promise<void>;
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
  /** Appelé quand un autre participant signale du nouveau (`signal`). */
  onSignal?: () => void,
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
  const listeners = React.useRef(new Map<string, Set<RoomDataHandler>>());
  const refreshDevicesRef = React.useRef<(() => Promise<void>) | null>(null);
  const [devices, setDevices] = React.useState<{ micros: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] }>({
    micros: [],
    cameras: [],
  });
  const [activeDevices, setActiveDevices] = React.useState<{ micro: string | null; camera: string | null }>({
    micro: null,
    camera: null,
  });
  const [reconnecting, setReconnecting] = React.useState(false);
  const [weakNetwork, setWeakNetwork] = React.useState(false);
  // Lu au moment où le signal arrive : la fonction change à chaque rendu, et
  // elle ne doit pas reconstruire la salle.
  const onSignalRef = React.useRef(onSignal);
  React.useEffect(() => {
    onSignalRef.current = onSignal;
  }, [onSignal]);
  // Capacité du navigateur à capturer un écran. Posée dans un effet (et non à
  // l'initialisation) pour rester identique au rendu serveur — `navigator` n'y
  // existe pas — et éviter une divergence d'hydratation. Sur mobile, elle reste
  // `false` : `getDisplayMedia` n'y est jamais exposé.
  const [screenShareSupported, setScreenShareSupported] = React.useState(false);
  React.useEffect(() => {
    setScreenShareSupported(
      typeof navigator !== 'undefined' &&
        typeof navigator.mediaDevices?.getDisplayMedia === 'function',
    );
  }, []);

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

    // Le micro et la caméra retenus au test d'avant-séance : sans eux, le
    // navigateur prend son périphérique par défaut, qui n'est pas toujours
    // celui qu'on vient d'essayer.
    const micro = storedDevice(MIC_DEVICE_KEY);
    const camera = storedDevice(CAM_DEVICE_KEY);
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      ...(micro ? { audioCaptureDefaults: { deviceId: micro } } : {}),
      ...(camera ? { videoCaptureDefaults: { deviceId: camera } } : {}),
    });
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

    const readActiveDevices = () => {
      setActiveDevices({
        micro: room.getActiveDevice("audioinput") ?? null,
        camera: room.getActiveDevice("videoinput") ?? null,
      });
    };
    // Les noms des périphériques ne sont lisibles qu'une fois l'accès accordé :
    // la liste se relit donc aussi après l'ouverture du micro ou de la caméra.
    const refreshDevices = async () => {
      try {
        const [micros, cameras] = await Promise.all([
          Room.getLocalDevices("audioinput", false),
          Room.getLocalDevices("videoinput", false),
        ]);
        if (!alive) return;
        setDevices({
          micros: micros.filter((d) => d.deviceId && d.label),
          cameras: cameras.filter((d) => d.deviceId && d.label),
        });
        readActiveDevices();
      } catch {
        // Navigateur sans énumération : le menu restera vide, rien de plus.
      }
    };
    refreshDevicesRef.current = refreshDevices;

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
      // Une coupure de réseau n'est pas un départ : LiveKit rétablit la
      // connexion seul, et l'écran le dit pendant ce temps.
      .on(RoomEvent.Reconnecting, () => {
        if (alive) setReconnecting(true);
      })
      .on(RoomEvent.SignalReconnecting, () => {
        if (alive) setReconnecting(true);
      })
      .on(RoomEvent.Reconnected, () => {
        if (!alive) return;
        setReconnecting(false);
        snapshot();
        // Ce qui s'est dit pendant la coupure n'a pas été signalé ici.
        onSignalRef.current?.();
      })
      .on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality, p: Participant) => {
        if (!alive || p !== room.localParticipant) return;
        setWeakNetwork(quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost);
      })
      .on(RoomEvent.DataReceived, (payload, from, _kind, topic) => {
        if (!alive || !topic) return;
        if (topic === ROOM_SIGNAL_TOPIC) {
          onSignalRef.current?.();
          return;
        }
        const handlers = listeners.current.get(topic);
        if (!handlers || handlers.size === 0) return;
        let message: unknown;
        try {
          message = JSON.parse(decoder.decode(payload));
        } catch {
          // Un message illisible ne vient pas de cet écran : on l'ignore.
          return;
        }
        const author = from ? { identity: from.identity, name: from.name || from.identity } : null;
        for (const handler of handlers) handler(message, author);
      })
      // Un casque branché ou débranché pendant la séance : la liste suit.
      .on(RoomEvent.MediaDevicesChanged, () => {
        if (alive) void refreshDevices();
      })
      .on(RoomEvent.ActiveDeviceChanged, () => {
        if (alive) readActiveDevices();
      })
      .on(RoomEvent.Disconnected, () => {
        if (!alive) return;
        setConnected(false);
        setReconnecting(false);
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

  const send = React.useCallback((topic: string, payload: unknown) => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") return;
    void room.localParticipant
      .publishData(encoder.encode(JSON.stringify(payload)), { reliable: true, topic })
      .catch(() => {
        // Perdu : ces messages sont éphémères, et l'écran le sait.
      });
  }, []);

  const subscribe = React.useCallback((topic: string, handler: RoomDataHandler) => {
    const map = listeners.current;
    if (!map.has(topic)) map.set(topic, new Set());
    map.get(topic)!.add(handler);
    return () => {
      map.get(topic)?.delete(handler);
    };
  }, []);

  const switchDevice = React.useCallback(
    async (kind: "audioinput" | "videoinput", deviceId: string) => {
      const room = roomRef.current;
      if (!room) return;
      try {
        await room.switchActiveDevice(kind, deviceId);
        // Retenu pour la prochaine séance, comme au test d'avant-séance.
        try {
          window.localStorage.setItem(kind === "audioinput" ? MIC_DEVICE_KEY : CAM_DEVICE_KEY, deviceId);
        } catch {
          // Sans stockage, le choix ne vaut que pour cette séance.
        }
        setDeviceError(null);
      } catch {
        setDeviceError(
          kind === "audioinput"
            ? "Ce micro n'a pas pu être activé. Vérifiez qu'il est branché."
            : "Cette caméra n'a pas pu être activée. Vérifiez qu'une autre application ne l'utilise pas.",
        );
      }
      setActiveDevices({
        micro: room.getActiveDevice("audioinput") ?? null,
        camera: room.getActiveDevice("videoinput") ?? null,
      });
    },
    [],
  );

  const signal = React.useCallback(() => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") return;
    // Un octet suffit : le signal ne porte rien, il dit seulement « relisez ».
    void room.localParticipant
      .publishData(new Uint8Array([1]), { reliable: true, topic: ROOM_SIGNAL_TOPIC })
      .catch(() => {
        // Perdu : le rafraîchissement périodique rattrapera.
      });
  }, []);

  const setMic = React.useCallback(async (on: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(on);
      setDeviceError(null);
      if (on) void refreshDevicesRef.current?.();
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
      if (on) void refreshDevicesRef.current?.();
    } catch (err) {
      setDeviceError(messageDePeripherique(err, 'caméra'));
    }
    setCamEnabled(room.localParticipant.isCameraEnabled);
  }, []);

  /**
   * Arbitrage 144 — le partage d'écran, rendu robuste sur tous les navigateurs.
   *
   * Trois réalités à absorber pour que « ça marche partout » :
   *
   *   1. **Mobile** (iOS Safari, Chrome Android) : `getDisplayMedia` n'existe pas.
   *      On le dit clairement au lieu de laisser le bouton échouer.
   *   2. **Firefox / Safari desktop** : la capture vidéo marche, mais l'**audio**
   *      d'écran n'est pas supporté. Demander `{audio:true}` peut faire échouer
   *      TOUT le partage. On tente donc avec l'audio, et on **réessaie sans** si
   *      ça casse : mieux vaut un écran sans son que pas d'écran du tout.
   *   3. **Chrome / Edge desktop** : tout marche, audio compris — le premier essai
   *      suffit.
   *
   * Les refus se distinguent : fenêtre non choisie / capture bloquée par le
   * système (`NotAllowedError`), API absente, ou refus serveur (ne devrait pas
   * arriver, le bouton n'apparaît qu'autorisé).
   */
  const setScreen = React.useCallback(async (on: boolean) => {
    const room = roomRef.current;
    if (!room) return;

    // Arrêter ne dépend d'aucune capacité : on coupe et on sort.
    if (!on) {
      try { await room.localParticipant.setScreenShareEnabled(false); } catch { /* déjà coupé */ }
      setScreenEnabled(room.localParticipant.isScreenShareEnabled);
      return;
    }

    if (!screenShareSupported) {
      setDeviceError(
        "Le partage d'écran n'est pas disponible depuis ce navigateur. Sur téléphone, aucun navigateur ne le permet : rejoignez le direct depuis un ordinateur pour présenter.",
      );
      return;
    }

    try {
      // Premier essai, audio compris (Chrome/Edge).
      await room.localParticipant.setScreenShareEnabled(true, { audio: true });
      setDeviceError(null);
    } catch (err) {
      const nom = err instanceof Error ? err.name : '';
      // L'utilisateur a fermé le sélecteur ou refusé : inutile de réessayer.
      if (nom === 'NotAllowedError') {
        setDeviceError("Le partage d'écran a été refusé, ou la fenêtre n'a pas été choisie.");
        setScreenEnabled(room.localParticipant.isScreenShareEnabled);
        return;
      }
      // Sinon, l'audio d'écran est le suspect le plus courant (Firefox/Safari) :
      // on retente sans lui.
      try {
        await room.localParticipant.setScreenShareEnabled(true, { audio: false });
        setDeviceError(null);
      } catch (err2) {
        const nom2 = err2 instanceof Error ? err2.name : '';
        setDeviceError(
          nom2 === 'NotAllowedError'
            ? "Le partage d'écran a été refusé, ou la fenêtre n'a pas été choisie."
            : "L'écran n'a pas pu être partagé sur ce navigateur. Essayez un autre navigateur, ou depuis un ordinateur.",
        );
      }
    }
    setScreenEnabled(room.localParticipant.isScreenShareEnabled);
  }, [screenShareSupported]);

  return {
    connected,
    connecting,
    error,
    tiles,
    activeSpeaker,
    micEnabled,
    camEnabled,
    screenEnabled,
    screenShareSupported,
    canPublish,
    canShareScreen,
    setMic,
    setCam,
    setScreen,
    reconnecting,
    weakNetwork,
    signal,
    send,
    subscribe,
    devices,
    activeDevices,
    switchDevice,
    deviceError,
  };
}
