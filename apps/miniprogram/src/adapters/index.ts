export * from "./types";
export * from "./storage";
export * from "./audio";
export * from "./audio-cache";
export * from "./audio-url";
export * from "./file-storage";
export * from "./network";
export * from "./auth";
export * from "./api";

import { MiniProgramRepository, UniStorageAdapter } from "./storage";
import { UniAudioPlayer } from "./audio";
import { UniAudioCache } from "./audio-cache";
import { UniNetworkAdapter } from "./network";
import { UniAuthAdapter } from "./auth";
import { MiniProgramApiClient } from "./api";
import { MiniProgramAuthService } from "../services/auth-service";
import { MiniSyncCoordinator } from "../services/sync-coordinator";
import { defaultPrivacyConsent } from "../services/privacy-consent";

export const defaultStorage = new UniStorageAdapter();
export const defaultRepository = new MiniProgramRepository(defaultStorage);
export const defaultAudioCache = new UniAudioCache({ storage: defaultStorage });
export const defaultAudio = new UniAudioPlayer();
export const defaultNetwork = new UniNetworkAdapter("https://kotobud.com");
export const defaultAuth = new UniAuthAdapter(defaultStorage);
export const defaultApi = new MiniProgramApiClient("https://kotobud.com", defaultNetwork);
export const defaultAuthService = new MiniProgramAuthService(defaultAuth, defaultApi, defaultPrivacyConsent);
export const defaultSyncCoordinator = new MiniSyncCoordinator(defaultRepository, defaultAuthService, defaultApi, defaultPrivacyConsent);
