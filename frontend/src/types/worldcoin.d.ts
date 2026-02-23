declare module "@worldcoin/minikit-js" {
  export const MiniKit: {
    isInstalled?: () => boolean;
    commandsAsync?: {
      verify?: (args: {
        action: string;
        signal: string;
        verification_level?: "device" | "orb";
      }) => Promise<unknown>;
    };
  };
}

declare module "@worldcoin/idkit" {
  export class IDKitSession {
    constructor(config: {
      app_id: string;
      action: string;
      signal: string;
      verification_level?: "device" | "orb";
    });
    start(): Promise<unknown>;
  }
}
