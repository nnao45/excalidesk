import { Electroview } from "electrobun/view";
import type { AppRPC } from "../../bun/rpc";

// Singleton RPC instance for communicating with the Bun main process.
// Handlers for messages from the main process can be added here.
export const rpc = Electroview.defineRPC<AppRPC>({
  handlers: {
    requests: {},
    messages: {},
  },
});
