/**
 * useStudioCameras — Gerencia câmeras do Ecclesia Studio.
 *
 * Combina:
 *  1. Câmeras salvas no DB (nomes, tipos, configurações)
 *  2. Dispositivos de vídeo reais do navegador (WebRTC MediaDevices API)
 *  3. Estado de cada câmera (conectada, no ar, stream ativo)
 *
 * Limite: máximo de STUDIO_MAX_CAMERAS câmeras (padrão: 6)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const MAX_CAMERAS = Number(import.meta.env.VITE_STUDIO_MAX_CAMERAS ?? 6);

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type CameraType = "local" | "remote" | "obs_scene";
export type CameraStatus = "on_air" | "connected" | "waiting" | "disconnected";

export interface StudioCamera {
  id: string;
  name: string;
  cameraType: CameraType;
  deviceId?: string;
  sceneName?: string;
  remoteToken?: string;
  iconName: string;
  sortOrder: number;
  /** MediaStream ativo para câmeras locais */
  stream?: MediaStream;
  status: CameraStatus;
  isOnAir: boolean;
}

export interface BrowserDevice {
  deviceId: string;
  label: string;
}

interface UseStudioCamerasOptions {
  channelId: string | null;
  /** ID da sessão live ativa, para logar cortes */
  liveSessionId?: string | null;
  enabled?: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStudioCameras({ channelId, liveSessionId, enabled = true }: UseStudioCamerasOptions) {
  const [cameras, setCameras]               = useState<StudioCamera[]>([]);
  const [browserDevices, setBrowserDevices] = useState<BrowserDevice[]>([]);
  const [onAirCameraId, setOnAirCameraId]   = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [loading, setLoading]               = useState(false);

  const streamsRef  = useRef<Map<string, MediaStream>>(new Map());
  const startedAt   = useRef<Date | null>(null);

  // ── 1. Enumerar dispositivos do navegador ────────────────────────────────

  const enumerateDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Câmera ${i + 1}`,
        }));
      setBrowserDevices(videoDevices);
      return videoDevices;
    } catch {
      return [];
    }
  }, []);

  // ── 2. Solicitar permissão de câmera ────────────────────────────────────

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionGranted(true);
      await enumerateDevices();
      return true;
    } catch {
      setPermissionGranted(false);
      return false;
    }
  }, [enumerateDevices]);

  // ── 3. Carregar câmeras do DB ────────────────────────────────────────────

  const loadCameras = useCallback(async (devices: BrowserDevice[]) => {
    if (!channelId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_studio_cameras", { p_channel_id: channelId });
      if (error) { console.warn("[useStudioCameras] DB error:", error.message); }

      const dbCams = (data ?? []) as Array<{
        id: string; name: string; camera_type: string; device_id: string | null;
        scene_name: string | null; remote_token: string | null; icon_name: string; sort_order: number;
      }>;

      const mapped: StudioCamera[] = dbCams.slice(0, MAX_CAMERAS).map((c) => {
        const isConnected = c.camera_type === "local"
          ? devices.some((d) => d.deviceId === c.device_id)
          : c.camera_type === "obs_scene"
          ? true  // OBS scenes are always "available" if OBS is connected
          : false; // remote: waiting for phone to connect

        return {
          id:          c.id,
          name:        c.name,
          cameraType:  c.camera_type as CameraType,
          deviceId:    c.device_id ?? undefined,
          sceneName:   c.scene_name ?? undefined,
          remoteToken: c.remote_token ?? undefined,
          iconName:    c.icon_name ?? "video",
          sortOrder:   c.sort_order,
          status:      isConnected ? "connected" : c.camera_type === "remote" ? "waiting" : "disconnected",
          isOnAir:     false,
        };
      });

      // Se não há câmeras no DB, criar virtuais a partir dos dispositivos do browser
      if (mapped.length === 0 && devices.length > 0) {
        const virtual = devices.slice(0, MAX_CAMERAS).map((d, i) => ({
          id:          `virtual-${d.deviceId}`,
          name:        d.label,
          cameraType:  "local" as CameraType,
          deviceId:    d.deviceId,
          iconName:    "video",
          sortOrder:   i,
          status:      "connected" as CameraStatus,
          isOnAir:     false,
        }));
        setCameras(virtual);
      } else {
        setCameras(mapped);
      }
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  // ── 4. Inicializar ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !channelId) return;
    void (async () => {
      const devices = await enumerateDevices() ?? [];
      setPermissionGranted(devices.length > 0 && devices[0].label !== "");
      await loadCameras(devices);
    })();
  }, [channelId, enabled, enumerateDevices, loadCameras]);

  // ── 5. Adquirir stream de câmera local ───────────────────────────────────

  const acquireStream = useCallback(async (cameraId: string): Promise<MediaStream | null> => {
    const cam = cameras.find((c) => c.id === cameraId);
    if (!cam || cam.cameraType !== "local" || !cam.deviceId) return null;

    if (streamsRef.current.has(cameraId)) return streamsRef.current.get(cameraId)!;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: cam.deviceId }, width: 1280, height: 720 },
        audio: false,
      });
      streamsRef.current.set(cameraId, stream);
      setCameras((prev) => prev.map((c) =>
        c.id === cameraId ? { ...c, stream, status: "connected" } : c,
      ));
      return stream;
    } catch {
      setCameras((prev) => prev.map((c) =>
        c.id === cameraId ? { ...c, status: "disconnected" } : c,
      ));
      return null;
    }
  }, [cameras]);

  // ── 6. Liberar stream ────────────────────────────────────────────────────

  const releaseStream = useCallback((cameraId: string) => {
    const stream = streamsRef.current.get(cameraId);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamsRef.current.delete(cameraId);
    }
    setCameras((prev) => prev.map((c) =>
      c.id === cameraId ? { ...c, stream: undefined } : c,
    ));
  }, []);

  // ── 7. Corte ao vivo ─────────────────────────────────────────────────────

  const cutTo = useCallback(async (cameraId: string) => {
    const cam = cameras.find((c) => c.id === cameraId);
    if (!cam) return;

    setOnAirCameraId(cameraId);
    setCameras((prev) => prev.map((c) => ({
      ...c,
      isOnAir: c.id === cameraId,
      status:  c.id === cameraId ? "on_air" : c.status === "on_air" ? "connected" : c.status,
    })));

    // Adquirir stream se ainda não tiver
    if (cam.cameraType === "local" && !cam.stream) {
      await acquireStream(cameraId);
    }

    // Logar o corte no DB (não bloqueia a UI)
    if (liveSessionId) {
      const elapsed = startedAt.current
        ? Math.floor((Date.now() - startedAt.current.getTime()) / 1000)
        : 0;
      void supabase.rpc("log_camera_cut", {
        p_session_id:      liveSessionId,
        p_camera_id:       cameraId.startsWith("virtual-") ? null : cameraId,
        p_camera_name:     cam.name,
        p_elapsed_seconds: elapsed,
      });
    }
  }, [cameras, liveSessionId, acquireStream]);

  // ── 8. Salvar câmera no DB ───────────────────────────────────────────────

  const saveCamera = useCallback(async (
    orgId: string,
    camera: Partial<StudioCamera> & { name: string; cameraType: CameraType },
  ): Promise<boolean> => {
    if (!channelId || cameras.length >= MAX_CAMERAS) return false;

    const payload = {
      organization_id: orgId,
      tv_channel_id:   channelId,
      name:            camera.name,
      camera_type:     camera.cameraType,
      device_id:       camera.deviceId ?? null,
      scene_name:      camera.sceneName ?? null,
      icon_name:       camera.iconName ?? "video",
      sort_order:      cameras.length,
    };

    const { data, error } = await supabase
      .from("tv_studio_cameras")
      .insert(payload)
      .select("id")
      .single();

    if (error) { console.warn("[saveCamera]", error.message); return false; }

    const devices = await enumerateDevices() ?? [];
    await loadCameras(devices);
    return !!data;
  }, [channelId, cameras.length, enumerateDevices, loadCameras]);

  // ── 9. Remover câmera ────────────────────────────────────────────────────

  const removeCamera = useCallback(async (cameraId: string): Promise<boolean> => {
    if (cameraId.startsWith("virtual-")) {
      setCameras((prev) => prev.filter((c) => c.id !== cameraId));
      return true;
    }
    releaseStream(cameraId);
    const { error } = await supabase
      .from("tv_studio_cameras")
      .update({ is_active: false })
      .eq("id", cameraId);
    if (!error) setCameras((prev) => prev.filter((c) => c.id !== cameraId));
    return !error;
  }, [releaseStream]);

  // ── 10. Cleanup ao desmontar ─────────────────────────────────────────────

  useEffect(() => {
    return () => {
      streamsRef.current.forEach((stream) => stream.getTracks().forEach((t) => t.stop()));
      streamsRef.current.clear();
    };
  }, []);

  // Câmeras realmente visíveis (conectadas ou no ar)
  const activeCameras = cameras.filter(
    (c) => c.status !== "disconnected" || c.cameraType !== "local",
  );
  const onAirCamera = cameras.find((c) => c.isOnAir) ?? null;

  function markSessionStart() { startedAt.current = new Date(); }

  return {
    cameras,
    activeCameras,
    onAirCamera,
    onAirCameraId,
    browserDevices,
    permissionGranted,
    loading,
    maxCameras: MAX_CAMERAS,
    cutTo,
    acquireStream,
    releaseStream,
    saveCamera,
    removeCamera,
    requestPermission,
    reloadCameras: async () => {
      const devices = await enumerateDevices() ?? [];
      await loadCameras(devices);
    },
    markSessionStart,
  };
}
