export * from "./types";
export * from "./storage";
export * from "./audio";
export * from "./audio-url";
export * from "./file-storage";
export * from "./network";
export * from "./auth";
export * from "./api";

import { MiniProgramRepository, UniStorageAdapter } from "./storage";
import { UniAudioPlayer } from "./audio";
import { UniNetworkAdapter } from "./network";
import { UniAuthAdapter } from "./auth";
import { MiniProgramApiClient } from "./api";
import { MiniProgramAuthService } from "../services/auth-service";
import { MiniSyncCoordinator } from "../services/sync-coordinator";

export const defaultStorage = new UniStorageAdapter();
export const defaultRepository = new MiniProgramRepository(defaultStorage);
export const defaultAudio = new UniAudioPlayer();
export const defaultNetwork = new UniNetworkAdapter("https://kotobud.com");
export const defaultAuth = new UniAuthAdapter(defaultStorage);
export const defaultApi = new MiniProgramApiClient("https://kotobud.com", defaultNetwork);
export const defaultAuthService = new MiniProgramAuthService(defaultAuth, defaultApi);
export const defaultSyncCoordinator = new MiniSyncCoordinator(defaultRepository, defaultAuthService, defaultApi);
